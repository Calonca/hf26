// Load sample projects (is_seed = 1), their VOUCHED.td files and sample vouch requests.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { projectsRepo, requestsRepo, usersRepo, vouchRepo } from "../src/db/repo";
import { indexVouchFile } from "../src/server/indexer";

type SeedProject = {
  full_name: string;
  description: string;
  language: string;
  topics: string[];
  stars: number;
  file: string;
  vouchers: Record<string, string>;
};

const dir = path.resolve("seed");
const projects: SeedProject[] = JSON.parse(fs.readFileSync(path.join(dir, "projects.json"), "utf8"));
const requests: { project: string; requester_login: string; message: string; created_at: string }[] = JSON.parse(
  fs.readFileSync(path.join(dir, "requests.json"), "utf8"),
);

let entries = 0;
let events = 0;
for (const s of projects) {
  const project = projectsRepo.upsert({
    full_name: s.full_name,
    description: s.description,
    language: s.language,
    topics: JSON.stringify(s.topics),
    stars: s.stars,
    html_url: null,
    contributing_url: null,
    is_seed: 1,
  });
  const text = fs.readFileSync(path.join(dir, "vouched", s.file), "utf8");
  const r = indexVouchFile(project, text, { sha: "seed", path: `seed/vouched/${s.file}`, source: "seed" });
  entries += r.entries;
  events += r.events;
  // Known vouchers for some entries; the rest stay "unknown" on purpose.
  for (const [login, voucher] of Object.entries(s.vouchers)) {
    if (vouchRepo.addEvent({
      project_id: project.id,
      user_id: usersRepo.upsert(login).id,
      action: "vouch",
      voucher_id: usersRepo.upsert(voucher).id,
      commit_sha: "seed-voucher",
      occurred_at: "2026-10-15T12:00:00.000Z",
      source: "seed",
    })) events++;
  }
}

requestsRepo.clearSeed();
for (const r of requests) {
  const project = projectsRepo.findByOwnerRepo(r.project)!;
  requestsRepo.create({ project_id: project.id, requester_login: r.requester_login, message: r.message, created_at: r.created_at, is_seed: 1 });
}
console.log(`Seeded ${projects.length} sample projects, ${entries} entries, ${events} events, ${requests.length} requests.`);
