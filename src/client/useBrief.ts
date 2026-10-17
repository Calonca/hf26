"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BriefRequest } from "@/lib/brief";
import type { WorkerIn, WorkerOut } from "./briefWorker";

export type BriefState =
  | { status: "idle" }
  | { status: "loading-model"; progress: number }
  | { status: "generating"; text: string }
  | { status: "done"; text: string; cached: boolean }
  | { status: "error"; message: string };

// One worker per tab, shared by every component, so the model loads once.
let worker: Worker | undefined;
function getWorker() {
  return (worker ??= new Worker(new URL("./briefWorker.ts", import.meta.url), { type: "module" }));
}
let nextId = 0;

/** Brief for one subject: served from the server cache, otherwise generated in the browser and cached. */
export function useBrief() {
  const [state, setState] = useState<BriefState>({ status: "idle" });
  const current = useRef<number | null>(null);

  useEffect(() => {
    const w = getWorker();
    const files = new Map<string, { loaded: number; total: number }>();
    const onMessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === "progress") {
        files.set(m.file, m);
        let loaded = 0, total = 0;
        for (const f of files.values()) (loaded += f.loaded), (total += f.total);
        if (current.current !== null) setState({ status: "loading-model", progress: total ? loaded / total : 0 });
        return;
      }
      if (m.type === "ready") return;
      if (m.id !== current.current) return;
      if (m.type === "token") setState((s) => ({ status: "generating", text: (s.status === "generating" ? s.text : "") + m.text }));
      else if (m.type === "error") setState({ status: "error", message: m.message });
      else if (m.type === "done") setState({ status: "done", text: m.text, cached: false });
    };
    w.addEventListener("message", onMessage);
    return () => w.removeEventListener("message", onMessage);
  }, []);

  const run = useCallback(async (req: BriefRequest) => {
    const id = ++nextId;
    current.current = id;
    const key = new URLSearchParams({ subject_type: req.subject_type, subject_key: req.subject_key });
    const hit = await fetch(`/api/briefs?${key}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (current.current !== id) return;
    if (hit) return setState({ status: "done", text: hit.text, cached: true });

    setState({ status: "loading-model", progress: 0 });
    const w = getWorker();
    const done = new Promise<string>((resolve) => {
      const onDone = (e: MessageEvent<WorkerOut>) => {
        if (e.data.type === "done" && e.data.id === id) (w.removeEventListener("message", onDone), resolve(e.data.text));
      };
      w.addEventListener("message", onDone);
    });
    w.postMessage({ type: "generate", id, req } satisfies WorkerIn);
    const text = await done;
    await fetch("/api/briefs", { method: "POST", body: JSON.stringify({ ...req, text }) }).catch(() => {});
  }, []);

  const stop = useCallback(() => getWorker().postMessage({ type: "interrupt" } satisfies WorkerIn), []);

  return { state, run, stop };
}
