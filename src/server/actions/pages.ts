"use server";
import { projectsRepo, requestsRepo, trustRepo, type Decision } from "../../db/repo";
import { isGithubLogin } from "../../lib/query";
import { getCurrentUser } from "../auth";
import { contributionCalendar, getUser, userContributions, type Calendar, type Contribution, type GhUser } from "../github";

export type RepoActivity = {
  repo: string;
  merged: number;
  closed: number;
  open: number;
  reviews: number;
  issues: number;
  vouch: "vouched" | "denounced" | null;
  urls: string[];
};

export async function getProfileData(login: string) {
  let user: GhUser | null = null;
  let contributions: Contribution[] = [];
  let githubError: string | null = null;
  let calendar: Calendar | null = null;
  // GitHub answers 422 to a search for a malformed login; such a handle can only match local vouch data.
  const valid = isGithubLogin(login);
  if (valid) {
    try {
      user = await getUser(login);
    } catch (err) {
      githubError = (err as Error).message;
    }
    try {
      contributions = await userContributions(login);
    } catch (err) {
      githubError = (err as Error).message;
    }
    try {
      calendar = await contributionCalendar(login);
    } catch {
      /* the profile just skips the calendar */
    }
  }
  const edges = trustRepo.edgesForUser(login);
  const byRepo = new Map<string, RepoActivity>();
  const row = (repo: string) => {
    let r = byRepo.get(repo.toLowerCase());
    if (!r) {
      r = { repo, merged: 0, closed: 0, open: 0, reviews: 0, issues: 0, vouch: null, urls: [] };
      byRepo.set(repo.toLowerCase(), r);
    }
    return r;
  };
  for (const c of contributions) {
    const r = row(c.repo);
    if (c.kind === "review") r.reviews++;
    else if (c.kind === "issue") r.issues++;
    else r[c.state]++;
    r.urls.push(c.url);
  }
  for (const e of edges) row(e.project).vouch = e.status;
  const activity = [...byRepo.values()].sort(
    (a, b) => b.merged + b.closed + b.open + b.reviews + b.issues - (a.merged + a.closed + a.open + a.reviews + a.issues),
  );
  // Years the account has existed, newest first, for the calendar's year switch.
  const thisYear = new Date().getUTCFullYear();
  const firstYear = user?.created_at ? new Date(user.created_at).getUTCFullYear() : thisYear;
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i);
  return { login: user?.login ?? login, user, edges, activity, calendar, years, githubError };
}

/** One year of the contribution calendar, or the last year when `year` is null. */
export async function getContributionCalendar(login: string, year: number | null) {
  if (!isGithubLogin(login)) return null;
  try {
    return await contributionCalendar(login, year ?? undefined);
  } catch {
    return null;
  }
}

export async function listRequestProjects() {
  return requestsRepo.projectsWithRequests();
}

export async function listRequests(projectId: number) {
  return requestsRepo.listForProject(projectId);
}

/** Records the maintainer's decision locally. Never writes to GitHub. */
export async function decideRequest(id: number, decision: Decision, replyText: string | null) {
  if (!["vouched", "more_info", "denounced"].includes(decision)) throw new Error("Invalid decision");
  return requestsRepo.decide(id, decision, getCurrentUser().login, replyText);
}

export async function getDiscoverProjects() {
  return projectsRepo.list().map((p) => ({
    full_name: p.full_name,
    is_seed: p.is_seed,
    contributing_url: p.contributing_url,
    html_url: p.html_url,
  }));
}
