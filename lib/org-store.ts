import "server-only";
import { kv } from "@vercel/kv";
import {
  orgKey,
  orgMembersKey,
  orgMemberKey,
  userKey,
  userOrgsKey,
} from "@/lib/kv-keys";
import {
  domainOf,
  isPublicDomain,
  type Membership,
  type Organization,
} from "@/lib/org";

export async function getOrg(orgId: string): Promise<Organization | null> {
  const org = await kv.hgetall<Organization>(orgKey(orgId));
  return org ?? null;
}

// Resolves (creating if needed) the org for a user from their email domain,
// ensures their membership, and stamps their active org onto the user record.
// Idempotent, so it's safe to call on every sign-in — which also back-fills
// accounts created before organizations existed (no migration needed).
export async function resolveOrgForUser(user: {
  id: string;
  email: string;
}): Promise<string> {
  const domain = domainOf(user.email);
  const personal = !domain || isPublicDomain(domain);
  const orgId = personal ? `personal:${user.id}` : domain;
  const now = Date.now();

  // Create the org row only if it doesn't exist yet.
  if (!(await kv.exists(orgKey(orgId)))) {
    const org: Organization = {
      id: orgId,
      kind: personal ? "personal" : "team",
      domain,
      name: personal ? user.email : domain,
      createdAt: now,
      createdBy: user.id,
    };
    await kv.hset(orgKey(orgId), org);
  }

  // Create the membership row only if absent (preserve the original joinedAt).
  if (!(await kv.exists(orgMemberKey(orgId, user.id)))) {
    const membership: Membership = {
      userId: user.id,
      orgId,
      role: "member",
      joinedAt: now,
    };
    await kv.hset(orgMemberKey(orgId, user.id), membership);
  }

  await Promise.all([
    kv.sadd(orgMembersKey(orgId), user.id), // org → users index
    kv.sadd(userOrgsKey(user.id), orgId), // user → orgs index (many-to-many seam)
    kv.hset(userKey(user.id), { orgId }), // active-org pointer on the user record
  ]);

  return orgId;
}
