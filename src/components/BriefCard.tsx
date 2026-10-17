"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runEdge } from "@/client/edgeAi";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
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
          <Badge tone="info" size="sm">
            written by {modelLabel(res && res.ok ? res.model : undefined)} · runs in your browser
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => regen.mutate()} disabled={loading} loading={regen.isPending}>
            Regenerate
          </Button>
        </div>
      </div>

      {loading && (
        <div className="stack">
          <Skeleton label="The model is writing the brief" lines={3} />
          <EdgeStatusLine>The model is reading public activity…</EdgeStatusLine>
        </div>
      )}
      {!loading && q.error && (
        <Alert tone="danger" title="Could not load brief" role="alert">
          {String(q.error)}
        </Alert>
      )}
      {!loading && res && !res.ok && (
        <Alert
          tone="warning"
          role="alert"
          title={res.error.code === "model_unavailable" ? "Model unavailable" : res.error.code === "not_found" ? "Not found" : "Invalid model output"}
        >
          {res.error.message}
        </Alert>
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
                <Badge key={a} tone="neutral" size="sm">
                  {a}
                </Badge>
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
