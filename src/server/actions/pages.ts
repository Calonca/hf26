"use server";
import { projectsRepo, requestsRepo, trustRepo, type Decision } from "../../db/repo";
import { getCurrentUser } from "../auth";
import { getUser, userContributions, type Contribution, type GhUser } from "../github";

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
  return { login: user?.login ?? login, user, edges, activity, githubError };
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
