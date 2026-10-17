// GET /api/stats → index counts for the local crawl and the shared index.
import { indexStats } from "@/server/actions/explore";

export const revalidate = 60;

export async function GET() {
  const s = await indexStats();
  return Response.json({
    local: {
      projects: s.projects,
      users: s.users,
      vouched: s.vouched,
      denounced: s.denounced,
      events: s.events,
    },
    shared: s.shared,
  });
}
