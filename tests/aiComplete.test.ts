import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

// Point the DB at a throwaway file before anything imports the client.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vouch-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;

type Tasks = typeof import("../src/server/ai/tasks");
let tasks: Tasks;

beforeAll(async () => {
  execSync("npx drizzle-kit push --force", { env: process.env, stdio: "ignore" });
  tasks = await import("../src/server/ai/tasks");
});

const schema = z.object({ strengths: z.array(z.object({ text: z.string(), evidence_url: z.string() })) });
type Out = z.infer<typeof schema>;

function prepared(): import("../src/server/ai/tasks").Prepared<Out> {
  const urls = new Set(["https://github.com/a/b/pull/1"]);
  return {
    subjectType: "test",
    subjectKey: "k",
    promptVersion: "t1",
    input: { urls: [...urls] },
    schema,
    system: "s",
    prompt: "p",
    postprocess: ((o: Out) => ({ strengths: o.strengths.filter((s) => urls.has(s.evidence_url)) })) as (raw: never) => Out,
  };
}

describe("AI output handling", () => {
  it("drops evidence URLs that were not in the input, and caches", () => {
    const raw = JSON.stringify({
      strengths: [
        { text: "real", evidence_url: "https://github.com/a/b/pull/1" },
        { text: "invented", evidence_url: "https://github.com/x/y/pull/9" },
      ],
    });
    const r = tasks.complete(prepared(), raw, "m");
    expect(r.ok && r.data.strengths.map((s) => s.text)).toEqual(["real"]);
    expect(tasks.cachedResult(prepared(), "m")?.ok).toBe(true);
  });

  it("returns a typed error for invalid output", () => {
    const r = tasks.complete(prepared(), "{nope", "m");
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_output" } });
    const bad = tasks.complete(prepared(), JSON.stringify({ strengths: "x" }), "m");
    expect(bad).toMatchObject({ ok: false, error: { code: "invalid_output" } });
  });

  it("accepts JSON wrapped in a code fence, as small models often answer", () => {
    const r = tasks.complete(prepared(), '```json\n{"strengths":[]}\n```', "fenced");
    expect(r).toMatchObject({ ok: true, data: { strengths: [] } });
  });

  it("caches per model", () => {
    expect(tasks.cachedResult(prepared(), "other-model")).toBeUndefined();
  });
});
