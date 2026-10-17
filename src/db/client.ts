// The only file that knows which database driver is in use.
// To move to libSQL/Turso: swap better-sqlite3 for @libsql/client + drizzle-orm/libsql.
// To move to Postgres: swap for pg + drizzle-orm/node-postgres and sqlite-core → pg-core in schema/.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export function databasePath(url = process.env.DATABASE_URL ?? "file:./data/vouch.db") {
  return path.resolve(url.replace(/^file:/, ""));
}

function connect() {
  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

// Reuse one connection across Next.js hot reloads.
const g = globalThis as unknown as { __vouchDb?: ReturnType<typeof connect> };
export const db = g.__vouchDb ?? (g.__vouchDb = connect());
export type DB = typeof db;
export { schema };
export const now = () => new Date().toISOString();
