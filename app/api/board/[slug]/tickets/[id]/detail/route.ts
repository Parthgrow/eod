import { boardContext, notFound } from "@/lib/board-api";
import { getTicketDetail } from "@/lib/tickets-store";
import { toClientPayload } from "@/lib/tickets";

type Params = { params: Promise<{ slug: string; id: string }> };

// Everything the side panel shows beyond the ticket itself, in one call.
export async function GET(_request: Request, { params }: Params) {
  const { slug, id } = await params;
  const ctx = await boardContext(slug);
  if (ctx instanceof Response) return ctx;

  const detail = await getTicketDetail(ctx.session.orgId, ctx.board, id);
  if (!detail) return notFound("Ticket");

  return Response.json({
    messages: detail.messages,
    payloads: detail.payloads.map(toClientPayload),
  });
}
