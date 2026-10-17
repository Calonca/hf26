"use client";
import { Progress } from "@/components/arc/progress/progress";
import { useEdgeStatus } from "@/client/edgeAi";
import { modelLabel } from "@/lib/edgeModel";

/** Download progress of the in-browser model on first use, otherwise `children`. */
export function EdgeStatusLine({ children }: { children: React.ReactNode }) {
  const s = useEdgeStatus();
  if (s.phase === "downloading")
    return (
      <Progress
        value={Math.round(s.progress * 100)}
        label={`Downloading ${modelLabel()} into your browser (once, then cached)`}
        showValue
      />
    );
  return <p className="muted small">{children}</p>;
}
