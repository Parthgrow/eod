import "server-only";
import { kv } from "@vercel/kv";
import { integrationKey, integrationsIndexKey } from "@/lib/kv-keys";
import type { ApiIntegration, IntegrationStatus } from "@/lib/integrations";

// Scoped to an organization: every function takes the caller's orgId (which only
// ever comes from their session), so a user can't reach another org's board.

export async function listIntegrations(orgId: string): Promise<ApiIntegration[]> {
  const ids = await kv.smembers<string[]>(integrationsIndexKey(orgId));
  if (!ids.length) return [];

  const items = await Promise.all(
    ids.map((id) => kv.get<ApiIntegration>(integrationKey(orgId, id)))
  );

  return items
    .filter((i): i is ApiIntegration => i !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function createIntegration(
  orgId: string,
  input: { provider: string; name: string }
): Promise<ApiIntegration> {
  const now = Date.now();
  const integration: ApiIntegration = {
    id: crypto.randomUUID(),
    provider: input.provider,
    name: input.name,
    status: "pending", // new integrations always start in the first column
    createdAt: now,
    updatedAt: now,
  };

  await Promise.all([
    kv.set(integrationKey(orgId, integration.id), integration),
    kv.sadd(integrationsIndexKey(orgId), integration.id),
  ]);

  return integration;
}

export async function setIntegrationStatus(
  orgId: string,
  id: string,
  status: IntegrationStatus
): Promise<ApiIntegration | null> {
  const existing = await kv.get<ApiIntegration>(integrationKey(orgId, id));
  if (!existing) return null;

  const updated: ApiIntegration = { ...existing, status, updatedAt: Date.now() };
  await kv.set(integrationKey(orgId, id), updated);
  return updated;
}

export async function removeIntegration(orgId: string, id: string): Promise<boolean> {
  const existing = await kv.get<ApiIntegration>(integrationKey(orgId, id));
  if (!existing) return false;

  await Promise.all([
    kv.del(integrationKey(orgId, id)),
    kv.srem(integrationsIndexKey(orgId), id),
  ]);
  return true;
}
