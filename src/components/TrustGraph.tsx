"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { TrustEdge } from "@/db/repo/trustRepo";

type Props = { center: { kind: "user" | "project"; id: string }; edges: TrustEdge[] };

const TEAL = "#0F766E";
const ORANGE = "#B45309";
const GREY = "#8A94A3";

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
      nodes.set(centerId, { id: centerId, label: center.kind === "user" ? `@${center.id}` : center.id, kind: center.kind, seed: 0 });
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
            label: edges.length > 30 ? "" : e.voucher ? `by @${e.voucher}` : "unknown",
            // Denounced stays orange even with an unknown voucher (dashed); unknown vouches are dashed grey.
            color: e.status === "denounced" ? ORANGE : e.voucher ? TEAL : GREY,
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
            ? { name: "concentric", concentric: (n) => (n.data("isCenter") ? 2 : 1), levelWidth: () => 1, minNodeSpacing: 60, padding: 24, animate: false }
            : { name: "grid", animate: false },
        style: [
          {
            selector: "node",
            style: {
              label: "data(label)",
              shape: "round-rectangle",
              width: "label" as never,
              height: "label" as never,
              padding: "8px" as never,
              "font-family": "IBM Plex Mono, ui-monospace, monospace",
              "font-size": 12,
              color: "#0B4F4A",
              "text-valign": "center",
              "text-halign": "center",
              "background-color": "#E1F2EF",
              "border-width": 1,
              "border-color": TEAL,
            },
          },
          { selector: 'node[kind = "user"]', style: { "background-color": "#FFFFFF", color: "#0E1726", "border-color": "#8A94A3" } },
          {
            selector: "node[isCenter = 1]",
            style: {
              shape: "round-rectangle",
              "corner-radius": 999 as never,
              padding: "12px" as never,
              "background-color": "#0E1726",
              "border-width": 0,
              color: "#FFFFFF",
              "font-family": "IBM Plex Sans, system-ui, sans-serif",
              "font-weight": 600,
              "font-size": 14,
            },
          },
          {
            selector: "edge",
            style: {
              width: 2,
              "line-color": "data(color)",
              "line-style": "data(style)" as never,
              "curve-style": "straight",
              label: "data(label)",
              "font-size": 11,
              "font-family": "IBM Plex Sans, system-ui, sans-serif",
              color: "#4A5568",
              "text-background-color": "#FFFFFF",
              "text-background-opacity": 1,
              "text-background-padding": "3px",
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
        <span><i style={{ borderColor: TEAL }} />Vouched</span>
        <span><i style={{ borderColor: GREY, borderTopStyle: "dashed" }} />Unknown voucher</span>
        <span><i style={{ borderColor: ORANGE }} />Denounced</span>
        <span>Click a node to explore it</span>
      </div>
    </div>
  );
}
