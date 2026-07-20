import { requireUserId } from "@/lib/dal";
import { getEntriesPage, ENTRIES_PAGE_SIZE } from "@/lib/eod";

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (userId instanceof Response) return userId;

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, Number(searchParams.get("page") ?? 0) || 0);

  const result = await getEntriesPage(userId, page, ENTRIES_PAGE_SIZE);
  return Response.json(result);
}
