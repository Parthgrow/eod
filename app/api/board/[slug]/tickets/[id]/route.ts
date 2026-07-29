import { requireSession } from "@/lib/dal";
import { getBoardBySlug } from "@/lib/boards";
import { setTicketStatus, removeTicket } from "@/lib/tickets-store";
import { toClientTicket } from "@/lib/tickets";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { slug, id } = await params;
  const board = getBoardBySlug(slug);
  if (!board) return Response.json({ error: "Unknown board." }, { status: 404 });

  const { status } = (await request.json()) as { status?: string };
  const result = await setTicketStatus(session.orgId, board, id, status ?? "");
  if (result === null) {
    return Response.json({ error: "Ticket not found." }, { status: 404 });
  }
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ticket: toClientTicket(result) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { slug, id } = await params;
  const board = getBoardBySlug(slug);
  if (!board) return Response.json({ error: "Unknown board." }, { status: 404 });

  const removed = await removeTicket(session.orgId, board.id, id);
  if (!removed) {
    return Response.json({ error: "Ticket not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
