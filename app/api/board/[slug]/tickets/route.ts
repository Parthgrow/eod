import { requireSession } from "@/lib/dal";
import { getBoardBySlug } from "@/lib/boards";
import { listTickets, createTicket } from "@/lib/tickets-store";
import { toClientTicket } from "@/lib/tickets";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { slug } = await params;
  const board = getBoardBySlug(slug);
  if (!board) return Response.json({ error: "Unknown board." }, { status: 404 });

  const tickets = await listTickets(session.orgId, board.id);
  return Response.json({ tickets });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { slug } = await params;
  const board = getBoardBySlug(slug);
  if (!board) return Response.json({ error: "Unknown board." }, { status: 404 });

  const input = (await request.json()) as Record<string, unknown>;
  const result = await createTicket(session.orgId, board, input, session.userId);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ticket: toClientTicket(result) });
}
