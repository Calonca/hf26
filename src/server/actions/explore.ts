"use server";
import { projectsRepo, trustRepo, usersRepo, vouchRepo } from "../../db/repo";

export async function exploreSearch(q: string) {
  const query = q.trim().replace(/^@/, "");
  const kind = query.includes("/") ? ("project" as const) : ("user" as const);
  const edges = kind === "project" ? trustRepo.edgesForProject(query) : trustRepo.edgesForUser(query);
  return { kind, q: query, edges };
}

export async function indexStats() {
  return {
    projects: projectsRepo.count(),
    users: usersRepo.count(),
    ...vouchRepo.counts(),
    recent: vouchRepo.recentEvents(10),
    suggestions: trustRepo.suggestLogins(8),
  };
}
