import { boardContext, notFound, readJson, storeError } from "@/lib/board-api";
import { addPayload } from "@/lib/tickets-store";
import { toClientPayload } from "@/lib/tickets";

type Params = { params: Promise<{ slug: string; id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { slug, id } = await params;
  const ctx = await boardContext(slug);
  if (ctx instanceof Response) return ctx;

  const input = await readJson(request);
  if (!input) return Response.json({ error: "Invalid request body." }, { status: 400 });

  const result = await addPayload(ctx.session.orgId, ctx.board, id, input, ctx.session.userId);
  if (result === null) return notFound("Ticket");
  if ("error" in result) return storeError(result);
  return Response.json({ payload: toClientPayload(result.payload), count: result.count });
}
