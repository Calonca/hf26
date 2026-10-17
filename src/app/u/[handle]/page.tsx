import Link from "next/link";
import { BriefCard } from "@/components/BriefCard";
import { SampleChip } from "@/components/SampleChip";
import { getProfileData } from "@/server/actions/pages";
import "./profile.css";

export const dynamic = "force-dynamic";

const initials = (login: string) =>
  login
    .split(/[-_.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || login.slice(0, 2).toUpperCase();

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const login = decodeURIComponent(handle).replace(/^@/, "");
  const data = await getProfileData(login);
  const vouched = data.edges.filter((e) => e.status === "vouched");
  const denounced = data.edges.filter((e) => e.status === "denounced");
  const unknownVoucher = vouched.filter((e) => !e.voucher);
  const anySeed = data.edges.some((e) => e.is_seed === 1);
  const plural = (n: number) => (n === 1 ? "" : "s");

  return (
    <main className="container profile-page">
      <aside className="card profile-aside" aria-labelledby="profile-handle">
        {data.user?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.user.avatar_url} alt="" width={72} height={72} className="profile-avatar" />
        ) : (
          <div className="profile-avatar profile-avatar-fallback" aria-hidden="true">
            {initials(login)}
          </div>
        )}
        <div className="profile-id">
          <h1 id="profile-handle">@{data.login}</h1>
          {data.user?.name && <span className="profile-name">{data.user.name}</span>}
          <span className="muted small">Public GitHub activity only</span>
        </div>

        <div className="profile-pills">
          <span className="pill pill-ok">
            Vouched in {vouched.length} project{plural(vouched.length)}
          </span>
          {unknownVoucher.length > 0 && <span className="pill pill-muted">Unknown voucher in {unknownVoucher.length}</span>}
          {denounced.length > 0 && <span className="pill pill-warn">Denounced in {denounced.length}</span>}
        </div>

        <div className="profile-vouchers">
          <span className="profile-label">Vouched by</span>
          {vouched.length === 0 ? (
            <span className="muted small">Not vouched in any indexed VOUCHED.td.</span>
          ) : (
            <ul>
              {vouched.map((e) => (
                <li key={e.project}>
                  {e.voucher ? (
                    <Link href={`/u/${e.voucher}`}>@{e.voucher}</Link>
                  ) : (
                    <span className="muted">unknown</span>
                  )}{" "}
                  ·{" "}
                  <Link href={`/?q=${encodeURIComponent(e.project)}`} className="mono">
                    {e.project}
                  </Link>{" "}
                  <SampleChip show={e.is_seed === 1} />
                </li>
              ))}
            </ul>
          )}
          {denounced.length > 0 && (
            <>
              <span className="profile-label">Denounced in</span>
              <ul>
                {denounced.map((e) => (
                  <li key={e.project}>
                    <Link href={`/?q=${encodeURIComponent(e.project)}`} className="mono">
                      {e.project}
                    </Link>
                    {e.note && <span className="muted small"> — “{e.note}”</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <a href={`https://github.com/${data.login}`} target="_blank" rel="noreferrer" className="profile-gh">
          View on GitHub →
        </a>
        {anySeed && <SampleChip show />}
        {data.githubError && <p className="muted small">GitHub unavailable; showing cached data where possible.</p>}
      </aside>

      <div className="profile-main">
        <BriefCard login={data.login} />

        <section className="card profile-section" aria-labelledby="activity-title">
          <h2 id="activity-title">Activity by project</h2>
          {data.activity.length === 0 ? (
            <p className="muted">No public activity found.</p>
          ) : (
            <div className="table-wrap">
              <table className="table profile-table">
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">PRs merged</th>
                    <th scope="col">PRs closed</th>
                    <th scope="col">Reviews</th>
                    <th scope="col">Vouch</th>
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
                      <td>{r.reviews}</td>
                      <td>
                        {r.vouch === "vouched" ? (
                          <span className="vouch-ok">Vouched</span>
                        ) : r.vouch === "denounced" ? (
                          <span className="vouch-warn">Denounced</span>
                        ) : (
                          <span className="muted">Not listed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
