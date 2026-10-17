// Find public VOUCHED.td files via GitHub code search and index them.
// Usage: npm run crawl [-- --limit 300] [--force] [--repo owner/name]
import "dotenv/config";
import { projectsRepo } from "../src/db/repo";
import { contributingUrl, getFile, getRepoMeta, goodFirstIssues, octokit, sleep, withRetry } from "../src/server/github";
import { indexVouchFile } from "../src/server/indexer";

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : 300;
const FORCE = process.argv.includes("--force"); // re-parse even if the file SHA is unchanged

const repoArg = process.argv.indexOf("--repo"); // index one repo directly, e.g. --repo Calonca/hf26

async function searchVouchFiles() {
  if (repoArg > 0) {
    const name = process.argv[repoArg + 1];
    for (const path of ["VOUCHED.td", ".github/VOUCHED.td"]) if (await getFile(name, path)) return [[name, path]];
    throw new Error(`no VOUCHED.td in ${name}`);
  }
  const hits = new Map<string, string>(); // full_name → path
  for (let page = 1; hits.size < LIMIT && page <= 10; page++) {
    const { data } = await withRetry(() =>
      octokit().search.code({ q: "filename:VOUCHED.td", per_page: 100, page }),
    );
    for (const item of data.items) {
      const name = item.repository.full_name;
      // Prefer the canonical locations if a repo has several matches.
      const prev = hits.get(name);
      if (!prev || item.path === "VOUCHED.td" || (item.path === ".github/VOUCHED.td" && prev !== "VOUCHED.td"))
        hits.set(name, item.path);
    }
    console.log(`search page ${page}: ${data.items.length} hits (total ${data.total_count})`);
    if (data.items.length < 100) break;
    await sleep(7000); // code search: 10 req/min
  }
  return [...hits].slice(0, LIMIT);
}

async function indexOne(fullName: string, path: string) {
  const meta = await getRepoMeta(fullName);
  const file = await getFile(fullName, path);
  if (!file) return { skipped: true, entries: 0, events: 0 };
  const existing = projectsRepo.findByOwnerRepo(meta.full_name);
  const project = projectsRepo.upsert({
    full_name: meta.full_name,
    description: meta.description,
    language: meta.language,
    topics: JSON.stringify(meta.topics),
    stars: meta.stars,
    html_url: meta.html_url,
    contributing_url: existing?.contributing_url ?? (await contributingUrl(meta.full_name)),
    is_seed: 0,
  });
  try {
    projectsRepo.replaceIssues(project.id, await goodFirstIssues(meta.full_name));
  } catch {
    /* issues disabled */
  }
  if (!FORCE && existing?.vouch_file_sha === file.sha) return { skipped: true, entries: 0, events: 0 };
  return { skipped: false, ...indexVouchFile(project, file.text, { sha: file.sha, path, source: "crawl" }) };
}

async function main() {
  const hits = await searchVouchFiles();
  console.log(`indexing ${hits.length} repositories…`);
  const totals = { projects: 0, skipped: 0, failed: 0, entries: 0, events: 0 };
  let i = 0;
  const worker = async () => {
    while (i < hits.length) {
      const [name, path] = hits[i++];
      try {
        const r = await indexOne(name, path);
        totals.projects++;
        if (r.skipped) totals.skipped++;
        totals.entries += r.entries;
        totals.events += r.events;
      } catch (err) {
        totals.failed++;
        console.warn(`  ${name}: ${(err as Error).message}`);
      }
      if (totals.projects % 25 === 0) process.stdout.write(`  ${totals.projects}/${hits.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(
    `\nSummary: ${totals.projects} projects found (${totals.skipped} unchanged, ${totals.failed} failed), ` +
      `${totals.entries} entries parsed, ${totals.events} events created`,
  );
}

main();
