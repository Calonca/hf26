// Drizzle translation of /schema.sql. Table and column names are identical.
import { sqliteTable, integer, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey(),
  full_name: text("full_name").notNull().unique(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  description: text("description"),
  language: text("language"),
  topics: text("topics").notNull().default("[]"),
  stars: integer("stars").notNull().default(0),
  html_url: text("html_url"),
  contributing_url: text("contributing_url"),
  vouch_file_path: text("vouch_file_path"),
  vouch_file_sha: text("vouch_file_sha"),
  indexed_at: text("indexed_at"),
  is_seed: integer("is_seed").notNull().default(0),
  created_by: text("created_by"),
});

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey(),
    platform: text("platform").notNull().default("github"),
    login: text("login").notNull(),
    avatar_url: text("avatar_url"),
  },
  (t) => [uniqueIndex("users_platform_login").on(t.platform, t.login)],
);

export const vouch_entries = sqliteTable(
  "vouch_entries",
  {
    id: integer("id").primaryKey(),
    project_id: integer("project_id").notNull().references(() => projects.id),
    user_id: integer("user_id").notNull().references(() => users.id),
    status: text("status").notNull(),
    note: text("note"),
    line_no: integer("line_no"),
    first_seen_at: text("first_seen_at").notNull(),
    removed_at: text("removed_at"),
  },
  (t) => [uniqueIndex("vouch_entries_project_user").on(t.project_id, t.user_id)],
);

export const vouch_events = sqliteTable(
  "vouch_events",
  {
    id: integer("id").primaryKey(),
    project_id: integer("project_id").notNull().references(() => projects.id),
    user_id: integer("user_id").notNull().references(() => users.id),
    action: text("action").notNull(),
    voucher_id: integer("voucher_id").references(() => users.id),
    commit_sha: text("commit_sha"),
    occurred_at: text("occurred_at").notNull(),
    source: text("source").notNull().default("crawl"),
  },
  (t) => [uniqueIndex("vouch_events_unique").on(t.project_id, t.user_id, t.action, t.commit_sha)],
);

export const issues = sqliteTable(
  "issues",
  {
    id: integer("id").primaryKey(),
    project_id: integer("project_id").notNull().references(() => projects.id),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    labels: text("labels").notNull().default("[]"),
    fetched_at: text("fetched_at").notNull(),
  },
  (t) => [uniqueIndex("issues_project_number").on(t.project_id, t.number)],
);

export const vouch_requests = sqliteTable("vouch_requests", {
  id: integer("id").primaryKey(),
  project_id: integer("project_id").notNull().references(() => projects.id),
  requester_login: text("requester_login").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  reply_text: text("reply_text"),
  created_at: text("created_at").notNull(),
  decided_by: text("decided_by"),
  decided_at: text("decided_at"),
  is_seed: integer("is_seed").notNull().default(0),
});

export const ai_briefs = sqliteTable(
  "ai_briefs",
  {
    id: integer("id").primaryKey(),
    subject_type: text("subject_type").notNull(),
    subject_key: text("subject_key").notNull(),
    model: text("model").notNull(),
    prompt_version: text("prompt_version").notNull(),
    input_json: text("input_json").notNull(),
    output_json: text("output_json").notNull(),
    created_at: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("ai_briefs_key").on(t.subject_type, t.subject_key, t.model, t.prompt_version)],
);

export const github_cache = sqliteTable("github_cache", {
  cache_key: text("cache_key").primaryKey(),
  json: text("json").notNull(),
  fetched_at: text("fetched_at").notNull(),
});
