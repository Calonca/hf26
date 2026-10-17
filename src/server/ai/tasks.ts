// AI tasks, independent of where the model runs. Each task is split in two server-side halves:
//   prepare → input from DB/GitHub cache + system prompt + user prompt + JSON schema
//   complete → JSON.parse + zod + drop URLs not in the input + cache in ai_briefs
// The model call in between runs in the browser (edge model, src/client/edgeAi.ts),
// via the prepareAi/submitAi actions. The AI explains, humans decide: no scores.
import { z } from "zod";
import { briefsRepo, projectsRepo, requestsRepo, trustRepo } from "../../db/repo";
import { userContributions, type Contribution } from "../github";

export const PROMPT_VERSIONS = {
  brief: "brief-v2",
  triage: "triage-v3",
  discover: "discover-v2",
} as const;

export const RULES =
  "Use only the data provided. If evidence is missing, say so. Do not rate or score the person. Do not recommend vouching or denouncing.";

export type AiError = { code: "model_unavailable" | "invalid_output" | "not_found"; message: string };
export type AiResult<T> =
  | { ok: true; data: T; cached: boolean; created_at: string; model: string }
  | { ok: false; error: AiError };

export type Prepared<Out> = {
  subjectType: string;
  subjectKey: string;
  promptVersion: string;
  input: unknown;
  schema: z.ZodType;
  system: string; // includes RULES
  prompt: string;
  postprocess: (raw: never) => Out;
};

/** What the browser needs to run the model itself. */
export type PromptSpec = { system: string; prompt: string; jsonSchema: object };
export const toSpec = (p: Prepared<unknown>): PromptSpec => ({
  system: p.system,
  prompt: p.prompt,
  jsonSchema: z.toJSONSchema(p.schema) as object,
});

const keyOf = (p: Prepared<unknown>, model: string) => ({
  subject_type: p.subjectType,
  subject_key: p.subjectKey,
  model,
  prompt_version: p.promptVersion,
});

/** Cached result for this model, if any. */
export function cachedResult<Out>(p: Prepared<Out>, model: string): AiResult<Out> | undefined {
  const hit = briefsRepo.get(keyOf(p, model));
  if (!hit) return undefined;
  return { ok: true, data: JSON.parse(hit.output_json) as Out, cached: true, created_at: hit.created_at, model };
}

/** Validate raw model text, keep only grounded URLs, store. */
export function complete<Out>(p: Prepared<Out>, raw: string, model: string): AiResult<Out> {
  let json: unknown;
  try {
    // Small models often wrap the JSON in a ```json fence or add a line around it.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    json = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
  } catch {
    return { ok: false, error: { code: "invalid_output", message: "Model output was not valid JSON." } };
  }
  const parsed = p.schema.safeParse(json);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "invalid_output", message: `Model output failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}` },
    };
  const data = p.postprocess(parsed.data as never);
  const row = briefsRepo.put(keyOf(p, model), p.input, data);
  return { ok: true, data, cached: false, created_at: row.created_at, model };
}

const sys = (task: string) => `${task}\n\n${RULES}\nRespond with JSON only.`;

async function safeContributions(login: string): Promise<Contribution[]> {
  try {
    return (await userContributions(login)).slice(0, 30);
  } catch {
    return [];
  }
}

// ---------- 1. Contribution brief ----------

// Small models copy long URLs badly, so inputs carry short ids ("c3") and postprocess maps them back to URLs.
const BriefSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.object({ text: z.string(), evidence_id: z.string() })).max(4),
  gaps: z.array(z.string()).max(4),
  areas: z.array(z.string()).max(8),
});
export type Brief = {
  summary: string;
  strengths: { text: string; evidence_url: string }[];
  gaps: string[];
  areas: string[];
};

