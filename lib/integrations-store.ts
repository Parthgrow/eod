import "server-only";
import { kv } from "@vercel/kv";
import { integrationKey, integrationsIndexKey } from "@/lib/kv-keys";
import type { ApiIntegration, IntegrationStatus } from "@/lib/integrations";

// The board is a shared team artifact, so keys are not scoped by user.

export async function listIntegrations(): Promise<ApiIntegration[]> {
  const ids = await kv.smembers<string[]>(integrationsIndexKey());
  if (!ids.length) return [];

  const items = await Promise.all(
    ids.map((id) => kv.get<ApiIntegration>(integrationKey(id)))
  );

  return items
    .filter((i): i is ApiIntegration => i !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function createIntegration(input: {
  provider: string;
  name: string;
}): Promise<ApiIntegration> {
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
    kv.set(integrationKey(integration.id), integration),
    kv.sadd(integrationsIndexKey(), integration.id),
  ]);

  return integration;
}

export async function setIntegrationStatus(
  id: string,
  status: IntegrationStatus
): Promise<ApiIntegration | null> {
  const existing = await kv.get<ApiIntegration>(integrationKey(id));
  if (!existing) return null;

  const updated: ApiIntegration = { ...existing, status, updatedAt: Date.now() };
  await kv.set(integrationKey(id), updated);
  return updated;
}

export async function removeIntegration(id: string): Promise<boolean> {
  const existing = await kv.get<ApiIntegration>(integrationKey(id));
  if (!existing) return false;

  await Promise.all([
    kv.del(integrationKey(id)),
    kv.srem(integrationsIndexKey(), id),
  ]);
  return true;
}
