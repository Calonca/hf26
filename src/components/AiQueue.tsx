"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { JobView } from "@/server/ai/queue";

const since = (iso: string | null) => (iso ? `${Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))}s` : "");

/** Header button + panel listing model jobs that are running or waiting, each cancellable. */
export default function AiQueue() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const box = useRef<HTMLDivElement>(null);
  const { data: jobs = [] } = useQuery({
    queryKey: ["ai-queue"],
    queryFn: async (): Promise<JobView[]> => (await fetch("/api/ai/queue")).json(),
    refetchInterval: 1500,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const cancel = async (id: number) => {
    await fetch(`/api/ai/queue?id=${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["ai-queue"] });
  };
  const running = jobs.some((j) => j.state === "running");

  return (
    <div className="ai-queue" ref={box}>
      <button type="button" className={`ai-queue-btn${running ? " is-busy" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        AI queue · {jobs.length}
      </button>
      {open && (
        <div className="ai-queue-panel" role="dialog" aria-label="AI queue">
          {jobs.length === 0 ? (
            <p className="muted small">Nothing queued. Results are cached once generated.</p>
          ) : (
            <ul>
              {jobs.map((j) => (
                <li key={j.id}>
                  <div>
                    <strong>{j.label}</strong>
                    <span className="muted small">
                      {j.state === "running" ? `running · ${since(j.startedAt)}` : `queued #${j.position} · waiting ${since(j.createdAt)}`}
                    </span>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => cancel(j.id)}>
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
