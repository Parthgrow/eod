import "server-only";
import { kv } from "@vercel/kv";
import { boardTagsKey } from "@/lib/kv-keys";
import type { Board } from "@/lib/boards";
import type { Tag } from "@/lib/tickets";
import type { StoreError } from "@/lib/tickets-store";

// A board's tag catalog, scoped to an org. Tickets store tag *ids*; names are
// resolved from this catalog when shown. Only boards with `tags` in their
// definition (lib/boards.ts) have one.

export const MAX_TAG_NAME = 30;
export const MAX_TAGS_PER_BOARD = 50;
export const MAX_TAGS_PER_TICKET = 10;

// "Rich Pay" -> "rich-pay". The id doubles as a case-insensitive uniqueness key.
export function tagIdFor(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function noTags(board: Board): StoreError {
  return { error: `The ${board.title} board doesn't use tags.`, status: 404 };
}

// Lists the catalog, seeding the board's defaults the first time. HSETNX keeps
// the seed race-safe and never overwrites a tag that already exists.
export async function listTags(orgId: string, board: Board): Promise<Tag[]> {
  if (!board.tags) return [];
  const key = boardTagsKey(orgId, board.id);

  let all = await kv.hgetall<Record<string, Tag>>(key);
  if (!all || Object.keys(all).length === 0) {
    const now = Date.now();
    await Promise.all(
      board.tags.defaults.map((name, i) => {
        const tag: Tag = { id: tagIdFor(name), name, createdAt: now + i };
        return kv.hsetnx(key, tag.id, tag);
      })
    );
    all = await kv.hgetall<Record<string, Tag>>(key);
  }

  return Object.values(all ?? {}).sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name));
}

// Adds a tag, or returns the existing one with the same name (case-insensitive),
// so "create" from a picker is always safe to call.
export async function createTag(
  orgId: string,
  board: Board,
  rawName: unknown,
  createdBy: string
): Promise<{ tag: Tag; created: boolean } | StoreError> {
  if (!board.tags) return noTags(board);

  const name = typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ") : "";
  if (!name) return { error: "Tag name is required." };
  if (name.length > MAX_TAG_NAME) return { error: `Tag names can be at most ${MAX_TAG_NAME} characters.` };
  const id = tagIdFor(name);
  if (!id) return { error: "Tag names need at least one letter or number." };

  const existing = await listTags(orgId, board); // also seeds defaults
  const same = existing.find((t) => t.id === id);
  if (same) return { tag: same, created: false };
  if (existing.length >= MAX_TAGS_PER_BOARD) {
    return { error: `This board can have at most ${MAX_TAGS_PER_BOARD} tags.` };
  }

  const tag: Tag = { id, name, createdAt: Date.now(), createdBy };
  const won = await kv.hsetnx(boardTagsKey(orgId, board.id), id, tag);
  if (!won) {
    // Someone added the same name a moment ago; return theirs.
    const theirs = await kv.hget<Tag>(boardTagsKey(orgId, board.id), id);
    if (theirs) return { tag: theirs, created: false };
  }
  return { tag, created: true };
}

// Validates a ticket's tag list against the catalog. Accepts tag ids or names
// (names are matched case-insensitively). Returns unique ids in catalog order.
export async function resolveTagIds(orgId: string, board: Board, raw: unknown): Promise<string[] | StoreError> {
  if (!board.tags) return noTags(board);
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) {
    return { error: "Tags must be a list of tag names or ids." };
  }

  const catalog = await listTags(orgId, board);
  const wanted = new Set<string>();
  for (const value of raw as string[]) {
    const id = tagIdFor(value);
    if (!id) continue;
    if (!catalog.some((t) => t.id === id)) {
      return { error: `Unknown ${board.tags.label} tag "${value}". Add it to the board first.` };
    }
    wanted.add(id);
  }
  if (wanted.size > MAX_TAGS_PER_TICKET) {
    return { error: `A ticket can have at most ${MAX_TAGS_PER_TICKET} tags.` };
  }
  return catalog.filter((t) => wanted.has(t.id)).map((t) => t.id);
}
