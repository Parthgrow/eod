import { kv } from "@vercel/kv";
import { requireUserId } from "@/lib/dal";
import { entryKey, entryIndexKey } from "@/lib/kv-keys";
import { todayDateKey, isValidDateKey, type EodEntry } from "@/lib/eod";

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (userId instanceof Response) return userId;

  const dateParam = new URL(request.url).searchParams.get("date");
  if (dateParam && !isValidDateKey(dateParam)) {
    return Response.json({ error: "Invalid date." }, { status: 400 });
  }

  const date = dateParam ?? todayDateKey();
  const entry = await kv.get<EodEntry>(entryKey(userId, date));

  return Response.json({ entry });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (userId instanceof Response) return userId;

  const { content, date: dateInput } = (await request.json()) as {
    content?: string;
    date?: string;
  };

  const trimmed = (content ?? "").trim();
  if (!trimmed) {
    return Response.json({ error: "Content is required." }, { status: 400 });
  }

  const today = todayDateKey();

  // The date is optional and defaults to today. When provided it may be any
  // past day (or today), but never a future one or a malformed value.
  if (dateInput !== undefined) {
    if (!isValidDateKey(dateInput)) {
      return Response.json({ error: "Invalid date." }, { status: 400 });
    }
    if (dateInput > today) {
      return Response.json(
        { error: "Cannot add an EOD for a future date." },
        { status: 400 }
      );
    }
  }

  const date = dateInput ?? today;
  const existing = await kv.get<EodEntry>(entryKey(userId, date));

  // Today's entry stays editable (upsert). Past days are write-once: once an
  // EOD exists for a past date it cannot be overwritten.
  if (date !== today && existing) {
    return Response.json(
      { error: "An EOD already exists for that day." },
      { status: 409 }
    );
  }

  const now = Date.now();
  const entry: EodEntry = {
    userId,
    date,
    content: trimmed,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await Promise.all([
    kv.set(entryKey(userId, date), entry),
    kv.zadd(entryIndexKey(userId), { score: Number(date.replaceAll("-", "")), member: date }),
  ]);

  return Response.json({ entry });
}
