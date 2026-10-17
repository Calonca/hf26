# Vouch Explorer

**Connects the islands of open-source trust.** Built for Hacktoberfest Hack Day, "Best Open-Source AI Project" challenge.

## Why

AI-generated slop PRs flood maintainers. [Vouch](https://github.com/mitchellh/vouch) answers with *explicit trust*: each repo keeps a plain-text `VOUCHED.td` listing who is vouched (or denounced). But every list is an island. A contributor vouched in five projects starts from zero in the sixth.

Vouch Explorer indexes public `VOUCHED.td` files and connects them:

| Page | What it does |
| --- | --- |
| **Explore** `/` | Trust graph: where a GitHub user is vouched, and by whom (voucher from git history, or "unknown"; never guessed). |
| **Profile** `/u/:handle` | A small in-browser model writes a short, explainable contribution brief from public PRs, reviews and issues, with every claim linked to evidence. **Never a score.** |
| **Requests** `/requests` | Maintainer inbox for vouch requests: the model lists checks with evidence and drafts a reply. A human clicks Vouch / Ask for more info / Denounce. |
| **Discover** `/discover` | Type your skills and weekly hours. The model ranks indexed projects and good-first issues, with a one-line reason each. |

## AI explains, humans decide

- No auto-vouch, no auto-denounce, no numeric reputation score anywhere.
- Every prompt says: *use only the data provided; say when evidence is missing; do not rate or score the person; do not recommend vouching or denouncing.*
- Every model output is given a JSON schema in the prompt, validated with zod on the server, and **every evidence link is checked against the input URLs**. Links the model invents are dropped.
- Decisions in Requests are recorded with who decided and when. In production this would open a PR updating `VOUCHED.td`; today nothing is written to GitHub.
- Public data only: public `VOUCHED.td` files and public GitHub activity.

## Model

**Qwen3.5 0.8B**, text-only build quantized to 4 bit ([`onnx-community/Qwen3.5-0.8B-Text-ONNX`](https://huggingface.co/onnx-community/Qwen3.5-0.8B-Text-ONNX)), open-weight (Apache 2.0), running **on the edge: in the visitor's browser** via [Transformers.js](https://huggingface.co/docs/transformers.js) in a Web Worker. WebGPU uses `q4f16` (~470 MB), the WASM fallback uses `q4` (~550 MB). The weights download from the Hugging Face Hub on first use and stay in the browser cache.

No inference server: the server builds the prompt (`prepareAi`), the browser runs the model, and the server validates and grounds the output (`submitAi`) before caching it in SQLite (`ai_briefs`). Cached results are served to everyone without loading the model. Switch model in `src/lib/edgeModel.ts` (e.g. `Qwen3.5-2B-ONNX` for better output at ~1.4 GB).

## Stack

- **Next.js 16** (App Router, React Server Components, server actions) and TypeScript. All GitHub and DB calls run on the server; the model runs in the browser.
- **Transformers.js** for the in-browser model.
- **TanStack Query** for loading and error states around slow model calls.
- **Drizzle ORM** + **SQLite** (`better-sqlite3`), file at `./data/vouch.db`. All access goes through `src/db/repo/*`, and only `src/db/client.ts` knows the driver, so moving to libSQL/Turso or Postgres touches only that file and the Drizzle dialect.
- **Octokit** for GitHub, with every response cached in the DB.
- **Cytoscape.js** for the trust graph.
- Plain CSS with variables, IBM Plex Sans/Mono.

## Setup

Requires Node 22+. To generate AI output, a recent browser (WebGPU recommended: Chrome, Edge or Safari) and ~500 MB free for the model cache.

```bash
cp .env.example .env                # GITHUB_TOKEN, DATABASE_URL
npm ci
npm run db:push                     # create tables
npm run db:seed                     # demo vouch requests on a real repo (labelled "Demo request"); everything else is crawled
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
