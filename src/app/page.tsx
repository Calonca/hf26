import Link from "next/link";
import SampleChip from "@/components/SampleChip";
import TrustGraph from "@/components/TrustGraph";
import { exploreSearch, indexStats } from "@/server/actions/explore";

export const dynamic = "force-dynamic";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const stats = await indexStats();
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? stats.suggestions[0] ?? "").trim();
  const result = q ? await exploreSearch(q) : null;

  return (
    <div className="container">
      <h1 className="page-title">Explore the trust graph</h1>
      <p className="page-sub">
        Where is someone vouched, and by whom? Built from public <span className="mono">VOUCHED.td</span> files.
      </p>
      <div className="grid-2">
        <section className="stack" aria-label="Search results">
          <form className="card row" action="/" method="get" role="search">
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="q">GitHub handle or owner/repo</label>
              <input id="q" name="q" defaultValue={q} placeholder="mitchellh or ghostty-org/ghostty" autoComplete="off" />
            </div>
            <button className="btn btn-primary" type="submit" style={{ alignSelf: "flex-end" }}>Search</button>
          </form>

          {result && result.edges.length > 0 ? (
            <>
              <div className="card">
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                  <h2 className="card-title" style={{ margin: 0 }}>
                    <span className="mono">{result.q}</span>
                    <span className="muted small" style={{ fontWeight: 400 }}>
                      {" "}· {result.kind === "user" ? `listed in ${result.edges.length} project${result.edges.length === 1 ? "" : "s"}` : `${result.edges.length} listed users`}
                    </span>
                  </h2>
                  {result.kind === "user" && <Link className="btn btn-ghost" href={`/u/${encodeURIComponent(result.q)}`}>Open profile →</Link>}
                </div>
                <TrustGraph center={{ kind: result.kind, id: result.q }} edges={result.edges} />
              </div>
              <div className="card table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{result.kind === "user" ? "Project" : "User"}</th>
                      <th scope="col">Status</th>
                      <th scope="col">Voucher</th>
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
                            <Link className="mono" href={`/u/${encodeURIComponent(e.login)}`}>{e.login}</Link>
                          )}{" "}
                          <SampleChip show={e.is_seed} />
                        </td>
                        <td>
                          <span className={`chip ${e.status === "vouched" ? "chip-ok" : "chip-warn"}`}>{e.status}</span>
                        </td>
                        <td className="mono">{e.voucher ?? <span className="muted">unknown</span>}</td>
                        <td className="muted">{e.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty">
              {q ? (
                <>No vouch list entries found for <span className="mono">{q}</span> in the index.</>
              ) : (
                <>The index is empty. Run <span className="mono">npm run db:seed</span> and <span className="mono">npm run crawl</span>.</>
              )}
            </div>
          )}
        </section>

        <aside className="stack" aria-label="Index">
          <div className="card">
            <h2 className="card-title">Index</h2>
            <div className="stat-grid">
              <div className="stat"><b>{stats.projects}</b><span className="muted small">projects</span></div>
              <div className="stat"><b>{stats.users}</b><span className="muted small">users</span></div>
              <div className="stat"><b>{stats.vouched}</b><span className="muted small">vouches</span></div>
              <div className="stat"><b>{stats.denounced}</b><span className="muted small">denouncements</span></div>
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>{stats.events} vouch events recorded</p>
          </div>
          {stats.suggestions.length > 0 && (
            <div className="card">
              <h2 className="card-title">Try</h2>
              <div className="row">
                {stats.suggestions.map((s) => (
                  <Link key={s} className="chip mono" href={`/?q=${encodeURIComponent(s)}`}>{s}</Link>
                ))}
              </div>
            </div>
          )}
          <div className="card">
            <h2 className="card-title">Recent vouch events</h2>
            {stats.recent.length === 0 ? (
              <p className="muted small">No events yet.</p>
            ) : (
              <ul className="event-list">
                {stats.recent.map((ev) => (
                  <li key={ev.id}>
                    <Link className="mono" href={`/u/${encodeURIComponent(ev.login)}`}>{ev.login}</Link>{" "}
                    <span className={`chip ${ev.action === "vouch" ? "chip-ok" : ev.action === "denounce" ? "chip-warn" : ""}`}>{ev.action}</span>{" "}
                    in <Link className="mono" href={`/?q=${encodeURIComponent(ev.project)}`}>{ev.project}</Link>{" "}
                    <SampleChip show={ev.is_seed} />
                    <div className="muted small">
                      by {ev.voucher ? <span className="mono">{ev.voucher}</span> : "unknown"} · {fmtDate(ev.occurred_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
