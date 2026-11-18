import "server-only";
import { kv } from "@vercel/kv";
import { entryKey, entryIndexKey, orgEntryIndexKey } from "@/lib/kv-keys";

export type EodEntry = {
  userId: string;
  authorEmail: string; // denormalized so the org feed can show the author
  orgId: string;
  date: string; // YYYY-MM-DD, UTC calendar day
  content: string;
  createdAt: number;
  updatedAt: number;
};

export function todayDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function yesterdayDateKey(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// True only for a real YYYY-MM-DD calendar day (UTC). Rejects bad formats and
// impossible dates like 2026-02-30 (which Date would otherwise roll forward).
export function isValidDateKey(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

// The author of an entry. Always comes from the caller's session / user record,
// never from request input.
export type EodAuthor = { userId: string; email: string; orgId: string };

export async function getEntry(userId: string, date: string): Promise<EodEntry | null> {
  return (await kv.get<EodEntry>(entryKey(userId, date))) ?? null;
}

export type SaveEntryResult = { entry: EodEntry } | { error: string; status: number };

// The one place EOD save rules live (used by the web route and the MCP tool):
// - `date` is optional and defaults to today (UTC); future days are rejected.
// - Today's entry is editable (upsert). Past days are write-once.
// - `append: true` adds the content under the existing entry instead of replacing it.
export async function saveEntry(
  author: EodAuthor,
  input: { content?: unknown; date?: unknown; append?: boolean },
  now: Date = new Date()
): Promise<SaveEntryResult> {
  const trimmed = typeof input.content === "string" ? input.content.trim() : "";
  if (!trimmed) return { error: "Content is required.", status: 400 };

  const today = todayDateKey(now);

  if (input.date !== undefined && input.date !== null) {
    if (typeof input.date !== "string" || !isValidDateKey(input.date)) {
      return { error: "Invalid date.", status: 400 };
    }
    if (input.date > today) {
      return { error: "Cannot add an EOD for a future date.", status: 400 };
    }
  }

  const date = typeof input.date === "string" ? input.date : today;
  const existing = await getEntry(author.userId, date);

  if (date !== today && existing) {
    return { error: "An EOD already exists for that day.", status: 409 };
  }

  const content = input.append && existing ? `${existing.content}\n\n${trimmed}` : trimmed;

  const ts = now.getTime();
  const entry: EodEntry = {
    userId: author.userId,
    authorEmail: author.email,
    orgId: author.orgId,
    date,
    content,
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
  };

  const score = Number(date.replaceAll("-", ""));
  await Promise.all([
    kv.set(entryKey(author.userId, date), entry),
    kv.zadd(entryIndexKey(author.userId), { score, member: date }),
    // Add to the org-wide feed so the whole team sees it.
    kv.zadd(orgEntryIndexKey(author.orgId), { score, member: `${date}#${author.userId}` }),
  ]);

  return { entry };
}

export const ENTRIES_PAGE_SIZE = 10;

export type EntriesPage = {
  entries: EodEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export async function getEntriesPage(
  userId: string,
  page: number,
  pageSize: number = ENTRIES_PAGE_SIZE
): Promise<EntriesPage> {
  const start = page * pageSize;
  const stop = start + pageSize - 1;

  const [dates, total] = await Promise.all([
    kv.zrange<string[]>(entryIndexKey(userId), start, stop, { rev: true }),
    kv.zcard(entryIndexKey(userId)),
  ]);

  const entries = dates.length
    ? await Promise.all(dates.map((date) => kv.get<EodEntry>(entryKey(userId, date))))
    : [];

  return {
    entries: entries.filter((e): e is EodEntry => e !== null),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Org-wide feed: every member's entries, newest first. Reads the org index of
// `${date}#${userId}` refs and resolves each back to the authored entry.
export async function getOrgEntriesPage(
  orgId: string,
  page: number,
  pageSize: number = ENTRIES_PAGE_SIZE
): Promise<EntriesPage> {
  const start = page * pageSize;
  const stop = start + pageSize - 1;

  const [refs, total] = await Promise.all([
    kv.zrange<string[]>(orgEntryIndexKey(orgId), start, stop, { rev: true }),
    kv.zcard(orgEntryIndexKey(orgId)),
  ]);

  const entries = refs.length
    ? await Promise.all(
        refs.map((ref) => {
          const sep = ref.indexOf("#");
          return kv.get<EodEntry>(entryKey(ref.slice(sep + 1), ref.slice(0, sep)));
        })
      )
    : [];

  return {
    entries: entries.filter((e): e is EodEntry => e !== null),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
