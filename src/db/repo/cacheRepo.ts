import { and, eq } from "drizzle-orm";
import { db, now, schema } from "../client";

const { github_cache, ai_briefs } = schema;

export const cacheRepo = {
  getGithub<T>(key: string, maxAgeMs: number): T | undefined {
    const row = db.select().from(github_cache).where(eq(github_cache.cache_key, key)).get();
    if (!row) return undefined;
    if (Date.now() - Date.parse(row.fetched_at) > maxAgeMs) return undefined;
    return JSON.parse(row.json) as T;
  },
  /** Ignore age: used as a fallback when GitHub is unreachable. */
  getGithubStale<T>(key: string): T | undefined {
    const row = db.select().from(github_cache).where(eq(github_cache.cache_key, key)).get();
    return row ? (JSON.parse(row.json) as T) : undefined;
  },
  setGithub(key: string, value: unknown) {
    const values = { cache_key: key, json: JSON.stringify(value), fetched_at: now() };
    db.insert(github_cache).values(values).onConflictDoUpdate({ target: github_cache.cache_key, set: values }).run();
  },
};

export type BriefKey = { subject_type: string; subject_key: string; model: string; prompt_version: string };

export const briefsRepo = {
  get(k: BriefKey) {
    return db
      .select()
      .from(ai_briefs)
      .where(
        and(
          eq(ai_briefs.subject_type, k.subject_type),
          eq(ai_briefs.subject_key, k.subject_key),
          eq(ai_briefs.model, k.model),
          eq(ai_briefs.prompt_version, k.prompt_version),
        ),
      )
      .get();
  },
  put(k: BriefKey, input: unknown, output: unknown) {
    const values = { ...k, input_json: JSON.stringify(input), output_json: JSON.stringify(output), created_at: now() };
    return db
      .insert(ai_briefs)
      .values(values)
      .onConflictDoUpdate({
        target: [ai_briefs.subject_type, ai_briefs.subject_key, ai_briefs.model, ai_briefs.prompt_version],
        set: values,
      })
      .returning()
      .get();
  },
};
