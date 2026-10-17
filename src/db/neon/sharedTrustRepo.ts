// Reads the shared trust index. Every function degrades to empty on failure:
// the shared index is an enrichment, never a dependency.
//
// `import type` keeps this module free of the SQLite client that src/db/repo
// pulls in through its barrel; the type is erased at build.
import type { TrustEdge } from "@/db/repo/trustRepo";
import { neonPool } from "./client";

/** Columns are listed explicitly: SELECT * is the main driver of egress cost. */
const COLUMNS = `project, login, status, note, voucher, occurred_at, commit_sha`;
const MAX_ROWS = 500;

type Row = {
  project: string;
  login: string;
  status: string;
  note: string | null;
  voucher: string | null;
  occurred_at: Date | string | null;
  commit_sha: string | null;
};

/** occurred_at is timestamptz, which pg hands back as a Date; the app expects ISO text. */
function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toEdge(r: Row): TrustEdge {
  return {
    project: r.project,
    project_id: null, // shared rows have no local project
    is_seed: 0,
    login: r.login,
    status: r.status === "denounced" ? "denounced" : "vouched",
    note: r.note,
    voucher: r.voucher, // null = unknown, never guessed
    occurred_at: toIso(r.occurred_at),
    commit_sha: r.commit_sha,
    origin: "shared",
  };
}

async function query(where: string, value: string): Promise<TrustEdge[]> {
  const pool = neonPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query<Row>(
      `SELECT ${COLUMNS} FROM trust_edges WHERE ${where} ORDER BY project, login LIMIT ${MAX_ROWS}`,
      [value],
    );
    return rows.map(toEdge);
  } catch (err) {
    console.warn(`shared index unavailable: ${(err as Error).message}`);
    return [];
  }
}

export type SharedCounts = { projects: number; vouched: number; denounced: number };

export const sharedTrustRepo = {
  edgesForUser(login: string) {
    return query("lower(login) = lower($1)", login);
  },
  edgesForProject(fullName: string) {
    return query("lower(project) = lower($1)", fullName);
  },
  /** count(*) is a bigint in Postgres and arrives as a string, so cast it in SQL. */
  async counts(): Promise<SharedCounts | null> {
    const pool = neonPool();
    if (!pool) return null;
    try {
      const { rows } = await pool.query<SharedCounts>(
        `SELECT count(DISTINCT project)::int AS projects,
                count(*) FILTER (WHERE status = 'vouched')::int   AS vouched,
                count(*) FILTER (WHERE status = 'denounced')::int AS denounced
         FROM trust_edges`,
      );
      return rows[0] ?? null;
    } catch (err) {
      console.warn(`shared index unavailable: ${(err as Error).message}`);
      return null;
    }
  },
};
