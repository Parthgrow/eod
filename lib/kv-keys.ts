export function userKey(userId: string): string {
  return `eod:user:${userId}`;
}

export function userByEmailKey(email: string): string {
  return `eod:user:by-email:${email.trim().toLowerCase()}`;
}

export function accountKey(providerId: string, userId: string): string {
  return `eod:account:${providerId}:${userId}`;
}

export function entryKey(userId: string, date: string): string {
  return `eod:user:${userId}:entry:${date}`;
}

export function entryIndexKey(userId: string): string {
  return `eod:user:${userId}:entry_dates`;
}

// API integrations board — a shared team artifact, so these keys are global
// (not scoped by user).
export function integrationKey(id: string): string {
  return `integration:${id}`;
}

export function integrationsIndexKey(): string {
  return "integrations";
}
