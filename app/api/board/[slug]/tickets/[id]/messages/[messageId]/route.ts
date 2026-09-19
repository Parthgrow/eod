import { boardContext, notFound, readJson, storeError } from "@/lib/board-api";
import { editMessage, removeMessage } from "@/lib/tickets-store";

type Params = { params: Promise<{ slug: string; id: string; messageId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { slug, id, messageId } = await params;
  const ctx = await boardContext(slug);
  if (ctx instanceof Response) return ctx;

  const input = await readJson(request);
  if (!input) return Response.json({ error: "Invalid request body." }, { status: 400 });

  const result = await editMessage(
    ctx.session.orgId,
    ctx.board,
    id,
    messageId,
    ctx.session.userId,
    input
  );
  if (result === null) return notFound("Message");
  if ("error" in result) return storeError(result);
  return Response.json({ message: result });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { slug, id, messageId } = await params;
  const ctx = await boardContext(slug);
  if (ctx instanceof Response) return ctx;

  const result = await removeMessage(ctx.session.orgId, ctx.board, id, messageId, ctx.session.userId);
  if (result === null) return notFound("Message");
  if ("error" in result) return storeError(result);
  return Response.json(result);
}
