# Vouch Explorer

**Connects the islands of open-source trust.** Built for Hacktoberfest Hack Day, "Best Open-Source AI Project" challenge.

## Why

AI-generated slop PRs flood maintainers. [Vouch](https://github.com/mitchellh/vouch) answers with *explicit trust*: each repo keeps a plain-text `VOUCHED.td` listing who is vouched (or denounced). But every list is an island. A contributor vouched in five projects starts from zero in the sixth.

Vouch Explorer indexes public `VOUCHED.td` files and connects them:

| Page | What it does |
| --- | --- |
| **Explore** `/` | Trust graph: where a GitHub user is vouched, and by whom (voucher from git history, or "unknown"; never guessed). |
| **Profile** `/u/:handle` | Gemma writes a short, explainable contribution brief from public PRs, reviews and issues, with every claim linked to evidence. **Never a score.** |
| **Requests** `/requests` | Maintainer inbox for vouch requests: Gemma lists checks with evidence and drafts a reply. A human clicks Vouch / Ask for more info / Denounce. |
| **Discover** `/discover` | Type your skills and weekly hours. Gemma ranks indexed projects and good-first issues, with a one-line reason each. |

## AI explains, humans decide

- No auto-vouch, no auto-denounce, no numeric reputation score anywhere.
- Every prompt says: *use only the data provided; say when evidence is missing; do not rate or score the person; do not recommend vouching or denouncing.*
- Every model output is constrained with a JSON schema (Ollama `format`), validated with zod, and **every evidence link is checked against the input URLs**. Links the model invents are dropped.
- Decisions in Requests are recorded with who decided and when. In production this would open a PR updating `VOUCHED.td`; today nothing is written to GitHub.
- Public data only: public `VOUCHED.td` files and public GitHub activity.

## Model

**Gemma 4** (demo uses `gemma4:e2b-it-qat`, 4.3 GB; any Gemma 4 tag works via `OLLAMA_MODEL`), open-weight, running **locally via [Ollama](https://ollama.com)**. Gemma is provided under the [Gemma Terms of Use](https://ai.google.dev/gemma/terms). No data leaves your machine for inference. AI outputs are cached in SQLite (`ai_briefs`), so every page also works with Ollama stopped.

## Stack

- **Next.js 16** (App Router, React Server Components, server actions) and TypeScript. All GitHub, DB and model calls run on the server.
- **TanStack Query** for loading and error states around slow model calls.
- **Drizzle ORM** + **SQLite** (`better-sqlite3`), file at `./data/vouch.db`. All access goes through `src/db/repo/*`, and only `src/db/client.ts` knows the driver, so moving to libSQL/Turso or Postgres touches only that file and the Drizzle dialect.
- **Octokit** for GitHub, with every response cached in the DB.
- **Cytoscape.js** for the trust graph.
- Plain CSS with variables, IBM Plex Sans/Mono.

## Setup

Requires Node 22+ and [Ollama](https://ollama.com/download).

```bash
ollama pull gemma4:e2b-it-qat        # or set OLLAMA_MODEL to another Gemma 4 tag from `ollama list`
# AMD/Intel integrated GPU? Ollama skips iGPUs by default: OLLAMA_IGPU_ENABLE=1 ollama serve  (~2x faster on a Radeon 860M)
cp .env.example .env                # GITHUB_TOKEN, OLLAMA_MODEL, DATABASE_URL
npm ci
npm run db:push                     # create tables
npm run db:seed                     # sample projects + vouch requests (labelled "Sample data")
npm run crawl                       # index public VOUCHED.td files via GitHub code search
npm run enrich                      # read git history of each VOUCHED.td → who vouched whom
npm run dev                         # http://localhost:3000
```

**Pre-warming for a demo:** with the model running, open each demo screen once (Profile, each request on Requests, your Discover query). Results are cached in `ai_briefs`, so the same screens then load instantly even with the model stopped.

`GITHUB_TOKEN` needs only public read access. If it is empty, the scripts fall back to `gh auth token`.

Tests: `npm test` (vitest, VOUCHED.td parser checked against Vouch's `VOUCHED.example.td`).

Security: `npm audit` reports 0 vulnerabilities in production dependencies. 4 moderate dev-only advisories come from the esbuild version bundled in `drizzle-kit`, which only runs for `db:push`.

## Disclosure: AI coding assistants

This project was built with the help of **Claude Code** (Anthropic, Claude Opus 5.5). A human directed the work and made the decisions.

## Next steps

- Multi-user database (Turso/libSQL or Postgres) and GitHub OAuth (`src/server/auth.ts` is a stub today).
- Write maintainer decisions back as pull requests to `VOUCHED.td`.
- Other forges: GitLab, Codeberg (the parser already understands `platform:` prefixes).

## License

[MIT](LICENSE)
