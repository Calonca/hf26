import { getDiscoverProjects } from "@/server/actions/pages";
import { DiscoverClient } from "./DiscoverClient";
import "./discover.css";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const projects = await getDiscoverProjects();
  return (
    <main className="container">
      <DiscoverClient projects={projects} />
    </main>
  );
}
