import { getDiscoverProjects } from "@/server/actions/pages";
import { DiscoverClient } from "./DiscoverClient";
import "../pages.css";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const projects = await getDiscoverProjects();
  return (
    <main className="container">
      <h1 className="page-title">Discover projects</h1>
      <p className="muted">
        Tell Gemma what you know and how much time you have. It suggests projects from the {projects.length} indexed
        projects that use Vouch, with one reason each.
      </p>
      <DiscoverClient projects={projects} />
    </main>
  );
}
