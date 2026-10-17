// Shared by crawl + seed: apply a parsed VOUCHED.td to the DB.
import { projectsRepo, usersRepo, vouchRepo, type Project } from "../db/repo";
import { parseVouchFile } from "./vouchParser";

export function indexVouchFile(project: Project, text: string, opts: { sha: string; path: string; source: string }) {
  const entries = parseVouchFile(text);
  const before = vouchRepo.activeEntries(project.id);
  const seen = new Set<number>();
  let events = 0;
  for (const e of entries) {
    const user = usersRepo.upsert(e.login, e.platform);
    seen.add(user.id);
    const changed = vouchRepo.upsertEntry(project.id, user.id, e.status, e.note, e.line);
    if (changed && vouchRepo.addEvent({
      project_id: project.id,
      user_id: user.id,
      action: e.status === "vouched" ? "vouch" : "denounce",
      voucher_id: null, // unknown until enrich.ts reads git history
      commit_sha: opts.sha,
      source: opts.source,
    })) events++;
  }
  for (const b of before) {
    if (seen.has(b.entry.user_id)) continue;
    vouchRepo.markRemoved(b.entry.id);
    if (vouchRepo.addEvent({ project_id: project.id, user_id: b.entry.user_id, action: "remove", commit_sha: opts.sha, source: opts.source }))
      events++;
  }
  projectsRepo.setVouchFile(project.id, opts.path, opts.sha);
  return { entries: entries.length, events };
}
