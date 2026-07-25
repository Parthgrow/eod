import { requireSession } from "@/lib/dal";
import { getOrgEntriesPage, ENTRIES_PAGE_SIZE } from "@/lib/eod";

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, Number(searchParams.get("page") ?? 0) || 0);

  const result = await getOrgEntriesPage(session.orgId, page, ENTRIES_PAGE_SIZE);
  return Response.json(result);
}
