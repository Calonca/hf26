"use server";
import {
  cachedResult,
  complete,
  prepareBrief,
  prepareDiscover,
  prepareTriage,
  toSpec,
  type AiResult,
  type Prepared,
  type PromptSpec,
} from "../ai/tasks";

// The model runs in the browser (src/client/edgeAi.ts): prepareAi → edge model in a worker → submitAi.

export type AiTask =
  | { kind: "brief"; login: string }
  | { kind: "triage"; requestId: number }
  | { kind: "discover"; skills: string; hours: string };

async function prepare(task: AiTask, model: string): Promise<Prepared<unknown> | null> {
  switch (task.kind) {
    case "brief":
      return prepareBrief(task.login);
    case "triage":
      return prepareTriage(task.requestId, model);
    case "discover":
      return prepareDiscover(task.skills, task.hours);
  }
}

/** Returns the cached result for `model`, or the prompt + JSON schema for the browser to run. */
export async function prepareAi(
  task: AiTask,
  model: string,
  force = false,
): Promise<{ cached: AiResult<unknown> } | { spec: PromptSpec } | { error: string }> {
  const p = await prepare(task, model);
  if (!p) return { error: "Not found." };
  const hit = force ? undefined : cachedResult(p, model);
  return hit ? { cached: hit } : { spec: toSpec(p) };
}

/** Validates the browser's raw model output on the server (zod + grounded URLs) and caches it. */
export async function submitAi(task: AiTask, model: string, raw: string): Promise<AiResult<unknown>> {
  const p = await prepare(task, model);
  if (!p) return { ok: false, error: { code: "not_found", message: "Not found." } };
  return complete(p, raw, model);
}

