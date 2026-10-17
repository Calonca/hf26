import { SampleChip } from "./SampleChip";

export type ProjectCardProps = {
  project: string;
  fit: "strong" | "good" | "stretch";
  why: string;
  issue_urls: string[];
  is_seed: boolean;
  contributing_url: string | null;
};

const FIT_LABEL = { strong: "Strong fit", good: "Good fit", stretch: "Stretch" } as const;

export function ProjectCard(p: ProjectCardProps) {
  return (
    <article className="card project-card">
      <div className="card-head">
        <h3>
          <a href={`https://github.com/${p.project}`} target="_blank" rel="noreferrer" className="mono">
            {p.project}
          </a>{" "}
          <SampleChip show={p.is_seed} />
        </h3>
        <span className={`chip fit-${p.fit}`}>{FIT_LABEL[p.fit]}</span>
      </div>
      <p>{p.why}</p>
      <p className="muted small">
        <strong>How to get vouched:</strong> make a first focused contribution (an issue below is a good start), then ask a
        maintainer to vouch for you in <span className="mono">VOUCHED.td</span>.
        {p.contributing_url && (
          <>
            {" "}
            Read the{" "}
            <a href={p.contributing_url} target="_blank" rel="noreferrer">
              contributing guide
            </a>
            .
          </>
        )}
      </p>
      {p.issue_urls.length > 0 && (
        <ul className="issue-links" aria-label="Suggested issues">
          {p.issue_urls.map((u) => (
            <li key={u}>
              <a href={u} target="_blank" rel="noreferrer" className="mono">
                {u.replace("https://github.com/", "")}
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
