"use server";
import { sharedTrustRepo } from "../../db/neon/sharedTrustRepo";
import { projectsRepo, trustRepo, usersRepo, vouchRepo } from "../../db/repo";
import { mergeEdges } from "../trust/merge";
import { cleanQuery } from "../../lib/query";

export async function exploreSearch(q: string) {
  const query = cleanQuery(q);
  const kind = query.includes("/") ? ("project" as const) : ("user" as const);
  const local = kind === "project" ? trustRepo.edgesForProject(query) : trustRepo.edgesForUser(query);
  // The shared index is an enrichment: if it fails or is unconfigured, local still renders.
  const settled = await Promise.allSettled([
    kind === "project" ? sharedTrustRepo.edgesForProject(query) : sharedTrustRepo.edgesForUser(query),
  ]);
  const shared = settled[0].status === "fulfilled" ? settled[0].value : [];
  const edges = mergeEdges(local, shared);
  return { kind, q: query, edges, sharedCount: edges.length - local.length };
}

export async function indexStats() {
  const shared = await sharedTrustRepo.counts().catch(() => null);
  return {
    projects: projectsRepo.count(),
    users: usersRepo.count(),
    ...vouchRepo.counts(),
    recent: vouchRepo.recentEvents(10),
    suggestions: trustRepo.suggestLogins(8),
    projectSuggestions: trustRepo.suggestProjects(4),
    // Reported separately, never summed into the local totals.
    shared,
  };
}
