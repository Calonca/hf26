export function EvidenceList({ items }: { items: { text: string; evidence_url: string }[] }) {
  if (items.length === 0) return <p className="muted">No strengths could be linked to evidence.</p>;
  return (
    <ul className="evidence-list">
      {items.map((s, i) => (
        <li key={i}>
          {s.text}{" "}
          <a href={s.evidence_url} target="_blank" rel="noreferrer" className="evidence-link">
            evidence ↗
          </a>
        </li>
      ))}
    </ul>
  );
}
