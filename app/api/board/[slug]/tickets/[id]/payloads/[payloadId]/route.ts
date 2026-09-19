import { boardContext, notFound, readJson, storeError } from "@/lib/board-api";
import { editPayload, removePayload } from "@/lib/tickets-store";
import { toClientPayload } from "@/lib/tickets";

type Params = { params: Promise<{ slug: string; id: string; payloadId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { slug, id, payloadId } = await params;
  const ctx = await boardContext(slug);
  if (ctx instanceof Response) return ctx;

  const input = await readJson(request);
  if (!input) return Response.json({ error: "Invalid request body." }, { status: 400 });

  const result = await editPayload(ctx.session.orgId, ctx.board, id, payloadId, input);
  if (result === null) return notFound("Payload");
  if ("error" in result) return storeError(result);
  return Response.json({ payload: toClientPayload(result) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { slug, id, payloadId } = await params;
  const ctx = await boardContext(slug);
  if (ctx instanceof Response) return ctx;

  const result = await removePayload(ctx.session.orgId, ctx.board, id, payloadId);
  if (result === null) return notFound("Payload");
  return Response.json(result);
}
