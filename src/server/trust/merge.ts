// Merges local trust edges with the shared index. Pure: no DB, no network.
import type { TrustEdge } from "@/db/repo/trustRepo";

const keyOf = (e: TrustEdge) => `${e.project.toLowerCase()}:${e.login.toLowerCase()}`;

/**
 * Local edges win on conflict. A local edge is derived from this machine's read of
 * the real git history, including voucher attribution; a shared row is a summary,
 * so it must never overwrite a known local voucher with "unknown".
 *
 * Shared-only edges are appended after the local ones. The order is stable so the
 * graph layout does not reshuffle between renders.
 */
export function mergeEdges(local: TrustEdge[], shared: TrustEdge[]): TrustEdge[] {
  const seen = new Set(local.map(keyOf));
  const out = [...local];
  for (const e of shared) {
    const key = keyOf(e);
    if (seen.has(key)) continue; // local wins
    seen.add(key);
    out.push(e);
  }
  return out;
}
