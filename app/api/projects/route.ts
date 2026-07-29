import { requireSession } from "@/lib/dal";
import { listProjects, findProjectByName, createProject } from "@/lib/projects-store";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const projects = await listProjects(session.orgId);
  return Response.json({ projects });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { name } = (await request.json()) as { name?: string };
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    return Response.json({ error: "Project name is required." }, { status: 400 });
  }

  const existing = await findProjectByName(session.orgId, trimmed);
  if (existing) {
    return Response.json({ error: "A project with that name already exists." }, { status: 409 });
  }

  const project = await createProject(session.orgId, trimmed, session.userId);
  return Response.json({ project });
}
