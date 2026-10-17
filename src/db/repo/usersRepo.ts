import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../client";

const { users } = schema;
export type User = typeof users.$inferSelect;

export const usersRepo = {
  findByLogin(login: string, platform = "github"): User | undefined {
    return db
      .select()
      .from(users)
      .where(and(eq(users.platform, platform), sql`lower(${users.login}) = lower(${login})`))
      .get();
  },
  upsert(login: string, platform = "github", avatar_url?: string | null): User {
    const existing = usersRepo.findByLogin(login, platform);
    if (existing) {
      if (avatar_url && existing.avatar_url !== avatar_url)
        db.update(users).set({ avatar_url }).where(eq(users.id, existing.id)).run();
      return existing;
    }
    return db.insert(users).values({ login, platform, avatar_url }).returning().get();
  },
  count(): number {
    return db.select({ n: sql<number>`count(*)` }).from(users).get()!.n;
  },
};
