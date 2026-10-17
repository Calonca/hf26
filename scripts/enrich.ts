// Walk the git history of each project's VOUCHED.td and record who added/removed each line.
// voucher_id = the commit's GitHub author when GitHub resolves it, else NULL. Never guessed.
// Usage: npm run enrich [-- --limit 60 --commits 30]
import "dotenv/config";
import { projectsRepo, usersRepo, vouchRepo } from "../src/db/repo";
import { fileCommits } from "../src/server/github";
import { entryKeys } from "../src/server/vouchParser";

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const LIMIT = arg("--limit", 60);
const MAX_COMMITS = arg("--commits", 30);

async function rawAt(fullName: string, sha: string, path: string): Promise<string | null> {
  // raw.githubusercontent.com does not count against the REST API rate limit.
  const res = await fetch(`https://raw.githubusercontent.com/${fullName}/${sha}/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`raw ${res.status}`);
  return res.text();
}

async function enrichOne(p: ReturnType<typeof projectsRepo.list>[number]) {
  const path = p.vouch_file_path!;
  const commits = await fileCommits(p.full_name, path, MAX_COMMITS);
  let prev: ReturnType<typeof entryKeys> = new Map();
  // If history was truncated, diff the first commit against its own parent state.
  if (commits.length === MAX_COMMITS) {
    const first = commits.shift()!;
    prev = entryKeys((await rawAt(p.full_name, first.sha, path)) ?? "");
  }
  let events = 0;
  for (const c of commits) {
    const text = await rawAt(p.full_name, c.sha, path);
    const cur = entryKeys(text ?? "");
    const voucher = c.author ? usersRepo.upsert(c.author).id : null;
    const record = (login: string, platform: string, action: "vouch" | "denounce" | "remove") => {
      const user = usersRepo.upsert(login, platform);
      if (vouchRepo.addEvent({ project_id: p.id, user_id: user.id, action, voucher_id: voucher, commit_sha: c.sha, occurred_at: c.date, source: "git" }))
        events++;
    };
    for (const [key, e] of cur) {
      const before = prev.get(key);
      if (!before || before.status !== e.status) record(e.login, e.platform, e.status === "vouched" ? "vouch" : "denounce");
    }
    for (const [key, e] of prev) if (!cur.has(key)) record(e.login, e.platform, "remove");
    prev = cur;
  }
  if (events > 0) vouchRepo.deleteCrawlEvents(p.id);
  return { commits: commits.length, events };
}

async function main() {
  const targets = projectsRepo
    .list()
    .filter((p) => !p.is_seed && p.vouch_file_path)
    .slice(0, LIMIT);
  console.log(`enriching ${targets.length} projects (max ${MAX_COMMITS} commits each)…`);
  const totals = { projects: 0, commits: 0, events: 0, failed: 0 };
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < targets.length) {
        const p = targets[i++];
        try {
          const r = await enrichOne(p);
          totals.projects++;
          totals.commits += r.commits;
          totals.events += r.events;
        } catch (err) {
          totals.failed++;
          console.warn(`  ${p.full_name}: ${(err as Error).message}`);
        }
      }
    }),
  );
  console.log(`\nSummary: ${totals.projects} projects, ${totals.commits} commits read, ${totals.events} events created, ${totals.failed} failed`);
}

main();
