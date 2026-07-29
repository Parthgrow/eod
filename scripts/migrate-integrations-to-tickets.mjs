// One-off: migrate org-scoped API integration cards -> tickets on the "integrations" board.
// Additive (does not delete old keys). Run: node --env-file=.env scripts/migrate-integrations-to-tickets.mjs [--dry]
import { kv } from "@vercel/kv";

const DRY = process.argv.includes("--dry");
const SUFFIX = ":integrations";

const sets = await kv.keys("org:*:integrations");
console.log(`Found ${sets.length} org integrations index set(s).`);

let orgs = 0, migrated = 0, skipped = 0;
for (const setKey of sets) {
  const orgId = setKey.slice(4, setKey.length - SUFFIX.length); // strip "org:" and ":integrations"
  const ids = await kv.smembers(setKey);
  if (!ids.length) continue;
  orgs++;
  console.log(`\norg "${orgId}": ${ids.length} integration(s)`);
  for (const id of ids) {
    const old = await kv.get(`org:${orgId}:integration:${id}`);
    if (!old) { console.log(`  - ${id}: MISSING value, skip`); skipped++; continue; }
    const ticket = {
      id: old.id ?? id,
      boardId: "integrations",
      title: old.name ?? "(untitled)",
      status: old.status ?? "pending",
      createdAt: old.createdAt ?? Date.now(),
      updatedAt: old.updatedAt ?? Date.now(),
      ...(old.provider ? { provider: old.provider } : {}),
    };
    console.log(`  - "${ticket.title}" [${ticket.status}] provider=${ticket.provider ?? "-"}`);
    if (!DRY) {
      await kv.set(`org:${orgId}:board:integrations:ticket:${ticket.id}`, ticket);
      await kv.sadd(`org:${orgId}:board:integrations:tickets`, ticket.id);
    }
    migrated++;
  }
}

const globalSet = await kv.smembers("integrations").catch(() => []);
const globalKeys = await kv.keys("integration:*");
console.log(`\nLegacy GLOBAL (pre-org) data: set=${globalSet.length} keys=${globalKeys.length}`);
console.log(`\n${DRY ? "[DRY RUN] " : ""}orgs=${orgs} migrated=${migrated} skipped=${skipped}`);
if (DRY) console.log("Re-run without --dry to apply.");
