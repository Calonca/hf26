/** "https://github.com/owner/repo/pull/123" → "repo#123" */
function evidenceLabel(url: string) {
  const m = url.match(/github\.com\/[^/]+\/([^/]+)\/(?:pull|issues)\/(\d+)/);
  return m ? `${m[1]}#${m[2]}` : "evidence";
}

export function EvidenceList({ items }: { items: { text: string; evidence_url: string }[] }) {
  if (items.length === 0) return <p className="muted">No strengths could be linked to evidence.</p>;
  return (
    <ul className="evidence-list">
      {items.map((s, i) => (
        <li key={i} className="evidence-row">
          <span className="evidence-text">{s.text}</span>
          <a href={s.evidence_url} target="_blank" rel="noreferrer" className="mono evidence-link">
            {evidenceLabel(s.evidence_url)}
          </a>
        </li>
      ))}
    </ul>
  );
}
