// GitHub helpers with NO database dependency, so standalone processes (which must
// not load the SQLite client) can reuse the auth, pacing and retry logic.
// Cached, DB-backed wrappers live in ./github.ts.
import { Octokit } from "@octokit/rest";
import { execSync } from "node:child_process";

let client: Octokit | undefined;
export function octokit(): Octokit {
  if (client) return client;
  let auth = process.env.GITHUB_TOKEN;
  if (!auth) {
    try {
      auth = execSync("gh auth token", { encoding: "utf8" }).trim();
    } catch {
      /* unauthenticated: low rate limits */
    }
  }
  client = new Octokit({ auth, userAgent: "vouch-explorer" });
  return client;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const split = (fullName: string) => {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
};

/** Retry on secondary rate limits (403/429) with backoff. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (i >= tries - 1 || (status !== 403 && status !== 429)) throw err;
      const wait = 15_000 * (i + 1);
      console.warn(`  rate limited (${status}), waiting ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

/** Raw file at a ref (not cached: callers compare SHAs themselves). */
export async function getFile(fullName: string, path: string, ref?: string): Promise<{ text: string; sha: string } | null> {
  try {
    const { data } = await withRetry(() => octokit().repos.getContent({ ...split(fullName), path, ref }));
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return null;
    return { text: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/** Commits touching a file, oldest first. */
export async function fileCommits(fullName: string, path: string, max = 40) {
  const { data } = await withRetry(() => octokit().repos.listCommits({ ...split(fullName), path, per_page: max }));
  return data
    .map((c) => ({
      sha: c.sha,
      author: c.author?.login ?? null, // only a resolved GitHub account, never the free-text name
      date: c.commit.committer?.date ?? c.commit.author?.date ?? new Date().toISOString(),
    }))
    .reverse();
}
