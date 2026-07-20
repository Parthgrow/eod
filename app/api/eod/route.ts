import { kv } from "@vercel/kv";
import { requireUserId } from "@/lib/dal";
import { entryKey, entryIndexKey } from "@/lib/kv-keys";
import { todayDateKey, type EodEntry } from "@/lib/eod";

export async function GET() {
  const userId = await requireUserId();
  if (userId instanceof Response) return userId;

  const date = todayDateKey();
  const entry = await kv.get<EodEntry>(entryKey(userId, date));

  return Response.json({ entry });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (userId instanceof Response) return userId;

  const { content } = (await request.json()) as { content?: string };
  const trimmed = (content ?? "").trim();
  if (!trimmed) {
    return Response.json({ error: "Content is required." }, { status: 400 });
  }

  const date = todayDateKey();
  const existing = await kv.get<EodEntry>(entryKey(userId, date));
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
