"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBrief } from "@/server/actions/ai";
import { EvidenceList } from "./EvidenceList";

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
    <section className="card brief-card" aria-labelledby="brief-title" aria-busy={loading}>
      <div className="card-head">
        <h2 id="brief-title">Contribution brief</h2>
        <button type="button" className="btn btn-ghost" onClick={() => regen.mutate()} disabled={loading}>
          {regen.isPending ? "Regenerating…" : "Regenerate"}
        </button>
      </div>
      {loading && (
        <div aria-label="Gemma is writing the brief">
          <div className="skeleton" style={{ height: 16, width: "90%" }} />
          <div className="skeleton" style={{ height: 16, width: "75%", marginTop: 8 }} />
          <div className="skeleton" style={{ height: 16, width: "60%", marginTop: 8 }} />
          <p className="muted small">Gemma is reading public activity…</p>
        </div>
      )}
      {!loading && q.error && <div className="error-box">Could not load brief: {String(q.error)}</div>}
      {!loading && res && !res.ok && (
        <div className="error-box" role="alert">
          <strong>{res.error.code === "model_unavailable" ? "Model unavailable" : "Invalid model output"}</strong>
          <p>{res.error.message}</p>
        </div>
      )}
      {!loading && res && res.ok && (
        <>
          <p className="brief-summary">{res.data.summary}</p>
          <h3>Strengths, with evidence</h3>
          <EvidenceList items={res.data.strengths} />
          {res.data.gaps.length > 0 && (
            <>
              <h3>What the data does not show</h3>
              <ul>
                {res.data.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </>
          )}
          {res.data.areas.length > 0 && (
            <div className="areas" aria-label="Areas">
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
    </section>
  );
}
