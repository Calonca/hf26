"use client";
import { useEdgeStatus } from "@/client/edgeAi";
import { modelLabel } from "@/lib/edgeModel";

/** Download progress of the in-browser model on first use, otherwise `children`. */
export function EdgeStatusLine({ children }: { children: React.ReactNode }) {
  const s = useEdgeStatus();
  if (s.phase === "downloading")
    return (
      <p className="muted small">
        Downloading {modelLabel()} into your browser (once, then cached)… {Math.round(s.progress * 100)}%
      </p>
    );
  return <p className="muted small">{children}</p>;
}