export async function prepareBrief(login: string): Promise<Prepared<Brief>> {
  const contributions = await safeContributions(login);
  const vouches = trustRepo.edgesForUser(login).map((e) => ({
    project: e.project,
    status: e.status,
    voucher: e.voucher ?? "unknown",
    note: e.note,
  }));
  const input = {
    login,
    contributions: contributions.map(({ title, repo, kind, state }, i) => ({ id: `c${i + 1}`, title, repo, kind, state })),
    vouch_entries: vouches,
  };
  const urlOf = new Map(contributions.map((c, i) => [`c${i + 1}`, c.url]));
  return {
    subjectType: "user",
    subjectKey: login.toLowerCase(),
    promptVersion: PROMPT_VERSIONS.brief,
    input,
    schema: BriefSchema,
    system: sys(
      "You write short, factual contribution briefs about open-source contributors for maintainers. " +
      "summary: 2-3 sentences describing what the person works on. strengths: up to 4 items, each citing the id of one input contribution as evidence_id (e.g. \"c1\"). " +
      "gaps: what the data does not show (e.g. no reviews, no merged PRs). areas: short lowercase topic tags like docs, cli, tests.",
    ),
    prompt: `Data for GitHub user ${login}:\n${JSON.stringify(input)}`,
    postprocess: (b: z.infer<typeof BriefSchema>): Brief => ({
      ...b,
      strengths: b.strengths.flatMap((s) => {
        const url = urlOf.get(s.evidence_id.trim().toLowerCase());
        return url ? [{ text: s.text, evidence_url: url }] : [];
      }),
      areas: [...new Set(b.areas.map((a) => a.toLowerCase()))],
    }),
  };
}

// ---------- 2. Request triage ----------

const TriageSchema = z.object({
  checks: z.array(z.object({ label: z.string(), ok: z.boolean(), evidence_id: z.string().nullable() })).max(5),
  draft_reply: z.string(),
});
export type Triage = { checks: { label: string; ok: boolean; evidence_url: string | null }[]; draft_reply: string };

/** `brief` is the requester's cached contribution brief, if one exists (never generated here). */
export async function prepareTriage(requestId: number, model: string): Promise<Prepared<Triage> | null> {
  const req = requestsRepo.findById(requestId);
  if (!req) return null;
  const project = projectsRepo.findById(req.project_id);
  const repo = project?.full_name ?? "";
  const brief = cachedResult(await prepareBrief(req.requester_login), model) ?? { ok: false as const };
  const contributions = await safeContributions(req.requester_login);
  const inRepo = contributions.filter((c) => c.repo.toLowerCase() === repo.toLowerCase());
  const edges = trustRepo.edgesForUser(req.requester_login);
  const here = edges.find((e) => e.project === repo);
  const elsewhere = edges
    .filter((e) => e.project !== repo)
    .map((e) => ({ project: e.project, status: e.status, voucher: e.voucher ?? "unknown" }));
  const input = {
    project: repo,
    requester: req.requester_login,
    message: req.message,
    status_in_this_repo_vouched_file: here ? { status: here.status, note: here.note } : "not listed",
    requester_brief: brief.ok
      ? { ...brief.data, strengths: brief.data.strengths.map((s, i) => ({ id: `b${i + 1}`, text: s.text })) }
      : null,
    vouch_entries_elsewhere: elsewhere,
    activity_in_this_repo: inRepo.map(({ title, kind, state }, i) => ({ id: `a${i + 1}`, title, kind, state })),
    has_activity_in_this_repo: inRepo.length > 0,
  };
  const urlOf = new Map<string, string>([
    ...inRepo.map((c, i) => [`a${i + 1}`, c.url] as const),
    ...(brief.ok ? brief.data.strengths.map((s, i) => [`b${i + 1}`, s.evidence_url] as const) : []),
  ]);
  return {
    subjectType: "request",
    subjectKey: `${requestId}:${req.requester_login}:${req.created_at}`, // ids can be reused after re-seeding
    promptVersion: PROMPT_VERSIONS.triage,
    input,
    schema: TriageSchema,
    system: sys(
      "You help a maintainer read a vouch request. checks: 3-5 factual yes/no observations, e.g. 'Has prior activity in this repo', " +
      "'Vouched in other projects', 'Message names a specific planned contribution' (ok=false if vague), 'Not denounced in this repo or elsewhere' (ok=false if status_in_this_repo_vouched_file or any entry is denounced; quote the note). ok=false always means a concern or missing evidence. " +
      "evidence_id: the id of one input activity (a1...) or brief strength (b1...), or null. draft_reply: a polite 1-3 sentence reply the maintainer can edit; it must not promise or refuse a vouch.",
    ),
    prompt: `Vouch request data:\n${JSON.stringify(input)}`,
    postprocess: (t: z.infer<typeof TriageSchema>): Triage => ({
      checks: t.checks.map(({ label, ok, evidence_id }) => ({
        label,
        ok,
        evidence_url: (evidence_id && urlOf.get(evidence_id.trim().toLowerCase())) || null,
      })),
      draft_reply: t.draft_reply,
    }),
  };
}

