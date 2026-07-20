import "server-only";
import { kv } from "@vercel/kv";
import { entryKey, entryIndexKey } from "@/lib/kv-keys";

export type EodEntry = {
  userId: string;
  date: string; // YYYY-MM-DD, UTC calendar day
  content: string;
  createdAt: number;
  updatedAt: number;
};

export function todayDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
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
