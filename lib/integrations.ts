// Shared types + constants for the API integrations board.
// No `server-only` here on purpose: the client board needs STATUSES and the
// labels at runtime. KV access lives in lib/integrations-store.ts.

export const STATUSES = [
  "pending",
  "uat_access_given",
  "uat_tested",
  "production_tested",
  "prod_live",
] as const;

export type IntegrationStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<IntegrationStatus, string> = {
  pending: "Pending",
  uat_access_given: "UAT access given",
  uat_tested: "UAT tested",
  production_tested: "Production tested",
  prod_live: "Prod live",
};

export function isIntegrationStatus(value: unknown): value is IntegrationStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export type ApiIntegration = {
  id: string;
  provider: string;
  name: string;
  status: IntegrationStatus;
  createdAt: number;
  updatedAt: number;
};
