import { kv } from "@vercel/kv";
import { requireSession } from "@/lib/dal";
import { entryKey, entryIndexKey, orgEntryIndexKey } from "@/lib/kv-keys";
import { todayDateKey, isValidDateKey, type EodEntry } from "@/lib/eod";

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const dateParam = new URL(request.url).searchParams.get("date");
  if (dateParam && !isValidDateKey(dateParam)) {
    return Response.json({ error: "Invalid date." }, { status: 400 });
  }

  const date = dateParam ?? todayDateKey();
  const entry = await kv.get<EodEntry>(entryKey(session.userId, date));

  return Response.json({ entry });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { content, date: dateInput } = (await request.json()) as {
    content?: string;
    date?: string;
  };

  const trimmed = (content ?? "").trim();
  if (!trimmed) {
    return Response.json({ error: "Content is required." }, { status: 400 });
  }

  const today = todayDateKey();

  // Optional date; defaults to today. Any past day is allowed, never a future one.
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
  const existing = await kv.get<EodEntry>(entryKey(session.userId, date));

  // Today's entry stays editable (upsert). Past days are write-once.
  if (date !== today && existing) {
    return Response.json(
      { error: "An EOD already exists for that day." },
      { status: 409 }
    );
  }

  const now = Date.now();
  const entry: EodEntry = {
    userId: session.userId,
    authorEmail: session.email,
    orgId: session.orgId,
    date,
    content: trimmed,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const score = Number(date.replaceAll("-", ""));
  await Promise.all([
    kv.set(entryKey(session.userId, date), entry),
    kv.zadd(entryIndexKey(session.userId), { score, member: date }),
    // Add to the org-wide feed so the whole team sees it.
    kv.zadd(orgEntryIndexKey(session.orgId), { score, member: `${date}#${session.userId}` }),
  ]);

  return Response.json({ entry });
}
