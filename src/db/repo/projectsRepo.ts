import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, now, schema } from "../client";

const { projects, issues } = schema;
export type Project = typeof projects.$inferSelect;
export type ProjectInput = Omit<typeof projects.$inferInsert, "id" | "owner" | "repo"> & { full_name: string };

export const projectsRepo = {
  findByOwnerRepo(fullName: string): Project | undefined {
    return db.select().from(projects).where(eq(projects.full_name, fullName)).get();
  },
  findById(id: number) {
    return db.select().from(projects).where(eq(projects.id, id)).get();
  },
  list(): Project[] {
    return db.select().from(projects).orderBy(desc(projects.is_seed), desc(projects.stars), asc(projects.full_name)).all();
  },
  upsert(input: ProjectInput): Project {
    const [owner, repo] = input.full_name.split("/");
    const values = { ...input, owner, repo };
    return db
      .insert(projects)
      .values(values)
      .onConflictDoUpdate({ target: projects.full_name, set: values })
      .returning()
      .get();
  },
  setVouchFile(id: number, path: string, sha: string) {
    db.update(projects).set({ vouch_file_path: path, vouch_file_sha: sha, indexed_at: now() }).where(eq(projects.id, id)).run();
  },
  count(): number {
    return db.select({ n: sql<number>`count(*)` }).from(projects).get()!.n;
  },
  replaceIssues(projectId: number, list: { number: number; title: string; url: string; labels: string[] }[]) {
    db.transaction((tx) => {
      tx.delete(issues).where(eq(issues.project_id, projectId)).run();
      for (const i of list)
        tx.insert(issues).values({ project_id: projectId, ...i, labels: JSON.stringify(i.labels), fetched_at: now() }).run();
    });
  },
  issuesFor(projectId: number) {
    return db.select().from(issues).where(eq(issues.project_id, projectId)).orderBy(desc(issues.number)).all();
  },
  hasIssues(projectId: number) {
    return !!db.select({ id: issues.id }).from(issues).where(and(eq(issues.project_id, projectId))).limit(1).get();
  },
};
