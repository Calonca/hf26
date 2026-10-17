import { and, asc, eq } from "drizzle-orm";
import { db, now, schema } from "../client";

const { vouch_requests, projects } = schema;
export type VouchRequest = typeof vouch_requests.$inferSelect;
export type Decision = "vouched" | "more_info" | "denounced";

export const requestsRepo = {
  projectsWithRequests() {
    return db
      .selectDistinct({ id: projects.id, full_name: projects.full_name, is_seed: projects.is_seed })
      .from(vouch_requests)
      .innerJoin(projects, eq(projects.id, vouch_requests.project_id))
      .orderBy(asc(projects.full_name))
      .all();
  },
  listForProject(projectId: number): VouchRequest[] {
    return db.select().from(vouch_requests).where(eq(vouch_requests.project_id, projectId)).orderBy(asc(vouch_requests.created_at)).all();
  },
  findById(id: number) {
    return db.select().from(vouch_requests).where(eq(vouch_requests.id, id)).get();
  },
  create(r: { project_id: number; requester_login: string; message: string; created_at?: string; is_seed?: number }) {
    return db.insert(vouch_requests).values({ ...r, created_at: r.created_at ?? now() }).returning().get();
  },
  decide(id: number, status: Decision, decidedBy: string, replyText: string | null) {
    return db
      .update(vouch_requests)
      .set({ status, decided_by: decidedBy, decided_at: now(), reply_text: replyText })
      .where(and(eq(vouch_requests.id, id)))
      .returning()
      .get();
  },
  clearSeed() {
    db.delete(vouch_requests).where(eq(vouch_requests.is_seed, 1)).run();
  },
};
