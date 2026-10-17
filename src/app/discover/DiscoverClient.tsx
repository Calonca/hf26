"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getMatches } from "@/server/actions/ai";
import { ProjectCard } from "@/components/ProjectCard";

type Meta = { full_name: string; is_seed: number; contributing_url: string | null };

const HOURS = ["1–2", "3–5", "6–10", "10+"];

export function DiscoverClient({ projects }: { projects: Meta[] }) {
  const [skills, setSkills] = useState("TypeScript, React, writing docs");
  const [hours, setHours] = useState(HOURS[1]);
  const meta = new Map(projects.map((p) => [p.full_name, p]));
  const run = useMutation({ mutationFn: (force: boolean) => getMatches(skills, hours, force) });
  const res = run.data;

  return (
    <>
      <form
        className="card discover-form"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate(false);
        }}
      >
        <label className="field">
          <span>Your skills and interests</span>
          <textarea rows={3} value={skills} onChange={(e) => setSkills(e.target.value)} required />
        </label>
        <label className="field">
          <span>Time per week (hours)</span>
          <select value={hours} onChange={(e) => setHours(e.target.value)}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h} hours
              </option>
            ))}
          </select>
        </label>
        <div className="decision-buttons">
          <button type="submit" className="btn btn-primary" disabled={run.isPending}>
            {run.isPending ? "Matching…" : "Find projects"}
          </button>
          {res?.ok && (
            <button type="button" className="btn btn-ghost" disabled={run.isPending} onClick={() => run.mutate(true)}>
              Regenerate
            </button>
          )}
        </div>
      </form>

      {run.isPending && (
        <div className="grid-2" aria-busy="true" aria-label="Gemma is ranking projects">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="skeleton" style={{ height: 18, width: "50%" }} />
              <div className="skeleton" style={{ height: 14, width: "90%", marginTop: 10 }} />
              <div className="skeleton" style={{ height: 14, width: "70%", marginTop: 8 }} />
            </div>
          ))}
        </div>
      )}
      {run.error && <div className="error-box">{String(run.error)}</div>}
      {!run.isPending && res && !res.ok && (
        <div className="error-box" role="alert">
          <strong>{res.error.code === "model_unavailable" ? "Model unavailable" : "Invalid model output"}</strong>
          <p>{res.error.message}</p>
        </div>
      )}
      {!run.isPending && res?.ok && (
        <>
          {res.data.length === 0 && <p className="muted">No matching projects in the index.</p>}
          <div className="grid-2">
            {res.data.map((m) => {
              const p = meta.get(m.project);
              return (
                <ProjectCard
                  key={m.project}
                  {...m}
                  is_seed={p?.is_seed === 1}
                  contributing_url={p?.contributing_url ?? null}
                />
              );
            })}
          </div>
          <p className="muted small">
            <span className="mono">{res.model}</span> · {res.cached ? "cached" : "generated"}{" "}
            {new Date(res.created_at).toLocaleString()}
          </p>
        </>
      )}
    </>
  );
}
