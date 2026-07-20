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
