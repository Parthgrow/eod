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

// Organizations & membership (workspaces).
export function orgKey(orgId: string): string {
  return `org:${orgId}`;
}

export function orgMembersKey(orgId: string): string {
  return `org:${orgId}:members`; // Set<userId> — org → users index
}

export function orgMemberKey(orgId: string, userId: string): string {
  return `org:${orgId}:member:${userId}`; // Hash — the membership "row"
}

export function userOrgsKey(userId: string): string {
  return `eod:user:${userId}:orgs`; // Set<orgId> — user → orgs index (many-to-many seam)
}

// Boards & tickets — a board's tickets are scoped to an organization.
export function boardTicketsIndexKey(orgId: string, boardId: string): string {
  return `org:${orgId}:board:${boardId}:tickets`;
}

export function boardTicketKey(orgId: string, boardId: string, ticketId: string): string {
  return `org:${orgId}:board:${boardId}:ticket:${ticketId}`;
}

// Org-wide EOD feed — sorted set of `${date}#${userId}` refs, scored by date.
export function orgEntryIndexKey(orgId: string): string {
  return `org:${orgId}:eod_index`;
}
