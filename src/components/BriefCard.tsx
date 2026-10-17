"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBrief } from "@/server/actions/ai";
import { EvidenceList } from "./EvidenceList";

/** "gemma4:e4b" → "Gemma 4" */
function modelName(model: string) {
  const m = model.match(/^gemma(\d+)/i);
  return m ? `Gemma ${m[1]}` : model;
}

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
            written by {res && res.ok ? modelName(res.model) : "Gemma 4"} · runs locally
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => regen.mutate()} disabled={loading}>
            {regen.isPending ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      {loading && (
        <div role="status" aria-label="Gemma is writing the brief">
          <div className="skeleton" style={{ height: 16, width: "92%" }} />
          <div className="skeleton" style={{ height: 16, width: "80%", marginTop: 8 }} />
          <div className="skeleton" style={{ height: 16, width: "64%", marginTop: 8 }} />
          <p className="muted small">Gemma is reading public activity…</p>
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
