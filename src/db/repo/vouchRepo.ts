import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, now, schema } from "../client";

const { vouch_entries, vouch_events, users, projects } = schema;
export type VouchStatus = "vouched" | "denounced";
export type VouchAction = "vouch" | "denounce" | "remove";

export const vouchRepo = {
  activeEntries(projectId: number) {
    return db
      .select({ entry: vouch_entries, login: users.login })
      .from(vouch_entries)
      .innerJoin(users, eq(users.id, vouch_entries.user_id))
      .where(and(eq(vouch_entries.project_id, projectId), isNull(vouch_entries.removed_at)))
      .all();
  },
  /** Upsert an entry. Returns true when it is new (or its status changed). */
  upsertEntry(projectId: number, userId: number, status: VouchStatus, note: string | null, lineNo: number) {
    const existing = db
      .select()
      .from(vouch_entries)
      .where(and(eq(vouch_entries.project_id, projectId), eq(vouch_entries.user_id, userId)))
      .get();
    if (!existing) {
      db.insert(vouch_entries)
        .values({ project_id: projectId, user_id: userId, status, note, line_no: lineNo, first_seen_at: now() })
        .run();
      return true;
    }
    const changed = existing.status !== status || existing.removed_at !== null;
    db.update(vouch_entries)
      .set({ status, note, line_no: lineNo, removed_at: null })
      .where(eq(vouch_entries.id, existing.id))
      .run();
    return changed;
  },
  markRemoved(entryId: number) {
    db.update(vouch_entries).set({ removed_at: now() }).where(eq(vouch_entries.id, entryId)).run();
  },
  addEvent(e: {
    project_id: number;
    user_id: number;
    action: VouchAction;
    voucher_id?: number | null;
    commit_sha?: string | null;
    occurred_at?: string;
    source?: string;
  }): boolean {
    const res = db
      .insert(vouch_events)
      .values({ ...e, occurred_at: e.occurred_at ?? now() })
      .onConflictDoNothing()
      .run();
    return res.changes > 0;
  },
  /** Drop provisional crawl events for a project once git history is available. */
  deleteCrawlEvents(projectId: number) {
    db.delete(vouch_events).where(and(eq(vouch_events.project_id, projectId), eq(vouch_events.source, "crawl"))).run();
  },
  recentEvents(limit = 12) {
    const voucher = alias(users, "voucher");
    return db
      .select({
        id: vouch_events.id,
        action: vouch_events.action,
        occurred_at: vouch_events.occurred_at,
        commit_sha: vouch_events.commit_sha,
        login: users.login,
        voucher: voucher.login,
        project: projects.full_name,
        is_seed: projects.is_seed,
      })
      .from(vouch_events)
      .innerJoin(users, eq(users.id, vouch_events.user_id))
      .innerJoin(projects, eq(projects.id, vouch_events.project_id))
      .leftJoin(voucher, eq(voucher.id, vouch_events.voucher_id))
      .orderBy(desc(vouch_events.occurred_at), desc(vouch_events.id))
      .limit(limit)
      .all();
  },
  counts() {
    const c = (status: string) =>
      db
        .select({ n: sql<number>`count(*)` })
        .from(vouch_entries)
        .where(and(eq(vouch_entries.status, status), isNull(vouch_entries.removed_at)))
        .get()!.n;
    const events = db.select({ n: sql<number>`count(*)` }).from(vouch_events).get()!.n;
    return { vouched: c("vouched"), denounced: c("denounced"), events };
  },
};
