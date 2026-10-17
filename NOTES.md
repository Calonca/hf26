# Notes and assumptions

- **No `schema.sql` was provided**, so we wrote one (`/schema.sql`) from the brief. `src/db/schema/index.ts` mirrors it, with the same table and column names.
- **Next.js instead of TanStack Start** (the team's decision on the day). TanStack Router file routes map to the App Router (`/`, `/u/[handle]`, `/requests`, `/discover`). `createServerFn` maps to **server actions** (`"use server"` in `src/server/actions/*`). TanStack Query is still used for client loading and error states.
- **Regenerate** on a brief bypasses the cache and overwrites the `ai_briefs` row for the current `(subject, model, prompt_version)`. Bumping `PROMPT_VERSION` in `gemma.ts` creates new rows and keeps the old ones.
- **Voucher attribution:** `crawl` records provisional `vouch_events` with `voucher_id = NULL` (shown as "unknown"). `enrich` replaces them with events derived from the git history of the vouch file, where the voucher is the commit author **only when GitHub resolves it to an account**. It is never guessed.
- Timestamps are ISO-8601 text and JSON is stored as text, so the SQL ports to Postgres. `trust_edges` is a repo function (`trustRepo`), not a DB view.
- No auth: `getCurrentUser()` returns a fixed demo maintainer (TODO: GitHub OAuth).
- **ESLint removed:** `eslint-config-next` pulled in packages with high-severity `npm audit` findings. TypeScript (`tsc --noEmit`) is the static check.
- Seeded projects and requests have `is_seed = 1` and show a "Sample data" chip.
