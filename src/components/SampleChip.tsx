export function SampleChip({ show, label = "Sample data" }: { show: boolean | number | null | undefined; label?: string }) {
  if (!show) return null;
  return <span className="chip chip-sample" title="Seeded example data, not crawled from GitHub">{label}</span>;
}
export default SampleChip;
