import Link from "next/link";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Input } from "@/components/arc/input/input";
import SampleChip from "@/components/SampleChip";
import TrustGraph from "@/components/TrustGraph";
import { exploreSearch, indexStats } from "@/server/actions/explore";

export const dynamic = "force-dynamic";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
const VERB = { vouch: "vouched", denounce: "denounced", remove: "removed" } as Record<string, string>;
const fmt = (n: number) => n.toLocaleString("en-US");

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const stats = await indexStats();
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? process.env.NEXT_PUBLIC_DEMO_USER ?? "Calonca").trim().replace(/^@/, "");
  const result = q ? await exploreSearch(q) : null;
  const anySeed = !!result?.edges.some((e) => e.is_seed);
  const title = result ? (result.kind === "user" ? `@${result.q}` : result.q) : "";

  return (
    <div className="container">
      <section className="hero">
        <h1>Who is trusted where?</h1>
        <p>
          A map of public <span className="mono">VOUCHED.td</span> files across GitHub — the web of trust Vouch hopes for, made
          visible.
        </p>
        <form className="search-form" action="/" method="get" role="search">
          <Input
            id="q"
            name="q"
            label="GitHub handle or project"
            defaultValue={q ? (result?.kind === "user" ? `@${q}` : q) : ""}
            placeholder="@handle or owner/repo"
            autoComplete="off"
          />
          <Button type="submit">Map trust</Button>
          <Button type="submit" variant="secondary" formAction="/profile">
            Show profile
          </Button>
        </form>
        {stats.suggestions.length > 0 && (
          <div className="row small muted">
            <span>Try:</span>
            {stats.suggestions.slice(0, 6).map((s) => (
              <Link key={s} className="mono" href={`/?q=${encodeURIComponent(s)}`}>@{s}</Link>
            ))}
            <Link className="mono" href="/?q=Calonca/hf26">Calonca/hf26</Link>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="stack" aria-label="Trust graph">
          {result && result.edges.length > 0 ? (
            <>
              <div className="card">
                <div className="card-head">
                  <h2>
                    Trust graph · <span className={result.kind === "project" ? "mono" : undefined}>{title}</span>
                    <span className="muted small" style={{ fontWeight: 400 }}>
                      {" "}· {result.kind === "user" ? `listed in ${result.edges.length} project${result.edges.length === 1 ? "" : "s"}` : `${result.edges.length} listed users`}
                    </span>
                  </h2>
                  <SampleChip show={anySeed} />
                </div>
                <TrustGraph center={{ kind: result.kind, id: result.q }} edges={result.edges} />
              </div>
              <div className="card table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{result.kind === "user" ? "Project" : "User"}</th>
                      <th scope="col">Status</th>
                      <th scope="col">Vouched by</th>
                      <th scope="col">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.edges.map((e) => (
                      <tr key={`${e.project}:${e.login}`}>
                        <td>
                          {result.kind === "user" ? (
                            <Link className="mono" href={`/?q=${encodeURIComponent(e.project)}`}>{e.project}</Link>
                          ) : (
                            <Link className="mono" href={`/u/${encodeURIComponent(e.login)}`}>@{e.login}</Link>
                          )}{" "}
                          <SampleChip show={e.is_seed} />
                        </td>
                        <td>
                          <Badge tone={e.status === "vouched" ? "success" : "danger"} size="sm">{e.status === "vouched" ? "Vouched" : "Denounced"}</Badge>
                        </td>
                        <td>{e.voucher ? `@${e.voucher}` : <span className="muted">unknown</span>}</td>
                        <td className="muted">{e.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="card">
              {q ? (
                <EmptyState title="Not in any vouch list" description={`No VOUCHED.td entries found for ${q} in the index.`} />
              ) : (
                <EmptyState title="The index is empty" description="Run npm run db:seed and npm run crawl to fill it." />
              )}
            </div>
          )}
        </section>

        <aside className="stack" aria-label="Recent vouches and index">
          <section className="card">
            <h2 className="card-title">Recent vouches</h2>
            {stats.recent.length === 0 ? (
              <p className="muted small">No events yet.</p>
            ) : (
              <ul className="event-list">
                {stats.recent.map((ev) => (
                  <li key={ev.id}>
                    <span>
                      <Link href={`/u/${encodeURIComponent(ev.login)}`}><strong>@{ev.login}</strong></Link>{" "}
                      {VERB[ev.action] ?? ev.action} in{" "}
                      <Link className="mono small" href={`/?q=${encodeURIComponent(ev.project)}`}>{ev.project}</Link>{" "}
                      <SampleChip show={ev.is_seed} />
                    </span>
                    <span className="meta">
                      {ev.voucher ? `by @${ev.voucher} · from VOUCHED.td diff` : "voucher unknown"} · {fmtDate(ev.occurred_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {result?.kind === "user" && (
              <Link className="strong-link" href={`/u/${encodeURIComponent(result.q)}`}>Open @{result.q}&apos;s profile →</Link>
            )}
          </section>
          <section className="card">
            <h2 className="card-title">Index</h2>
            <div className="stat-grid">
              <div className="stat"><b>{fmt(stats.projects)}</b><span>projects with VOUCHED.td</span></div>
              <div className="stat"><b>{fmt(stats.vouched)}</b><span>vouched contributors</span></div>
              <div className="stat"><b>{fmt(stats.denounced)}</b><span>denounced</span></div>
              <div className="stat"><b>{fmt(stats.events)}</b><span>vouch events</span></div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
