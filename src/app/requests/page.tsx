import Link from "next/link";
import { RequestList } from "@/components/RequestList";
import { SampleChip } from "@/components/SampleChip";
import { listRequestProjects, listRequests } from "@/server/actions/pages";
import { getCurrentUser } from "@/server/auth";
import "../pages.css";

export const dynamic = "force-dynamic";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project: wanted } = await searchParams;
  const projects = await listRequestProjects();
  const current =
    projects.find((p) => p.full_name === wanted) ?? projects.find((p) => p.is_seed === 1) ?? projects[0] ?? null;
  const requests = current ? await listRequests(current.id) : [];
  const me = getCurrentUser();

  return (
    <main className="container">
      <h1 className="page-title">Vouch requests</h1>
      <p className="muted">
        Maintainer inbox. Signed in as <span className="mono">{me.login}</span> (demo). Gemma summarises, you decide.
      </p>
      {projects.length === 0 ? (
        <p className="muted">No requests yet. Run <span className="mono">npm run db:seed</span>.</p>
      ) : (
        <>
          <nav className="project-picker" aria-label="Choose project">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/requests?project=${encodeURIComponent(p.full_name)}`}
                className={`chip mono${p.id === current?.id ? " chip-selected" : ""}`}
                aria-current={p.id === current?.id ? "page" : undefined}
              >
                {p.full_name}
              </Link>
            ))}
          </nav>
          {current && (
            <>
              <h2 className="section-title">
                <span className="mono">{current.full_name}</span> <SampleChip show={current.is_seed === 1} />
              </h2>
              <RequestList initial={requests} project={current.full_name} />
            </>
          )}
        </>
      )}
    </main>
  );
}
