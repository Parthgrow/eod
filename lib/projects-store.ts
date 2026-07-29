import "server-only";
import { kv } from "@vercel/kv";
import { projectKey, projectsIndexKey } from "@/lib/kv-keys";
import type { Project } from "@/lib/projects";

export async function listProjects(orgId: string): Promise<Project[]> {
  const ids = await kv.smembers<string[]>(projectsIndexKey(orgId));
  if (!ids.length) return [];

  const items = await Promise.all(ids.map((id) => kv.get<Project>(projectKey(orgId, id))));
  return items
    .filter((p): p is Project => p !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function findProjectByName(orgId: string, name: string): Promise<Project | null> {
  const target = name.trim().toLowerCase();
  const all = await listProjects(orgId);
  return all.find((p) => p.name.toLowerCase() === target) ?? null;
}

export async function createProject(orgId: string, name: string, createdBy: string): Promise<Project> {
  const now = Date.now();
  const project: Project = {
    id: crypto.randomUUID(),
    orgId,
    name: name.trim(),
    createdAt: now,
    createdBy,
  };

  await Promise.all([
    kv.set(projectKey(orgId, project.id), project),
    kv.sadd(projectsIndexKey(orgId), project.id),
  ]);
  return project;
}

// Used by the inline ticket flow: reuse an existing project by name, else create it.
export async function findOrCreateProjectByName(
  orgId: string,
  name: string,
  createdBy: string
): Promise<Project> {
  return (await findProjectByName(orgId, name)) ?? createProject(orgId, name, createdBy);
}
