// The only file that knows how to reach the shared index (Lakebase Postgres on Neon).
// Optional by design: with NEON_DATABASE_URL unset the app runs exactly as before,
// on local SQLite alone. Deliberately separate from DATABASE_URL, which is SQLite's.
import { Pool } from "pg";

/** True when a shared index is configured. Callers skip the round-trip when false. */
export function neonEnabled() {
  return !!process.env.NEON_DATABASE_URL;
}

/**
 * Credentials embedded in the URL override PGUSER/PGPASSWORD (verified behaviour of
 * node-postgres). So a credential-less NEON_DATABASE_URL silently inherits whatever
 * PGUSER is — which is typically the *owner*, defeating the read-only guarantee.
 * Warn loudly rather than quietly running the app with write access.
 */
function warnIfInheritingAmbientCredentials(url: string) {
  let user = "";
  try {
    user = new URL(url).username;
  } catch {
    console.warn("NEON_DATABASE_URL is not a valid postgres:// URL.");
    return;
  }
  if (!user && process.env.PGUSER) {
    console.warn(
      `NEON_DATABASE_URL has no user, so it will connect as PGUSER="${process.env.PGUSER}". ` +
        "Embed a SELECT-only role in the URL instead; the app should never hold write access.",
    );
  }
}

function connect() {
  warnIfInheritingAmbientCredentials(process.env.NEON_DATABASE_URL ?? "");
  return new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    // Use the pooled (-pooler) host here; direct connections are for migrations.
    max: 5,
    idleTimeoutMillis: 30_000,
    // Neon computes scale to zero when idle, and the first connection has to wake
    // one. That cold start regularly exceeds 5s, so a short timeout makes the
    // shared index look permanently unavailable. Keep the pool warm-ish and allow
    // the wake-up; failures still degrade to local-only rendering.
    connectionTimeoutMillis: 15_000,
  });
}

// Reuse one pool across Next.js hot reloads.
const g = globalThis as unknown as { __vouchNeon?: Pool };

/** The shared-index pool, or undefined when no shared index is configured. */
export function neonPool(): Pool | undefined {
  if (!neonEnabled()) return undefined;
  return g.__vouchNeon ?? (g.__vouchNeon = connect());
}
