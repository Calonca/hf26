"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTriage } from "@/server/actions/ai";
import { decideRequest } from "@/server/actions/pages";
import type { VouchRequest, Decision } from "@/db/repo";

const STATUS_LABEL: Record<string, string> = {
  open: "open",
  vouched: "vouched",
  more_info: "asked for more info",
  denounced: "denounced",
};
const statusClass = (s: string) => (s === "vouched" ? "chip chip-ok" : s === "denounced" ? "chip chip-warn" : "chip");

export function RequestList({ initial, project }: { initial: VouchRequest[]; project: string }) {
  const [requests, setRequests] = useState(initial);
  const [selectedId, setSelectedId] = useState<number | null>(
    initial.find((r) => r.status === "open")?.id ?? initial[0]?.id ?? null,
  );
  useEffect(() => {
    setRequests(initial);
    setSelectedId(initial.find((r) => r.status === "open")?.id ?? initial[0]?.id ?? null);
  }, [initial]);
  const selected = requests.find((r) => r.id === selectedId) ?? null;

  if (requests.length === 0) return <p className="muted">No vouch requests for this project.</p>;

  return (
    <div className="requests-layout">
      <ul className="request-items" aria-label="Vouch requests">
        {requests.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className={`request-item${r.id === selectedId ? " selected" : ""}`}
              aria-pressed={r.id === selectedId}
              onClick={() => setSelectedId(r.id)}
            >
              <span className="mono">@{r.requester_login}</span>
              <span className={statusClass(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>
              <span className="muted small request-snippet">{r.message.slice(0, 80)}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <RequestDetail
          key={selected.id}
          request={selected}
          project={project}
          onDecided={(u) => setRequests((rs) => rs.map((r) => (r.id === u.id ? u : r)))}
        />
      )}
    </div>
  );
}

function RequestDetail({
  request,
  project,
  onDecided,
}: {
  request: VouchRequest;
  project: string;
  onDecided: (r: VouchRequest) => void;
}) {
  const qc = useQueryClient();
  const key = ["triage", request.id];
  const triage = useQuery({ queryKey: key, queryFn: () => getTriage(request.id, false), staleTime: Infinity });
  const regen = useMutation({ mutationFn: () => getTriage(request.id, true), onSuccess: (r) => qc.setQueryData(key, r) });
  const [reply, setReply] = useState<string>(request.reply_text ?? "");
  const [confirmDenounce, setConfirmDenounce] = useState(false);
  const res = regen.isPending ? undefined : triage.data;
  const loading = triage.isLoading || regen.isPending;

  useEffect(() => {
    if (!request.reply_text && res?.ok) setReply((cur) => cur || res.data.draft_reply);
  }, [res, request.reply_text]);

  const decide = useMutation({
    mutationFn: (d: Decision) => decideRequest(request.id, d, reply || null),
    onSuccess: (u) => {
      setConfirmDenounce(false);
      if (u) onDecided(u);
    },
  });

  return (
    <section className="card request-detail" aria-labelledby={`req-${request.id}`}>
      <div className="card-head">
        <h2 id={`req-${request.id}`}>
          <Link href={`/u/${request.requester_login}`} className="mono">
            @{request.requester_login}
          </Link>{" "}
          <span className="muted small">wants to be vouched in</span> <span className="mono">{project}</span>
        </h2>
      </div>
      <blockquote className="request-message">{request.message}</blockquote>
      <p className="muted small">Requested {new Date(request.created_at).toLocaleString()}</p>

      <div className="card-head">
        <h3>What Gemma checked</h3>
        <button type="button" className="btn btn-ghost" onClick={() => regen.mutate()} disabled={loading}>
          {regen.isPending ? "Re-checking…" : "Re-check"}
        </button>
      </div>
      {loading && (
        <div aria-busy="true" aria-label="Gemma is checking the request">
          <div className="skeleton" style={{ height: 14, width: "80%" }} />
          <div className="skeleton" style={{ height: 14, width: "65%", marginTop: 8 }} />
          <div className="skeleton" style={{ height: 14, width: "70%", marginTop: 8 }} />
        </div>
      )}
      {!loading && res && !res.ok && (
        <div className="error-box" role="alert">
          <strong>{res.error.code === "model_unavailable" ? "Model unavailable" : "Invalid model output"}</strong>
          <p>{res.error.message}</p>
        </div>
      )}
      {!loading && res?.ok && (
        <ul className="checks">
          {res.data.checks.map((c, i) => (
            <li key={i}>
              <span className={c.ok ? "chip chip-ok" : "chip chip-warn"} aria-label={c.ok ? "yes" : "attention"}>
                {c.ok ? "✓" : "!"}
              </span>{" "}
              {c.label}
              {c.evidence_url && (
                <>
                  {" "}
                  <a href={c.evidence_url} target="_blank" rel="noreferrer" className="evidence-link">
                    evidence ↗
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <label className="field">
        <span>Reply to requester (editable draft)</span>
        <textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} />
      </label>

      {request.status !== "open" ? (
        <p>
          <span className={statusClass(request.status)}>{STATUS_LABEL[request.status]}</span> by{" "}
          <span className="mono">{request.decided_by}</span>
          {request.decided_at && <> on {new Date(request.decided_at).toLocaleString()}</>}
        </p>
      ) : null}

      <div className="decision-buttons">
        <button type="button" className="btn btn-primary" disabled={decide.isPending} onClick={() => decide.mutate("vouched")}>
          Vouch
        </button>
        <button type="button" className="btn" disabled={decide.isPending} onClick={() => decide.mutate("more_info")}>
          Ask for more info
        </button>
        {!confirmDenounce ? (
          <button type="button" className="btn btn-warn" disabled={decide.isPending} onClick={() => setConfirmDenounce(true)}>
            Denounce…
          </button>
        ) : (
          <span className="confirm-denounce" role="group" aria-label="Confirm denounce">
            <span>Denounce @{request.requester_login}?</span>
            <button type="button" className="btn btn-warn" onClick={() => decide.mutate("denounced")}>
              Yes, denounce
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDenounce(false)}>
              Cancel
            </button>
          </span>
        )}
      </div>
      {decide.error && <div className="error-box">{String(decide.error)}</div>}
      <p className="note-box">
        In production this would open a PR updating <span className="mono">VOUCHED.td</span>. Nothing is written to GitHub.
      </p>
    </section>
  );
}
