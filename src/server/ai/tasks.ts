// AI tasks, independent of where the model runs. Each task is split in two server-side halves:
//   prepare → input from DB/GitHub cache + system prompt + user prompt + JSON schema
//   complete → JSON.parse + zod + drop URLs not in the input + cache in ai_briefs
// The model call in between happens either on the server (ollamaRunner.ts) or in the
// browser (prepareAi/submitAi actions). The AI explains, humans decide: no scores.
import { z } from "zod";
import { briefsRepo, projectsRepo, requestsRepo, trustRepo } from "../../db/repo";
import { userContributions, type Contribution } from "../github";
import { generate, SERVER_MODEL } from "./ollamaRunner";

export const PROMPT_VERSIONS = {
  brief: "brief-v1",
  triage: "triage-v2",
  discover: "discover-v1",
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
    json = JSON.parse(raw);
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

/** Cache → server model (retry once on invalid output). */
export async function runOnServer<Out>(p: Prepared<Out>, force = false): Promise<AiResult<Out>> {
  if (!force) {
    const hit = cachedResult(p, SERVER_MODEL);
    if (hit) return hit;
  }
  const spec = toSpec(p);
  let last: AiResult<Out> = { ok: false, error: { code: "invalid_output", message: "Model returned no usable output." } };
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await generate(spec.system, spec.prompt, spec.jsonSchema);
    } catch (err) {
      return {
        ok: false,
        error: { code: "model_unavailable", message: `Could not reach ${SERVER_MODEL} (${(err as Error).message}). No cached result yet.` },
      };
    }
    last = complete(p, raw, SERVER_MODEL);
    if (last.ok) return last;
  }
  return last;
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

const BriefSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.object({ text: z.string(), evidence_url: z.string() })),
  gaps: z.array(z.string()),
  areas: z.array(z.string()),
});
export type Brief = z.infer<typeof BriefSchema>;

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
    contributions: contributions.map(({ title, repo, kind, state, url }) => ({ title, repo, kind, state, url })),
    vouch_entries: vouches,
  };
  const urls = new Set(input.contributions.map((c) => c.url));
  return {
    subjectType: "user",
    subjectKey: login.toLowerCase(),
    promptVersion: PROMPT_VERSIONS.brief,
    input,
    schema: BriefSchema,
    system: sys(
      "You write short, factual contribution briefs about open-source contributors for maintainers. " +
      "summary: 2-3 sentences describing what the person works on. strengths: up to 4 items, each citing one evidence_url copied exactly from the input contributions. " +
      "gaps: what the data does not show (e.g. no reviews, no merged PRs). areas: short lowercase topic tags like docs, cli, tests.",
    ),
    prompt: `Data for GitHub user ${login}:\n${JSON.stringify(input, null, 1)}`,
    postprocess: (b: Brief) => ({
      ...b,
      strengths: b.strengths.filter((s) => urls.has(s.evidence_url)),
      areas: b.areas.slice(0, 8),
    }),
  };
}

export const contributionBrief = async (login: string, force = false) => runOnServer(await prepareBrief(login), force);

// ---------- 2. Request triage ----------

const TriageSchema = z.object({
  checks: z.array(z.object({ label: z.string(), ok: z.boolean(), evidence_url: z.string().nullable() })),
  draft_reply: z.string(),
});
export type Triage = z.infer<typeof TriageSchema>;

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
    requester_brief: brief.ok ? brief.data : null,
    vouch_entries_elsewhere: elsewhere,
    activity_in_this_repo: inRepo.map(({ title, kind, state, url }) => ({ title, kind, state, url })),
    has_activity_in_this_repo: inRepo.length > 0,
  };
  const urls = new Set<string>([
    ...contributions.map((c) => c.url),
    ...(brief.ok ? brief.data.strengths.map((s) => s.evidence_url) : []),
  ]);
  return {
    subjectType: "request",
    subjectKey: String(requestId),
    promptVersion: PROMPT_VERSIONS.triage,
    input,
    schema: TriageSchema,
    system: sys(
      "You help a maintainer read a vouch request. checks: 3-5 factual yes/no observations, e.g. 'Has prior activity in this repo', " +
      "'Vouched in other projects', 'Message names a specific planned contribution' (ok=false if vague), 'Not denounced in this repo or elsewhere' (ok=false if status_in_this_repo_vouched_file or any entry is denounced; quote the note). ok=false always means a concern or missing evidence. " +
      "evidence_url must be copied exactly from the input or null. draft_reply: a polite 1-3 sentence reply the maintainer can edit; it must not promise or refuse a vouch.",
    ),
    prompt: `Vouch request data:\n${JSON.stringify(input, null, 1)}`,
    postprocess: (t: Triage) => ({
      checks: t.checks.map((c) => ({ ...c, evidence_url: c.evidence_url && urls.has(c.evidence_url) ? c.evidence_url : null })),
      draft_reply: t.draft_reply,
    }),
  };
}

export async function requestTriage(requestId: number, force = false): Promise<AiResult<Triage>> {
  // Triage reads the requester's brief, so make sure it exists first.
  const req = requestsRepo.findById(requestId);
  if (!req) return { ok: false, error: { code: "not_found", message: `Request ${requestId} not found.` } };
  await contributionBrief(req.requester_login);
  return runOnServer((await prepareTriage(requestId, SERVER_MODEL))!, force);
}

// ---------- 3. Discover ----------

const FIT = ["strong", "good", "stretch"] as const;
const MatchSchema = z.object({
  project: z.string(),
  fit: z.enum(FIT),
  why: z.string(),
  issue_urls: z.array(z.string()),
});
const DiscoverSchema = z.object({ matches: z.array(MatchSchema) });
export type Match = z.infer<typeof MatchSchema>;

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
    good_first_issues: projectsRepo.issuesFor(p.id).map((i) => ({ title: i.title, url: i.url })),
  }));
  const input = { skills: normalized, hours_per_week: hoursPerWeek, projects };
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
      "issue_urls: only good_first_issues urls of that project from the input (may be empty).",
    ),
    prompt: `Contributor and indexed projects:\n${JSON.stringify(input, null, 1)}`,
    postprocess: ({ matches }: z.infer<typeof DiscoverSchema>) => {
      const seen = new Set<string>();
      const out: Match[] = [];
      for (const m of matches) {
        const p = byName.get(m.project.toLowerCase());
        if (!p || seen.has(p.project)) continue;
        seen.add(p.project);
        const allowed = new Set(p.good_first_issues.map((i) => i.url));
        out.push({ ...m, project: p.project, issue_urls: m.issue_urls.filter((u) => allowed.has(u)) });
      }
      return out.slice(0, 5);
    },
  };
}

export const discoverMatches = async (skills: string, hours: string, force = false) =>
  runOnServer(await prepareDiscover(skills, hours), force);
