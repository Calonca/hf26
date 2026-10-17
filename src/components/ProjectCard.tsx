import { SampleChip } from "./SampleChip";

export type ProjectCardProps = {
  project: string;
  fit: "strong" | "good" | "stretch";
  why: string;
  issue_urls: string[];
  is_seed: boolean;
  contributing_url: string | null;
  html_url: string | null;
};

const FIT_LABEL = { strong: "Strong fit", good: "Good fit", stretch: "Stretch" } as const;

const issueLabel = (url: string) => {
  const m = url.match(/github\.com\/[^/]+\/([^/]+)\/issues\/(\d+)/);
  return m ? `${m[1]}#${m[2]}` : url.replace("https://github.com/", "");
};

export function ProjectCard(p: ProjectCardProps) {
  const repoUrl = p.html_url ?? (p.is_seed ? null : `https://github.com/${p.project}`);
  const gfiUrl = repoUrl ? `${repoUrl}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22` : null;
  return (
    <article className="card discover-card">
      <div className="discover-card-head">
        <h3>
          {repoUrl ? (
            <a href={repoUrl} target="_blank" rel="noreferrer">
              {p.project}
            </a>
          ) : (
            p.project
          )}
          <SampleChip show={p.is_seed} />
        </h3>
        <span className={`fit-pill fit-${p.fit}`}>{FIT_LABEL[p.fit]}</span>
      </div>
      <p className="discover-why">
        <strong>Why:</strong> {p.why}
      </p>
      <div className="discover-howto">
        <strong>How to get vouched</strong>
        <span>
          1 ·{" "}
          {p.contributing_url ? (
            <a href={p.contributing_url} target="_blank" rel="noreferrer">
              Read CONTRIBUTING.md
            </a>
          ) : (
            "Read the project's contributing notes"
          )}
        </span>
        <span>2 · Ask a maintainer to vouch for you after a first good contribution</span>
        <span>Vouch projects auto-close PRs from unvouched users.</span>
      </div>
      {p.issue_urls.length > 0 && (
        <ul className="discover-issues" aria-label={`Suggested issues in ${p.project}`}>
          {p.issue_urls.map((u) => (
            <li key={u}>
              <a href={u} target="_blank" rel="noreferrer" className="mono">
                {issueLabel(u)}
              </a>
            </li>
          ))}
        </ul>
      )}
      {gfiUrl && (
        <a className="discover-more" href={gfiUrl} target="_blank" rel="noreferrer">
          {p.issue_urls.length > 0 ? `${p.issue_urls.length} good first issues →` : "Good first issues →"}
        </a>
      )}
    </article>
  );
}
