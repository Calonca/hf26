// Octokit helpers. Every response is cached in github_cache so pages work offline.
// Auth, pacing, retry and the uncached readers live in ./githubCore.ts (no DB imports),
// and are re-exported here so existing call sites are unchanged.
import { cacheRepo } from "../db/repo";
import { hasToken, octokit, split, withRetry } from "./githubCore";

export { fileCommits, getFile, octokit, sleep, withRetry } from "./githubCore";

const HOUR = 3600_000;
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

export type GhUser = {
  login: string;
  avatar_url: string;
  name: string | null;
  bio: string | null;
  html_url: string;
  created_at: string;
};

export function getUser(login: string) {
  return cached<GhUser | null>(`user:v2:${login.toLowerCase()}`, 24 * HOUR, async () => {
    try {
      const { data } = await withRetry(() => octokit().users.getByUsername({ username: login }));
      return {
        login: data.login,
        avatar_url: data.avatar_url,
        name: data.name,
        bio: data.bio,
        html_url: data.html_url,
        created_at: data.created_at,
      };
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
      // One try: this runs while a page or brief waits, and search rate limits (10/min without a token) last a minute.
      // cached() falls back to the last stored result instead.
      const { data } = await withRetry(
        () => octokit().search.issuesAndPullRequests({ q, sort: "updated", order: "desc", per_page: n }),
        1,
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

export type CalendarDay = { date: string; count: number };
export type Calendar = { days: CalendarDay[]; period: string; unit: { one: string; other: string } };

const CONTRIBUTIONS = { one: "contribution", other: "contributions" };

/**
 * Daily contribution counts for one calendar year, or the last year when `year` is omitted.
 * With a token: GraphQL, as on the GitHub profile calendar.
 * Without one (GraphQL rejects anonymous calls): the same calendar from GitHub's public contributions page.
 * Returns null for unknown users.
 */
export function contributionCalendar(login: string, year?: number) {
  return hasToken() ? graphqlCalendar(login, year) : htmlCalendar(login, year);
}

/** Past years no longer change, so they keep for a day; the current window refreshes every few hours. */
const calendarMaxAge = (year?: number) => (year && year < new Date().getUTCFullYear() ? 24 * HOUR : 6 * HOUR);

function graphqlCalendar(login: string, year?: number) {
  const key = `calendar:v3:${login.toLowerCase()}:${year ?? "last"}`;
  return cached<Calendar | null>(key, calendarMaxAge(year), async () => {
    type Res = {
      user: {
        contributionsCollection: {
          contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] };
        };
      } | null;
    };
    const res = await withRetry(() =>
      octokit().graphql<Res>(
        `query($login: String!, $from: DateTime, $to: DateTime) {
          user(login: $login) {
            contributionsCollection(from: $from, to: $to) {
              contributionCalendar { weeks { contributionDays { date contributionCount } } }
            }
          }
        }`,
        year ? { login, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` } : { login },
      ),
    );
    if (!res.user) return null;
    const days = res.user.contributionsCollection.contributionCalendar.weeks.flatMap((w) =>
      w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })),
    );
    return { days: inYear(days, year), period: year ? String(year) : "the last year", unit: CONTRIBUTIONS };
  });
}

function htmlCalendar(login: string, year?: number) {
  const key = `calendar-html:${login.toLowerCase()}:${year ?? "last"}`;
  return cached<Calendar | null>(key, calendarMaxAge(year), async () => {
    const range = year ? `?from=${year}-01-01&to=${year}-12-31` : "";
    const res = await fetch(`https://github.com/users/${encodeURIComponent(login)}/contributions${range}`, {
      headers: { "User-Agent": "vouch-explorer" },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub contributions page: ${res.status}`);
    const html = await res.text();
    // Each day is a <td data-date id> cell; its count lives in the <tool-tip for=id> label.
    const dateById = new Map<string, string>();
    for (const m of html.matchAll(/<td\b[^>]*>/g)) {
      const date = m[0].match(/data-date="(\d{4}-\d{2}-\d{2})"/)?.[1];
      const id = m[0].match(/\bid="([^"]+)"/)?.[1];
      if (date && id) dateById.set(id, date);
    }
    const countByDate = new Map<string, number>();
    for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
      const date = dateById.get(m[1]);
      const n = m[2].match(/^([\d,]+) contribution/)?.[1];
      if (date) countByDate.set(date, n ? Number(n.replace(/,/g, "")) : 0);
    }
    const days = [...dateById.values()].sort().map((date) => ({ date, count: countByDate.get(date) ?? 0 }));
    if (days.length === 0) throw new Error("GitHub contributions page: no days found");
    return { days: inYear(days, year), period: year ? String(year) : "the last year", unit: CONTRIBUTIONS };
  });
}

/** Both sources pad to whole weeks; a calendar year should start on Jan 1 and end on Dec 31. */
function inYear(days: CalendarDay[], year?: number) {
  return year ? days.filter((d) => d.date.startsWith(`${year}-`)) : days;
}