// ---------- 3. Discover ----------

const FIT = ["strong", "good", "stretch"] as const;
const MatchSchema = z.object({
  project: z.string(),
  fit: z.enum(FIT),
  why: z.string(),
  issue_ids: z.array(z.string()).max(3),
});
const DiscoverSchema = z.object({ matches: z.array(MatchSchema).max(5) });
export type Match = { project: string; fit: (typeof FIT)[number]; why: string; issue_urls: string[] };

const MAX_CANDIDATES = 25;

/** Cheap keyword pre-filter so the prompt fits a small (possibly in-browser) model's context. */
function candidates(skills: string) {
  const words = new Set(skills.split(/[^a-z0-9+#.]+/).filter((w) => w.length > 1));
  const scoreOf = (p: ReturnType<typeof projectsRepo.list>[number]) => {
    const hay = `${p.full_name} ${p.description ?? ""} ${p.language ?? ""} ${p.topics}`.toLowerCase();
    let n = 0;
    for (const w of words) if (hay.includes(w)) n++;
    return n + (projectsRepo.hasIssues(p.id) ? 0.5 : 0);
  };
  return projectsRepo
    .list()
    .map((p) => ({ p, s: scoreOf(p) }))
    .sort((a, b) => b.s - a.s || b.p.stars - a.p.stars)
    .slice(0, MAX_CANDIDATES)
    .map((x) => x.p);
}

export async function prepareDiscover(skills: string, hoursPerWeek: string): Promise<Prepared<Match[]>> {
  const normalized = skills.toLowerCase().replace(/\s+/g, " ").trim();
  const projects = candidates(normalized).map((p) => ({
    project: p.full_name,
    description: p.description,
    language: p.language,
    topics: JSON.parse(p.topics || "[]") as string[],
    issues: projectsRepo.issuesFor(p.id),
  }));
  const urlOf = new Map<string, { project: string; url: string }>(projects.flatMap((p) => p.issues.map((i) => [`i${i.id}`, { project: p.project, url: i.url }] as const)));
  const forModel = projects.map(({ issues, ...p }) => ({
    ...p,
    good_first_issues: issues.map((i) => ({ id: `i${i.id}`, title: i.title })),
  }));
  const input = { skills: normalized, hours_per_week: hoursPerWeek, projects: forModel };
  const byName = new Map(projects.map((p) => [p.project.toLowerCase(), p]));
  return {
    subjectType: "discover",
    subjectKey: `${normalized}|${hoursPerWeek}`,
    promptVersion: PROMPT_VERSIONS.discover,
    input,
    schema: DiscoverSchema,
    system: sys(
      "You match a contributor's skills and available time to open-source projects that use Vouch. Return the top 5 matches as {matches:[...]}. " +
      "project must be copied exactly from the input. fit is one word: strong, good or stretch. why: one sentence grounded in the project data. " +
      "issue_ids: up to 3 ids of that project's good_first_issues from the input (may be empty).",
    ),
    prompt: `Contributor and indexed projects:\n${JSON.stringify(input)}`,
    postprocess: ({ matches }: z.infer<typeof DiscoverSchema>) => {
      const seen = new Set<string>();
      const out: Match[] = [];
      for (const m of matches) {
        const p = byName.get(m.project.toLowerCase());
        if (!p || seen.has(p.project)) continue;
        seen.add(p.project);
        const issue_urls = m.issue_ids.flatMap((id) => {
          const hit = urlOf.get(id.trim().toLowerCase());
          return hit && hit.project === p.project ? [hit.url] : [];
        });
        out.push({ project: p.project, fit: m.fit, why: m.why, issue_urls });
      }
      return out.slice(0, 5);
    },
  };
}

