"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runEdge } from "@/client/edgeAi";
import { modelLabel } from "@/lib/edgeModel";
import type { Brief } from "@/server/ai/tasks";
import { EdgeStatusLine } from "./EdgeStatusLine";
import { EvidenceList } from "./EvidenceList";

const getBrief = (login: string, force: boolean) => runEdge<Brief>({ kind: "brief", login }, force);

export function BriefCard({ login }: { login: string }) {
  const qc = useQueryClient();
  const key = ["brief", login.toLowerCase()];
  const q = useQuery({ queryKey: key, queryFn: () => getBrief(login, false), staleTime: Infinity });
  const regen = useMutation({
    mutationFn: () => getBrief(login, true),
    onSuccess: (res) => qc.setQueryData(key, res),
  });
  const res = regen.isPending ? undefined : q.data;
  const loading = q.isLoading || regen.isPending;

  return (
    <section className="card profile-section brief-card" aria-labelledby="brief-title" aria-busy={loading}>
      <div className="brief-head">
        <h2 id="brief-title">Contribution brief</h2>
        <div className="brief-actions">
          <span className="brief-badge mono">
            written by {modelLabel(res && res.ok ? res.model : undefined)} · runs in your browser
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => regen.mutate()} disabled={loading}>
            {regen.isPending ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      {loading && (
        <div role="status" aria-label="The model is writing the brief">
          <div className="skeleton" style={{ height: 16, width: "92%" }} />
          <div className="skeleton" style={{ height: 16, width: "80%", marginTop: 8 }} />
          <div className="skeleton" style={{ height: 16, width: "64%", marginTop: 8 }} />
          <EdgeStatusLine>The model is reading public activity…</EdgeStatusLine>
        </div>
      )}
      {!loading && q.error && (
        <div className="error-box" role="alert">
          Could not load brief: {String(q.error)}
        </div>
      )}
      {!loading && res && !res.ok && (
        <div className="error-box" role="alert">
          <strong>{res.error.code === "model_unavailable" ? "Model unavailable" : res.error.code === "not_found" ? "Not found" : "Invalid model output"}</strong>
          <p>{res.error.message}</p>
        </div>
      )}
      {!loading && res && res.ok && (
        <>
          <p className="brief-summary">{res.data.summary}</p>
          <div className="brief-block">
            <h3>Evidence</h3>
            <EvidenceList items={res.data.strengths} />
          </div>
          {res.data.gaps.length > 0 && (
            <div className="brief-block">
              <h3>What the data does not show</h3>
              <ul className="brief-gaps">
                {res.data.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {res.data.areas.length > 0 && (
            <div className="brief-areas" aria-label="Areas">
              {res.data.areas.map((a) => (
                <span key={a} className="chip">
                  {a}
                </span>
              ))}
            </div>
          )}
          <p className="muted small">
            <span className="mono">{res.model}</span> · {res.cached ? "cached" : "generated"}{" "}
            {new Date(res.created_at).toLocaleString()}
          </p>
        </>
      )}

      <p className="brief-footer">
        This brief explains public activity. It is not a score and never vouches or denounces anyone — maintainers decide.
      </p>
    </section>
  );
}
