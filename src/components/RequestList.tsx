"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runEdge } from "@/client/edgeAi";
import type { Brief, Triage } from "@/server/ai/tasks";
import { decideRequest } from "@/server/actions/pages";
import type { VouchRequest, Decision } from "@/db/repo";
import { EdgeStatusLine } from "./EdgeStatusLine";
import { SampleChip } from "./SampleChip";

// Triage reads the requester's cached brief, so generate that first.
async function getTriage(request: VouchRequest, force: boolean) {
  await runEdge<Brief>({ kind: "brief", login: request.requester_login });
  return runEdge<Triage>({ kind: "triage", requestId: request.id }, force);
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  vouched: "Vouched",
  more_info: "Asked for more info",
  denounced: "Denounced",
};
const statusClass = (s: string) => (s === "vouched" ? "chip chip-ok" : s === "denounced" ? "chip chip-warn" : "chip");
const firstLine = (m: string) => {
  const line = m.split(/\r?\n|(?<=[.!?])\s/)[0];
  return line.length > 70 ? `${line.slice(0, 68)}…` : line;
};

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.5" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.5" aria-hidden="true">
      <path d="M12 8v5M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function RequestList({ initial, project, isSeed }: { initial: VouchRequest[]; project: string; isSeed: boolean }) {
  const [requests, setRequests] = useState(initial);
  const [selectedId, setSelectedId] = useState<number | null>(
    initial.find((r) => r.status === "open")?.id ?? initial[0]?.id ?? null,
  );
  const selected = requests.find((r) => r.id === selectedId) ?? null;
  const open = requests.filter((r) => r.status === "open");
  const decided = requests.filter((r) => r.status !== "open");

  if (requests.length === 0) return <p className="muted">No vouch requests for this project.</p>;

  const item = (r: VouchRequest) => (
    <li key={r.id}>
      <button
        type="button"
        className={`req-item${r.id === selectedId ? " is-selected" : ""}`}
        aria-pressed={r.id === selectedId}
        onClick={() => setSelectedId(r.id)}
      >
        <span className="req-item-top">
          <strong>@{r.requester_login}</strong>
          {r.status !== "open" && <span className={statusClass(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>}
        </span>
        <span className="muted small">{firstLine(r.message)}</span>
      </button>
    </li>
  );

  return (
    <div className="req-layout">
      <section className="card req-list" aria-label="Vouch requests">
        <h2 className="req-list-heading">Open · {open.length}</h2>
        {open.length === 0 ? <p className="muted small req-empty">Nothing open.</p> : <ul>{open.map(item)}</ul>}
        {decided.length > 0 && (
          <>
            <h2 className="req-list-heading">Decided · {decided.length}</h2>
            <ul>{decided.map(item)}</ul>
          </>
        )}
      </section>
      {selected && (
        <RequestDetail
          key={selected.id}
          request={selected}
          project={project}
          isSeed={isSeed}
          onDecided={(u) => setRequests((rs) => rs.map((r) => (r.id === u.id ? u : r)))}
        />
      )}
    </div>
  );
}

function RequestDetail({
  request,
  project,
  isSeed,
  onDecided,
}: {
  request: VouchRequest;
  project: string;
  isSeed: boolean;
  onDecided: (r: VouchRequest) => void;
}) {
  const qc = useQueryClient();
  const key = ["triage", request.id];
  const triage = useQuery({ queryKey: key, queryFn: () => getTriage(request, false), staleTime: Infinity });
  const regen = useMutation({ mutationFn: () => getTriage(request, true), onSuccess: (r) => qc.setQueryData(key, r) });
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
    <section className="card req-detail" aria-labelledby={`req-${request.id}`}>
      <div className="req-detail-head">
        <h2 id={`req-${request.id}`}>
          <Link href={`/u/${request.requester_login}`}>@{request.requester_login}</Link> wants to contribute
        </h2>
        <SampleChip show={isSeed} label="Demo request" />
      </div>
      <blockquote className="req-message">“{request.message}”</blockquote>
      <p className="muted small">
        To <span className="mono">{project}</span> · requested {new Date(request.created_at).toLocaleString()}
      </p>

      <div className="req-brief">
        <div className="req-brief-head">
          <h3>AI brief</h3>
          <span className="req-badge mono">public data · in-browser model</span>
          <button type="button" className="btn btn-ghost req-recheck" onClick={() => regen.mutate()} disabled={loading}>
            {regen.isPending ? "Re-checking…" : "Re-check"}
          </button>
        </div>
        {loading && (
          <div className="req-checks" aria-busy="true" aria-label="The model is checking the request">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="req-check">
                <div className="skeleton" style={{ height: 14, width: "85%" }} />
              </div>
            ))}
            <EdgeStatusLine>The model is checking the request…</EdgeStatusLine>
          </div>
        )}
        {!loading && res && !res.ok && (
          <div className="error-box" role="alert">
            <strong>{res.error.code === "model_unavailable" ? "Model unavailable" : "Could not read the model output"}</strong>
            <p>{res.error.message} You can still decide below.</p>
          </div>
        )}
        {!loading && res?.ok && (
          <ul className="req-checks">
            {res.data.checks.map((c, i) => (
              <li key={i} className={`req-check${c.ok ? "" : " is-warn"}`}>
                {c.ok ? <CheckIcon /> : <WarnIcon />}
                <span>
                  <span className="sr-only">{c.ok ? "Yes: " : "Needs attention: "}</span>
                  {c.label}
                  {c.evidence_url && (
                    <>
                      {" "}
                      <a href={c.evidence_url} target="_blank" rel="noreferrer" className="small">
                        evidence ↗
                      </a>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="req-reply">
        <label htmlFor={`reply-${request.id}`}>Draft reply</label>
        <textarea id={`reply-${request.id}`} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
      </div>

      {request.status !== "open" && (
        <p className="req-decided">
          <span className={statusClass(request.status)}>{STATUS_LABEL[request.status]}</span> by{" "}
          <span className="mono">{request.decided_by}</span>
          {request.decided_at && <> · {new Date(request.decided_at).toLocaleString()}</>}
        </p>
      )}

      <div className="req-actions">
        <button type="button" className="btn req-btn-vouch" disabled={decide.isPending} onClick={() => decide.mutate("vouched")}>
          Vouch
        </button>
        <button type="button" className="btn req-btn-info" disabled={decide.isPending} onClick={() => decide.mutate("more_info")}>
          Ask for more info
        </button>
        {!confirmDenounce ? (
          <button
            type="button"
            className="btn req-btn-denounce"
            disabled={decide.isPending}
            onClick={() => setConfirmDenounce(true)}
          >
            Denounce…
          </button>
        ) : (
          <span className="req-confirm" role="group" aria-label="Confirm denounce">
            <span>Denounce @{request.requester_login}?</span>
            <button type="button" className="btn req-btn-denounce-confirm" onClick={() => decide.mutate("denounced")}>
              Yes, denounce
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDenounce(false)}>
              Cancel
            </button>
          </span>
        )}
      </div>
      {decide.error && <div className="error-box">{String(decide.error)}</div>}
      <p className="muted small req-footnote">
        In production your decision would open a PR updating <span className="mono">VOUCHED.td</span> — nothing is written
        to GitHub today. The AI only summarizes; it never acts on its own.
      </p>
    </section>
  );
}
