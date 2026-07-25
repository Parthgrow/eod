// Shared org types + domain helpers. No `server-only` here so these are safe to
// use from anywhere; KV access lives in lib/org-store.ts.

export type OrgKind = "team" | "personal";

// Only "member" today. A seam for future roles (e.g. "admin", "viewer") — the
// column exists so adding roles later needs no migration.
export type MemberRole = "member";

export type Organization = {
  id: string; // team: the domain; personal: `personal:{userId}`
  kind: OrgKind;
  domain: string; // email domain (informational for personal orgs)
  name: string;
  createdAt: number;
  createdBy: string; // userId of the first member
};

export type Membership = {
  userId: string;
  orgId: string;
  role: MemberRole;
  joinedAt: number;
};

// Common public/free email providers. Users on these never auto-share a
// workspace — each gets a personal (solo) org instead.
export const PUBLIC_EMAIL_DOMAINS = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.in",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "mail.com",
  "zoho.com",
  "yandex.com",
]);

export function domainOf(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

export function isPublicDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}
