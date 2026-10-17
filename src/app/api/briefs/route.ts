// Cache for briefs generated in the browser. The model never runs here.
import { z } from "zod";
import { briefsRepo } from "@/db/repo/cacheRepo";
import { BRIEF_MODEL, PROMPT_VERSION } from "@/lib/brief";

const key = (subject_type: string, subject_key: string) => ({
  subject_type,
  subject_key,
  model: BRIEF_MODEL,
  prompt_version: PROMPT_VERSION,
});

export function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const subject_type = p.get("subject_type");
  const subject_key = p.get("subject_key");
  if (!subject_type || !subject_key) return Response.json({ error: "subject_type and subject_key required" }, { status: 400 });
  const row = briefsRepo.get(key(subject_type, subject_key));
  if (!row) return Response.json(null, { status: 404 });
  return Response.json({ text: JSON.parse(row.output_json).text, created_at: row.created_at });
}

const Body = z.object({
  subject_type: z.string().min(1),
  subject_key: z.string().min(1),
  input: z.unknown(),
  text: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.message }, { status: 400 });
  const { subject_type, subject_key, input, text } = body.data;
  briefsRepo.put(key(subject_type, subject_key), input, { text });
  return new Response(null, { status: 204 });
}
