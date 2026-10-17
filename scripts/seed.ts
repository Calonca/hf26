// Demo vouch requests (is_seed = 1, shown with a "Demo request" chip) on a real repo the demo
// maintainer owns. Vouch requests are not public data, so these are the only seeded rows;
// projects and vouch lists all come from the crawler.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { projectsRepo, requestsRepo } from "../src/db/repo";
import { getRepoMeta } from "../src/server/github";

type SeedRequest = { project: string; requester_login: string; message: string; created_at: string };

async function main() {
  const removed = projectsRepo.deleteSeedProjects(); // older versions seeded fake projects
  const requests: SeedRequest[] = JSON.parse(fs.readFileSync(path.resolve("seed/requests.json"), "utf8"));
  requestsRepo.clearSeed();
  for (const r of requests) {
    let project = projectsRepo.findByOwnerRepo(r.project);
    if (!project) {
      const meta = await getRepoMeta(r.project);
      project = projectsRepo.upsert({
        full_name: meta.full_name,
        description: meta.description,
        language: meta.language,
        topics: JSON.stringify(meta.topics),
        stars: meta.stars,
        html_url: meta.html_url,
        contributing_url: null,
        is_seed: 0,
      });
    }
    requestsRepo.create({ project_id: project.id, requester_login: r.requester_login, message: r.message, created_at: r.created_at, is_seed: 1 });
  }
  console.log(`Seeded ${requests.length} demo requests${removed ? `, removed ${removed} old sample projects` : ""}.`);
}

main();
