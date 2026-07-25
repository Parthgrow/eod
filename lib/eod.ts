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
