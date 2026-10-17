import Link from "next/link";
import { BriefCard } from "@/components/BriefCard";
import { SampleChip } from "@/components/SampleChip";
import { getProfileData } from "@/server/actions/pages";
import "../../pages.css";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const login = decodeURIComponent(handle);
  const data = await getProfileData(login);
  const vouched = data.edges.filter((e) => e.status === "vouched");
  const denounced = data.edges.filter((e) => e.status === "denounced");

  return (
    <main className="container profile">
      <header className="profile-head card">
        {data.user?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.user.avatar_url} alt="" width={72} height={72} className="avatar" />
        ) : (
          <div className="avatar avatar-fallback" aria-hidden="true">
            {login.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="page-title">
            <a href={`https://github.com/${data.login}`} target="_blank" rel="noreferrer" className="mono">
              @{data.login}
            </a>
          </h1>
          {data.user?.name && <p className="muted">{data.user.name}</p>}
          <p>
            <strong>Vouched in {vouched.length} project{vouched.length === 1 ? "" : "s"}</strong>
            {denounced.length > 0 && <span className="chip chip-warn">Denounced in {denounced.length}</span>}
          </p>
          {data.githubError && <p className="muted small">GitHub unavailable, showing cached data where possible.</p>}
        </div>
      </header>

      <div className="grid-2">
        <BriefCard login={data.login} />

        <section className="card" aria-labelledby="vouchers-title">
          <h2 id="vouchers-title">Vouch lists</h2>
          {data.edges.length === 0 ? (
            <p className="muted">Not listed in any indexed VOUCHED.td.</p>
          ) : (
            <ul className="voucher-list">
              {data.edges.map((e) => (
                <li key={e.project}>
                  <span className={e.status === "vouched" ? "chip chip-ok" : "chip chip-warn"}>{e.status}</span>{" "}
                  <Link href={`/?q=${encodeURIComponent(e.project)}`} className="mono">
                    {e.project}
                  </Link>{" "}
                  <span className="muted">
                    by{" "}
                    {e.voucher ? (
                      <Link href={`/u/${e.voucher}`} className="mono">
                        @{e.voucher}
                      </Link>
                    ) : (
                      "unknown"
                    )}
                  </span>{" "}
                  <SampleChip show={e.is_seed === 1} />
                  {e.note && <div className="muted small">“{e.note}”</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="activity-title">
        <h2 id="activity-title">Public activity by repository</h2>
        {data.activity.length === 0 ? (
          <p className="muted">No public activity found.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Repository</th>
                  <th scope="col">Merged PRs</th>
                  <th scope="col">Closed PRs</th>
                  <th scope="col">Open PRs</th>
                  <th scope="col">Reviews</th>
                  <th scope="col">Issues</th>
                  <th scope="col">Vouch status</th>
                </tr>
              </thead>
              <tbody>
                {data.activity.map((r) => (
                  <tr key={r.repo}>
                    <td>
                      <a href={`https://github.com/${r.repo}`} target="_blank" rel="noreferrer" className="mono">
                        {r.repo}
                      </a>
                    </td>
                    <td>{r.merged}</td>
                    <td>{r.closed}</td>
                    <td>{r.open}</td>
                    <td>{r.reviews}</td>
                    <td>{r.issues}</td>
                    <td>
                      {r.vouch ? (
                        <span className={r.vouch === "vouched" ? "chip chip-ok" : "chip chip-warn"}>{r.vouch}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="footer-note muted">This brief explains public activity. It is not a score.</p>
    </main>
  );
}
