import { Badge } from "@/components/arc/badge/badge";

export function SampleChip({ show, label = "Sample data" }: { show: boolean | number | null | undefined; label?: string }) {
  if (!show) return null;
  return (
    <Badge tone="neutral" size="sm" title="Seeded example data, not crawled from GitHub">
      {label}
    </Badge>
  );
}
export default SampleChip;
