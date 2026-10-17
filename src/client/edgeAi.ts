"use client";
// Edge AI: prepareAi (server) → edge model in a Web Worker (browser) → submitAi (server validates + caches).
import { useSyncExternalStore } from "react";
import { prepareAi, submitAi, type AiTask } from "@/server/actions/ai";
import type { AiResult } from "@/server/ai/tasks";
import { EDGE_MODEL } from "@/lib/edgeModel";
import type { WorkerIn, WorkerOut } from "./edgeWorker";

export type EdgeStatus =
  | { phase: "idle" }
  | { phase: "downloading"; progress: number }
  | { phase: "generating"; device: "webgpu" | "wasm" | null };

// --- status store shared by every component ---

let status: EdgeStatus = { phase: "idle" };
const listeners = new Set<() => void>();
function setStatus(s: EdgeStatus) {
  status = s;
  listeners.forEach((l) => l());
}
const IDLE: EdgeStatus = { phase: "idle" };

export function useEdgeStatus() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => status,
    () => IDLE,
  );
}

// --- one worker per tab, so the model loads once ---

let worker: Worker | undefined;
let device: "webgpu" | "wasm" | null = null;
const files = new Map<string, { loaded: number; total: number }>();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./edgeWorker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (e: MessageEvent<WorkerOut>) => {
    const m = e.data;
    if (m.type === "progress") {
      files.set(m.file, m);
      let loaded = 0, total = 0;
      for (const f of files.values()) (loaded += f.loaded), (total += f.total);
      setStatus({ phase: "downloading", progress: total ? loaded / total : 0 });
    } else if (m.type === "ready") {
      device = m.device;
      setStatus({ phase: "generating", device });
    } else if (m.type === "token" && status.phase !== "generating") {
      setStatus({ phase: "generating", device });
    }
  });
  return worker;
}

let nextId = 0;
function generate(msg: Extract<WorkerIn, { type: "generate" }>) {
  const w = getWorker();
  return new Promise<string>((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (!("id" in m) || m.id !== msg.id) return;
      if (m.type === "done") (w.removeEventListener("message", onMessage), resolve(m.text));
      else if (m.type === "error") (w.removeEventListener("message", onMessage), reject(new Error(m.message)));
    };
    w.addEventListener("message", onMessage);
    w.postMessage(msg);
  });
}

// The worker runs one generation at a time.
let queue: Promise<unknown> = Promise.resolve();

/** Cached result from the server, otherwise generated in the browser (retry once on invalid output). */
export function runEdge<T>(task: AiTask, force = false): Promise<AiResult<T>> {
  const job = queue.then(async (): Promise<AiResult<T>> => {
    const prep = await prepareAi(task, EDGE_MODEL, force);
    if ("error" in prep) return { ok: false, error: { code: "not_found", message: prep.error } };
    if ("cached" in prep) return prep.cached as AiResult<T>;
    let last: AiResult<T> = { ok: false, error: { code: "invalid_output", message: "Model returned no usable output." } };
    try {
      setStatus({ phase: "generating", device });
      for (let attempt = 0; attempt < 2; attempt++) {
        let raw: string;
        try {
          raw = await generate({ type: "generate", id: ++nextId, spec: prep.spec });
        } catch (err) {
          return {
            ok: false,
            error: { code: "model_unavailable", message: `Could not run ${EDGE_MODEL} in this browser (${(err as Error).message}).` },
          };
        }
        last = (await submitAi(task, EDGE_MODEL, raw)) as AiResult<T>;
        if (last.ok) return last;
      }
      return last;
    } finally {
      setStatus(IDLE);
    }
  });
  queue = job.catch(() => {});
  return job;
}
