import { describe, expect, it } from "vitest";
import type { TrustEdge } from "../src/db/repo/trustRepo";
import { mergeEdges } from "../src/server/trust/merge";

const edge = (over: Partial<TrustEdge>): TrustEdge => ({
  project: "acme/cli",
  project_id: 1,
  is_seed: 0,
  login: "octo",
  status: "vouched",
  note: null,
  voucher: null,
  occurred_at: null,
  commit_sha: null,
  origin: "local",
  ...over,
});

describe("mergeEdges", () => {
  it("appends shared-only edges after local ones", () => {
    const local = [edge({ project: "acme/cli" })];
    const shared = [edge({ project: "other/repo", project_id: null, origin: "shared" })];
    expect(mergeEdges(local, shared).map((e) => [e.project, e.origin])).toEqual([
      ["acme/cli", "local"],
      ["other/repo", "shared"],
    ]);
  });

  it("keeps the local edge on conflict, preserving a known voucher", () => {
    const local = [edge({ voucher: "maintainer" })];
    const shared = [edge({ voucher: null, project_id: null, origin: "shared" })];
    const out = mergeEdges(local, shared);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ voucher: "maintainer", origin: "local" });
  });

  it("dedupes case-insensitively on project and login", () => {
    const local = [edge({ project: "Acme/CLI", login: "Octo" })];
    const shared = [edge({ project: "acme/cli", login: "octo", project_id: null, origin: "shared" })];
    expect(mergeEdges(local, shared)).toHaveLength(1);
  });

  it("is a no-op with no shared edges, and passes shared through with no local", () => {
    const local = [edge({})];
    expect(mergeEdges(local, [])).toEqual(local);
    const shared = [edge({ project_id: null, origin: "shared" })];
    expect(mergeEdges([], shared)).toEqual(shared);
  });
});
