// Gemma 4 via Ollama. One function per task: prompt → JSON-schema-constrained chat → zod → cache.
// The AI explains, humans decide: no scores, no vouch/denounce recommendations.
import { Ollama } from "ollama";
import { z } from "zod";
import { briefsRepo, projectsRepo, requestsRepo, trustRepo } from "../db/repo";
import { userContributions, type Contribution } from "./github";

export const MODEL = process.env.OLLAMA_MODEL ?? "gemma4:e4b";
const ollama = new Ollama({ host: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434" });

export const PROMPT_VERSIONS = {
  brief: "brief-v1",
  triage: "triage-v1",
  discover: "discover-v1",
} as const;

const RULES =
  "Use only the data provided. If evidence is missing, say so. Do not rate or score the person. Do not recommend vouching or denouncing.";

export type AiError = { code: "model_unavailable" | "invalid_output"; message: string };
export type AiResult<T> =
  | { ok: true; data: T; cached: boolean; created_at: string; model: string }
  | { ok: false; error: AiError };

type Task<S extends z.ZodType, Out> = {
  subjectType: string;
  subjectKey: string;
  promptVersion: string;
  input: unknown;
  schema: S;
  system: string;
  prompt: string;
  postprocess: (raw: z.infer<S>) => Out;
  force?: boolean;
};

async function runTask<S extends z.ZodType, Out>(t: Task<S, Out>): Promise<AiResult<Out>> {
  const key = { subject_type: t.subjectType, subject_key: t.subjectKey, model: MODEL, prompt_version: t.promptVersion };
  if (!t.force) {
    const hit = briefsRepo.get(key);
    if (hit) return { ok: true, data: JSON.parse(hit.output_json) as Out, cached: true, created_at: hit.created_at, model: MODEL };
  }
  let lastError: AiError = { code: "invalid_output", message: "Model returned no usable output." };
  for (let attempt = 0; attempt < 2; attempt++) {
    let content: string;
    try {
      const res = await ollama.chat({
        model: MODEL,
        messages: [
          { role: "system", content: `${t.system}\n\n${RULES}\nRespond with JSON only.` },
          { role: "user", content: t.prompt },
        ],
        format: z.toJSONSchema(t.schema) as object,
        options: { temperature: 0.2 },
        stream: false,
      });
      content = res.message.content;
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "model_unavailable",
          message: `Could not reach ${MODEL} via Ollama (${(err as Error).message}). Start Ollama or pre-warm the cache.`,
        },
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      lastError = { code: "invalid_output", message: "Model output was not valid JSON." };
      continue;
    }
    const parsed = t.schema.safeParse(json);
    if (!parsed.success) {
      lastError = { code: "invalid_output", message: `Model output failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}` };
      continue;
    }
    const data = t.postprocess(parsed.data);
    const row = briefsRepo.put(key, t.input, data);
    return { ok: true, data, cached: false, created_at: row.created_at, model: MODEL };
  }
  return { ok: false, error: lastError };
}

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

export async function contributionBrief(login: string, force = false): Promise<AiResult<Brief>> {
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
  return runTask({
    subjectType: "user",
    subjectKey: login.toLowerCase(),
    promptVersion: PROMPT_VERSIONS.brief,
    input,
    schema: BriefSchema,
    force,
    system:
      "You write short, factual contribution briefs about open-source contributors for maintainers. " +
      "summary: 2-3 sentences describing what the person works on. strengths: up to 4 items, each citing one evidence_url copied exactly from the input contributions. " +
      "gaps: what the data does not show (e.g. no reviews, no merged PRs). areas: short lowercase topic tags like docs, cli, tests.",
    prompt: `Data for GitHub user ${login}:\n${JSON.stringify(input, null, 1)}`,
    postprocess: (b) => ({
      ...b,
      strengths: b.strengths.filter((s) => urls.has(s.evidence_url)),
      areas: b.areas.slice(0, 8),
    }),
  });
}

// ---------- 2. Request triage ----------

const TriageSchema = z.object({
  checks: z.array(z.object({ label: z.string(), ok: z.boolean(), evidence_url: z.string().nullable() })),
  draft_reply: z.string(),
});
export type Triage = z.infer<typeof TriageSchema>;

export async function requestTriage(requestId: number, force = false): Promise<AiResult<Triage>> {
  const req = requestsRepo.findById(requestId);
  if (!req) return { ok: false, error: { code: "invalid_output", message: `Request ${requestId} not found.` } };
  const project = projectsRepo.findById(req.project_id);
  const repo = project?.full_name ?? "";
  const brief = await contributionBrief(req.requester_login);
  const contributions = await safeContributions(req.requester_login);
  const inRepo = contributions.filter((c) => c.repo.toLowerCase() === repo.toLowerCase());
  const elsewhere = trustRepo
    .edgesForUser(req.requester_login)
    .filter((e) => e.project !== repo)
    .map((e) => ({ project: e.project, status: e.status, voucher: e.voucher ?? "unknown" }));
  const input = {
    project: repo,
    requester: req.requester_login,
    message: req.message,
    requester_brief: brief.ok ? brief.data : null,
    vouch_entries_elsewhere: elsewhere,
    activity_in_this_repo: inRepo.map(({ title, kind, state, url }) => ({ title, kind, state, url })),
    has_activity_in_this_repo: inRepo.length > 0,
  };
  const urls = new Set<string>([
    ...contributions.map((c) => c.url),
    ...(brief.ok ? brief.data.strengths.map((s) => s.evidence_url) : []),
  ]);
  return runTask({
    subjectType: "request",
    subjectKey: String(requestId),
    promptVersion: PROMPT_VERSIONS.triage,
    input,
    schema: TriageSchema,
    force,
    system:
      "You help a maintainer read a vouch request. checks: 3-5 factual yes/no observations, e.g. 'Has prior activity in this repo', " +
      "'Vouched in other projects', 'Message explains planned contribution', 'Denounced elsewhere' (ok=false when it is a concern or missing). " +
      "evidence_url must be copied exactly from the input or null. draft_reply: a polite 1-3 sentence reply the maintainer can edit; it must not promise or refuse a vouch.",
    prompt: `Vouch request data:\n${JSON.stringify(input, null, 1)}`,
    postprocess: (t) => ({
      checks: t.checks.map((c) => ({ ...c, evidence_url: c.evidence_url && urls.has(c.evidence_url) ? c.evidence_url : null })),
      draft_reply: t.draft_reply,
    }),
  });
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

export async function discoverMatches(skills: string, hoursPerWeek: string, force = false): Promise<AiResult<Match[]>> {
  const normalized = skills.toLowerCase().replace(/\s+/g, " ").trim();
  const projects = projectsRepo.list().map((p) => ({
    project: p.full_name,
    description: p.description,
    language: p.language,
    topics: JSON.parse(p.topics || "[]") as string[],
    good_first_issues: projectsRepo.issuesFor(p.id).map((i) => ({ title: i.title, url: i.url })),
  }));
  const input = { skills: normalized, hours_per_week: hoursPerWeek, projects };
  const byName = new Map(projects.map((p) => [p.project.toLowerCase(), p]));
  return runTask({
    subjectType: "discover",
    subjectKey: `${normalized}|${hoursPerWeek}`,
    promptVersion: PROMPT_VERSIONS.discover,
    input,
    schema: DiscoverSchema,
    force,
    system:
      "You match a contributor's skills and available time to open-source projects that use Vouch. Return the top 5 matches as {matches:[...]}. " +
      "project must be copied exactly from the input. fit is one word: strong, good or stretch. why: one sentence grounded in the project data. " +
      "issue_urls: only good_first_issues urls of that project from the input (may be empty).",
    prompt: `Contributor and indexed projects:\n${JSON.stringify(input, null, 1)}`,
    postprocess: ({ matches }) => {
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
  });
}
