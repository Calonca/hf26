# Vouch Explorer

**Connects the islands of open-source trust.** Built for Hacktoberfest Hack Day, "Best Open-Source AI Project" challenge.

**Presentation:** [Vouch Explorer slides](https://claude.ai/artifact/7n4nuT3J1MYDY1XMUyDWPH)

## Problem

- AI-generated slop PRs and issues flood maintainers.
- Projects respond with *explicit trust*. With [Vouch](https://github.com/mitchellh/vouch), each repo keeps a plain-text `VOUCHED.td` listing who is vouched for and who is denounced.
- But every list is an island:
  - **Maintainers** can't see that a newcomer is already trusted, or already denounced, in other projects.
  - **Newcomers** can't find projects where they could earn a vouch. Someone vouched in five projects starts from zero in the sixth.

## Solution

Vouch Explorer indexes public `VOUCHED.td` files and connects them into one trust graph. Gemma 4 explains the evidence, and a human makes the decision.

| Screen | What it does |
| --- | --- |
| **Explore** `/` | Trust graph for a GitHub user or an `owner/repo`. Solid green edges mean vouched; denounced users are highlighted in red on their own inner ring; dashed edges mean the voucher is unknown. Edge labels name the voucher, taken from git history and never guessed. Click a node to re-centre on it; fullscreen and fit buttons; a "Show profile" button. |
| **Profile** `/u/:handle` | Gemma's contribution brief, built from public PRs, reviews and issues, with every strength linked to evidence. A separate box states the vouch-list facts, generated from the database rather than by the model (for example "Denounced in 7 indexed projects with the note “Bad AI etiquette”"). Activity table per project. **Never a score.** |
| **Requests** `/requests` | Maintainer inbox. Gemma runs factual checks (✓ or !) with evidence and drafts a reply you can edit. The human clicks **Vouch**, **Ask for more info** or **Denounce…** (Denounce asks for confirmation). Decisions are stored in the database only; nothing is written to GitHub. |
| **Discover** `/discover` | Enter your skills and weekly hours. Gemma ranks indexed Vouch projects with a fit word (strong, good or stretch), a one-line reason and good-first issues. |

**AI queue.** A header panel lists every model job, running or queued, with a **Cancel** button. Cancelling stops Ollama mid-generation, and closing a profile cancels its brief automatically.

**AI explains, humans decide**
- No auto-vouch, no auto-denounce, and no numeric reputation score anywhere.
- Every prompt says: *use only the data provided; if evidence is missing, say so; do not rate or score the person; do not recommend vouching or denouncing.*
- Output is constrained by a JSON schema (Ollama's `format` option) and validated with zod.
- The model cites short IDs (`c3`, `a1`, `i42`) rather than URLs, and the server maps them back to real input URLs, so every evidence link is grounded by construction.
- Results are cached in SQLite (`ai_briefs`), so a pre-warmed demo works with Ollama stopped.
- **Public data only:** public `VOUCHED.td` files and public GitHub activity.

**Model: Gemma 4** (`gemma4:e2b-it-qat`, 4.3 GB; any Gemma 4 tag works via `OLLAMA_MODEL`). It's open-weight and runs **locally via [Ollama](https://ollama.com)** under the [Gemma Terms of Use](https://ai.google.dev/gemma/terms). No data leaves your machine for inference.

## Stack

- **Next.js 16**: App Router, server actions, and route handlers for cancellable AI calls (`/api/ai/brief`, `/api/ai/queue`).
- **TanStack Query**: loading, error and cancel states around slow model calls.
- **Drizzle ORM + SQLite** (`better-sqlite3`, `./data/vouch.db`).
  - All access goes through a repository layer in `src/db/repo/`.
  - Moving to Turso or Postgres means changing only `src/db/client.ts` and the Drizzle dialect.
  - The schema is portable: JSON stored as text, ISO-8601 timestamps, and no views (`trust_edges` is a query in the repo layer).
- **Octokit**: code search, repo metadata, file history and contributions. Every GitHub response is cached in the database.
- **Ollama + Gemma 4**: JSON-schema output, zod validation, one first-in-first-out queue, and abortable requests.
- **Cytoscape.js** for the graph, **[Arc UI](https://uiarc.dev)** components and tokens (CSS modules, copied into `src/components/arc/`; Geist, Inter and Geist Mono; light and dark theme), **vitest** for tests.
- `npm audit`: **0 production vulnerabilities**. The 4 moderate findings are dev-only, from `drizzle-kit`'s bundled esbuild.

## Instructions

```bash
ollama pull gemma4:e2b-it-qat
OLLAMA_IGPU_ENABLE=1 ollama serve   # optional: lets Ollama use an AMD/Intel integrated GPU (~2x faster on a Radeon 860M)

cp .env.example .env                # GITHUB_TOKEN (falls back to `gh auth token`), OLLAMA_MODEL, DATABASE_URL, NEXT_PUBLIC_DEMO_USER
npm ci
npm run db:push                     # create tables
npm run db:seed                     # demo vouch requests on a real repo (labelled "Demo request")
npm run crawl                       # find and index public VOUCHED.td files
npm run enrich                      # git history of each VOUCHED.td → who vouched whom
npm run dev                         # http://localhost:3000
npm test                            # parser + AI output grounding tests
```

- **`crawl` options:**
  - `--limit 300`: maximum repos.
  - `--force`: re-parse files even when unchanged.
  - `--repo owner/name`: index one repo directly; code search can take a while to pick up new files.
  - `--prune`: remove projects indexed from non-canonical paths.
- **`enrich` options:** `--limit 60`, `--commits 30`, `--repo owner/name`.
- **Before a demo:** open each demo screen once while the model is running, so its result is cached.

## Demo

Ground rule: demo on our own accounts. `slopmaster3000` is fictional.

1. **Our own repo dogfoods Vouch:** [`/?q=Calonca/hf26`](http://localhost:3000/?q=Calonca/hf26). The team is vouched in `.github/VOUCHED.td`, and the edges read "by @Calonca", taken from the repo's git history.
2. **A big project:** [`/?q=ghostty-org/ghostty`](http://localhost:3000/?q=ghostty-org/ghostty). 377 users, with the 24 denounced on the orange inner ring. Click **Fullscreen**.
3. **Mixed trust:** [`/?q=jamesarch`](http://localhost:3000/?q=jamesarch). Vouched in 5 projects and denounced in 7. Click any node to re-centre the graph on it.
4. **Profile:** [`/u/jamesarch`](http://localhost:3000/u/jamesarch). The vouch-list facts (from data) sit beside Gemma's brief, whose evidence links go to real PRs.
5. **Requests:** [`/requests`](http://localhost:3000/requests) on `Calonca/success-cli`.
   - Demo requests from deste04, fabianhogger and slopmaster3000.
   - Gemma's checks show ✓ or !, with a draft reply. Click Vouch, Ask for more info or Denounce….
6. **Discover:** [`/discover`](http://localhost:3000/discover) with the default query "TypeScript, React, writing docs" and "About 3 hours".
7. **AI queue:** open a few uncached profiles, open the **AI queue** panel, and cancel a job.

## Original contribution

**What already existed.** [Vouch](https://github.com/mitchellh/vouch) by Mitchell Hashimoto defines the `VOUCHED.td` trust format and its GitHub integration. We use it as is.

**What we built today:**
- **A cross-repo index of `VOUCHED.td` files.**
  - The crawler finds files through GitHub code search.
  - The parser handles optional `platform:` prefixes, notes, and the `+ handle` / `- handle` style seen in the wild. It has unit tests.
  - Removed entries are tracked as events.
- **Voucher attribution from git history.**
  - Each added or removed line is attributed to the commit's GitHub author.
  - If the author can't be resolved, the voucher stays "unknown"; it is never guessed.
- **Canonical-path filtering.** We found 54 repos whose "list" was a vendored copy or template, such as `vendor/ghostty/.github/VOUCHED.td`. Those copies credited ghostty's trust decisions to unrelated repos. Only `VOUCHED.td` and `.github/VOUCHED.td` are indexed now.
- **The trust graph.** Its size adapts to the number of nodes, denounced users are highlighted, and it has fullscreen and click-to-explore.
- **Grounded AI.**
  - Contribution briefs, request triage and project matching use Gemma 4 under strict prompts.
  - Evidence comes from IDs that map back to input URLs.
  - Vouch-list facts are generated from data, never by the model.
  - There are no scores.
- **AI queue with cancel**, plus cancellation when a page is closed, so a slow local model never blocks the demo.

**Honest limits:**
- Forks that keep the original list inflate some counts. For example, a user denounced in opencode appears in many opencode forks.
- Vouch requests aren't public data, so the Requests inbox uses seeded demo requests marked "Demo request".
- There is no auth: a `getCurrentUser()` stub returns the demo maintainer.

**Team:** [@Calonca](https://github.com/Calonca), [@deste04](https://github.com/deste04), [@fabianhogger](https://github.com/fabianhogger). deste04 explored running the model in the browser (transformers.js). Its short-ID evidence scheme and compact prompts were adopted on main.

**AI coding assistants:** much of the code was written with **Claude Code** (Claude Opus 5.5) under the team's direction. The team reviewed it, chose the design and scope, and tested it.

**Next steps:**
- A multi-user database (Turso or Postgres) with GitHub OAuth.
- Writing maintainer decisions back as PRs to `VOUCHED.td`.
- Excluding forks from counts.
- Other forges (GitLab, Codeberg).

## License

MIT. See [LICENSE](LICENSE).
