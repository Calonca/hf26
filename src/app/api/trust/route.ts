// GET /api/trust?q=<handle|owner/repo> → merged local + shared trust edges.
// Read-only, fixed response shape, whitelisted parameter: no caller-chosen
// columns, filters or SQL. The fixed shape is what makes this safe.
import { exploreSearch } from "@/server/actions/explore";
import { cleanQuery } from "@/lib/query";

export const revalidate = 60;

const MAX_Q = 120;
const VALID_Q = /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/;

export async function GET(request: Request) {
  const raw = cleanQuery(new URL(request.url).searchParams.get("q") ?? "");
  if (!raw || raw.length > MAX_Q || !VALID_Q.test(raw)) {
    return Response.json(
      { error: "Pass ?q= a GitHub handle or owner/repo." },
      { status: 400 },
    );
  }
  const { kind, q, edges, sharedCount } = await exploreSearch(raw);
  return Response.json({ kind, q, count: edges.length, sharedCount, edges });
}
