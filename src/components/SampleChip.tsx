export function SampleChip({ show }: { show: boolean | number | null | undefined }) {
  if (!show) return null;
  return <span className="chip chip-sample" title="Seeded example data, not crawled from GitHub">Sample data</span>;
}
export default SampleChip;
