"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { TrustEdge } from "@/db/repo/trustRepo";

type Props = { center: { kind: "user" | "project"; id: string }; edges: TrustEdge[] };

const TEAL = "#0F766E";
const ORANGE = "#B45309";
const GREY = "#64748B";

export default function TrustGraph({ center, edges }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    let cy: import("cytoscape").Core | undefined;
    let cancelled = false;
    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (cancelled || !ref.current) return;
      const centerId = `${center.kind}:${center.id}`;
      const nodes = new Map<string, { id: string; label: string; kind: string; seed: number }>();
      nodes.set(centerId, { id: centerId, label: center.id, kind: center.kind, seed: 0 });
      const els: import("cytoscape").ElementDefinition[] = [];
      edges.forEach((e, i) => {
        const other = center.kind === "user" ? { id: `project:${e.project}`, label: e.project, kind: "project" } : { id: `user:${e.login}`, label: e.login, kind: "user" };
        if (!nodes.has(other.id)) nodes.set(other.id, { ...other, seed: e.is_seed });
        const [source, target] = center.kind === "user" ? [other.id, centerId] : [centerId, other.id];
        els.push({
          data: {
            id: `e${i}`,
            source,
            target,
            label: e.voucher ?? "unknown",
            color: e.voucher ? (e.status === "vouched" ? TEAL : ORANGE) : GREY,
            style: e.voucher ? "solid" : "dashed",
            statusColor: e.status === "vouched" ? TEAL : ORANGE,
          },
        });
      });
      for (const n of nodes.values()) els.unshift({ data: { ...n, isCenter: n.id === centerId ? 1 : 0 } });

      cy = cytoscape({
        container: ref.current,
        elements: els,
        wheelSensitivity: 0.3,
        layout:
          nodes.size > 2
            ? { name: "concentric", concentric: (n) => (n.data("isCenter") ? 2 : 1), levelWidth: () => 1, minNodeSpacing: 40, animate: false }
            : { name: "grid", animate: false },
        style: [
          {
            selector: "node",
            style: {
              label: "data(label)",
              "font-family": "IBM Plex Mono, ui-monospace, monospace",
              "font-size": 11,
              color: "#0E1726",
              "text-valign": "bottom",
              "text-margin-y": 6,
              "text-background-color": "#FFFFFF",
              "text-background-opacity": 0.85,
              "text-background-padding": "2px",
              width: 22,
              height: 22,
              "background-color": "#FFFFFF",
              "border-width": 2,
              "border-color": "#4A5568",
            },
          },
          { selector: 'node[kind = "project"]', style: { shape: "round-rectangle", "background-color": "#E1F2EF", "border-color": TEAL } },
          { selector: 'node[kind = "user"]', style: { shape: "ellipse", "background-color": "#FFFFFF", "border-color": "#0E1726" } },
          { selector: "node[isCenter = 1]", style: { width: 38, height: 38, "font-weight": "bold", "font-size": 13, "background-color": "#0E1726" } },
          {
            selector: "edge",
            style: {
              width: 2.5,
              "line-color": "data(color)",
              "line-style": "data(style)" as never,
              "target-arrow-shape": "triangle",
              "target-arrow-color": "data(color)",
              "curve-style": "bezier",
              label: "data(label)",
              "font-size": 10,
              "font-family": "IBM Plex Mono, ui-monospace, monospace",
              color: "#4A5568",
              "text-rotation": "autorotate",
              "text-background-color": "#FFFFFF",
              "text-background-opacity": 0.9,
              "text-background-padding": "1px",
            },
          },
        ],
      });
      cy.on("tap", "node", (evt) => {
        const d = evt.target.data();
        if (d.isCenter) return;
        router.push(d.kind === "project" ? `/?q=${encodeURIComponent(d.label)}` : `/u/${encodeURIComponent(d.label)}`);
      });
    })();
    return () => {
      cancelled = true;
      cy?.destroy();
    };
  }, [center.kind, center.id, edges, router]);

  return (
    <div>
      <div
        ref={ref}
        className="graph"
        role="img"
        aria-label={`Trust graph for ${center.id}: ${edges.length} vouch list entries. The table below lists the same data.`}
      />
      <div className="legend" aria-hidden="true">
        <span><i style={{ borderColor: TEAL }} />vouched</span>
        <span><i style={{ borderColor: ORANGE }} />denounced</span>
        <span><i style={{ borderColor: GREY, borderTopStyle: "dashed" }} />voucher unknown</span>
        <span>Click a node to explore it</span>
      </div>
    </div>
  );
}
