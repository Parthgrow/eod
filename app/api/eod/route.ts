import { requireSession } from "@/lib/dal";
import { readJson } from "@/lib/board-api";
import { getEntry, saveEntry, todayDateKey, isValidDateKey } from "@/lib/eod";

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const dateParam = new URL(request.url).searchParams.get("date");
  if (dateParam && !isValidDateKey(dateParam)) {
    return Response.json({ error: "Invalid date." }, { status: 400 });
  }

  const entry = await getEntry(session.userId, dateParam ?? todayDateKey());
  return Response.json({ entry });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = await readJson(request);
  if (!body) return Response.json({ error: "Invalid request body." }, { status: 400 });

  // The save rules (today is editable, past days are write-once, no future
  // days) live in lib/eod.ts so the MCP tool applies exactly the same ones.
  const result = await saveEntry(
    { userId: session.userId, email: session.email, orgId: session.orgId },
    { content: body.content, date: body.date }
  );
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ entry: result.entry });
}
