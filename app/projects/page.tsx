import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { getOrg } from "@/lib/org-store";
import { listProjects } from "@/lib/projects-store";
import ProjectsView from "@/app/projects/ProjectsView";

export default async function ProjectsPage() {
  const session = await verifySession();
  const [org, projects] = await Promise.all([
    getOrg(session.orgId),
    listProjects(session.orgId),
  ]);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-2xl mx-auto flex-col gap-6 py-12 px-6">
        <div className="w-full flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium text-black dark:text-zinc-50">Projects</h1>
            {org && <p className="text-xs text-zinc-500">{org.name}</p>}
          </div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-black dark:hover:text-white">
            Back
          </Link>
        </div>
        <ProjectsView initial={projects} />
      </main>
    </div>
  );
}
