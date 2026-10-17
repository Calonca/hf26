// Octokit helpers. Every response is cached in github_cache so pages work offline.
import { Octokit } from "@octokit/rest";
import { execSync } from "node:child_process";
import { cacheRepo } from "../db/repo";

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

const HOUR = 3600_000;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cached call: fresh within maxAge, else fetch; on fetch failure fall back to any cached value. */
export async function cached<T>(key: string, maxAgeMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = cacheRepo.getGithub<T>(key, maxAgeMs);
  if (hit !== undefined) return hit;
  try {
    const value = await fetcher();
    cacheRepo.setGithub(key, value);
    return value;
  } catch (err) {
    const stale = cacheRepo.getGithubStale<T>(key);
    if (stale !== undefined) return stale;
    throw err;
  }
}

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

const split = (fullName: string) => {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
};

export type RepoMeta = {
  full_name: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  html_url: string;
  default_branch: string;
};

export function getRepoMeta(fullName: string) {
  return cached<RepoMeta>(`repo:${fullName}`, 24 * HOUR, async () => {
    const { data } = await withRetry(() => octokit().repos.get(split(fullName)));
    return {
      full_name: data.full_name,
      description: data.description,
      language: data.language,
      topics: data.topics ?? [],
      stars: data.stargazers_count,
      html_url: data.html_url,
      default_branch: data.default_branch,
    };
  });
}

/** Raw file at a ref (not cached: the crawler compares SHAs itself). */
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

export function contributingUrl(fullName: string) {
  return cached<string | null>(`contributing:${fullName}`, 24 * HOUR, async () => {
    for (const p of ["CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md"]) {
      try {
        const { data } = await withRetry(() => octokit().repos.getContent({ ...split(fullName), path: p }));
        if (!Array.isArray(data) && data.html_url) return data.html_url;
      } catch {
        /* try next */
      }
    }
    return null;
  });
}

export type Issue = { number: number; title: string; url: string; labels: string[] };

export function goodFirstIssues(fullName: string) {
  return cached<Issue[]>(`gfi:${fullName}`, 6 * HOUR, async () => {
    const { data } = await withRetry(() =>
      octokit().issues.listForRepo({ ...split(fullName), state: "open", labels: "good first issue", per_page: 5 }),
    );
    return data
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number,
        title: i.title,
        url: i.html_url,
        labels: i.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean),
      }));
  });
}

export type GhUser = { login: string; avatar_url: string; name: string | null; bio: string | null; html_url: string };

export function getUser(login: string) {
  return cached<GhUser | null>(`user:${login.toLowerCase()}`, 24 * HOUR, async () => {
    try {
      const { data } = await withRetry(() => octokit().users.getByUsername({ username: login }));
      return { login: data.login, avatar_url: data.avatar_url, name: data.name, bio: data.bio, html_url: data.html_url };
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  });
}

export type Contribution = {
  kind: "pr" | "review" | "issue";
  title: string;
  repo: string; // owner/repo
  state: "open" | "merged" | "closed";
  url: string;
  created_at: string;
};

/** Up to 30 recent public contributions: authored PRs, reviewed PRs, authored issues. */
export function userContributions(login: string) {
  return cached<Contribution[]>(`contrib:${login.toLowerCase()}`, 6 * HOUR, async () => {
    const search = async (q: string, kind: Contribution["kind"], n: number) => {
      const { data } = await withRetry(() =>
        octokit().search.issuesAndPullRequests({ q, sort: "updated", order: "desc", per_page: n }),
      );
      return data.items.map<Contribution>((i) => ({
        kind,
        title: i.title,
        repo: i.repository_url.replace("https://api.github.com/repos/", ""),
        state: i.pull_request?.merged_at ? "merged" : i.state === "open" ? "open" : "closed",
        url: i.html_url,
        created_at: i.created_at,
      }));
    };
    const [prs, reviews, issues] = await Promise.all([
      search(`author:${login} type:pr is:public`, "pr", 15),
      search(`reviewed-by:${login} -author:${login} type:pr is:public`, "review", 10),
      search(`author:${login} type:issue is:public`, "issue", 5),
    ]);
    return [...prs, ...reviews, ...issues].slice(0, 30);
  });
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
