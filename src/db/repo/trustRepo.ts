// Replaces the old `trust_edges` DB view with a portable Drizzle query.
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, schema } from "../client";

const { vouch_entries, vouch_events, users, projects } = schema;

export type TrustEdge = {
  project: string;
  project_id: number;
  is_seed: number;
  login: string;
  status: "vouched" | "denounced";
  note: string | null;
  voucher: string | null; // null = unknown, never guessed
  occurred_at: string | null;
  commit_sha: string | null;
};

function edges(where: ReturnType<typeof and>): TrustEdge[] {
  const rows = db
    .select({
      project: projects.full_name,
      project_id: projects.id,
      is_seed: projects.is_seed,
      user_id: users.id,
      login: users.login,
      status: vouch_entries.status,
      note: vouch_entries.note,
    })
    .from(vouch_entries)
    .innerJoin(users, eq(users.id, vouch_entries.user_id))
    .innerJoin(projects, eq(projects.id, vouch_entries.project_id))
    .where(where)
    .all();
  if (rows.length === 0) return [];

  // Latest matching event per (project, user) gives the voucher, if known.
  const voucher = alias(users, "voucher");
  const events = db
    .select({
      project_id: vouch_events.project_id,
      user_id: vouch_events.user_id,
      action: vouch_events.action,
      voucher: voucher.login,
      occurred_at: vouch_events.occurred_at,
      commit_sha: vouch_events.commit_sha,
    })
    .from(vouch_events)
    .leftJoin(voucher, eq(voucher.id, vouch_events.voucher_id))
    .where(inArray(vouch_events.user_id, [...new Set(rows.map((r) => r.user_id))]))
    .orderBy(desc(vouch_events.occurred_at))
    .all();

  return rows.map((r) => {
    const want = r.status === "vouched" ? "vouch" : "denounce";
    const ev = events.find((e) => e.project_id === r.project_id && e.user_id === r.user_id && e.action === want);
    return {
      project: r.project,
      project_id: r.project_id,
      is_seed: r.is_seed,
      login: r.login,
      status: r.status as TrustEdge["status"],
      note: r.note,
      voucher: ev?.voucher ?? null,
      occurred_at: ev?.occurred_at ?? null,
      commit_sha: ev?.commit_sha ?? null,
    };
  });
}

export const trustRepo = {
  edgesForUser(login: string): TrustEdge[] {
    return edges(and(sql`lower(${users.login}) = lower(${login})`, isNull(vouch_entries.removed_at)));
  },
  edgesForProject(fullName: string): TrustEdge[] {
    return edges(and(sql`lower(${projects.full_name}) = lower(${fullName})`, isNull(vouch_entries.removed_at)));
  },
  /** Logins of users who are listed somewhere (for search suggestions). */
  suggestLogins(limit = 8): string[] {
    return db
      .select({ login: users.login, n: sql<number>`count(*)` })
      .from(vouch_entries)
      .innerJoin(users, eq(users.id, vouch_entries.user_id))
      .where(isNull(vouch_entries.removed_at))
      .groupBy(users.login)
      .orderBy(desc(sql`count(*)`), users.login)
      .limit(limit)
      .all()
      .map((r) => r.login);
  },
};
