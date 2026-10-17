# Notes and assumptions

- **No `schema.sql` was provided**, so we wrote one (`/schema.sql`) from the brief. `src/db/schema/index.ts` mirrors it, with the same table and column names.
- **Next.js instead of TanStack Start** (the team's decision on the day). TanStack Router file routes map to the App Router (`/`, `/u/[handle]`, `/requests`, `/discover`). `createServerFn` maps to **server actions** (`"use server"` in `src/server/actions/*`). TanStack Query is still used for client loading and error states.
- **Regenerate** on a brief bypasses the cache and overwrites the `ai_briefs` row for the current `(subject, model, prompt_version)`. Bumping `PROMPT_VERSIONS` in `src/server/ai/tasks.ts` creates new rows and keeps the old ones.
- **Voucher attribution:** `crawl` records provisional `vouch_events` with `voucher_id = NULL` (shown as "unknown"). `enrich` replaces them with events derived from the git history of the vouch file, where the voucher is the commit author **only when GitHub resolves it to an account**. It is never guessed.
- Timestamps are ISO-8601 text and JSON is stored as text, so the SQL ports to Postgres. `trust_edges` is a repo function (`trustRepo`), not a DB view.
- No auth: `getCurrentUser()` returns a fixed demo maintainer (TODO: GitHub OAuth).
- **ESLint removed:** `eslint-config-next` pulled in packages with high-severity `npm audit` findings. TypeScript (`tsc --noEmit`) is the static check.
- Seeded projects and requests have `is_seed = 1` and show a "Sample data" chip.

## Edge AI (model in the browser)

There is no inference server. The model call is isolated, so prompts, validation and caching stay on the server:

- `src/server/ai/tasks.ts`: model-agnostic. `prepareBrief / prepareTriage / prepareDiscover` build the input + prompt + zod schema; `complete()` does JSON extraction → zod → drops any URL not present in the input → caches in `ai_briefs` keyed by `(subject_type, subject_key, model, prompt_version)`.
- `src/lib/edgeModel.ts`: `EDGE_MODEL` (`onnx-community/Qwen3.5-0.8B-Text-ONNX`, 4-bit). It is part of the cache key.
- `src/client/edgeWorker.ts`: Transformers.js in a Web Worker. WebGPU `q4f16` (~470 MB), WASM `q4` fallback (~550 MB). Thinking disabled.
- `src/client/edgeAi.ts`: `runEdge(task, force)` = `prepareAi` (cached result or prompt spec) → worker → `submitAi` (validated + cached on the server), retried once on invalid output. One generation at a time. `useEdgeStatus()` exposes download progress.
  - `task` is `{kind:"brief",login}` | `{kind:"triage",requestId}` | `{kind:"discover",skills,hours}`.
  - Triage uses the requester's cached brief, so `RequestList` runs the brief first.
- Transformers.js has no constrained decoding: the JSON schema goes into the system prompt and `complete()` tolerates ```json fences.
- Discover pre-filters to the 25 projects with the best keyword overlap so the prompt (~7 KB) fits a small model's context.
