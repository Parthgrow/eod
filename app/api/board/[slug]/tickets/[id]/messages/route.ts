import { boardContext, notFound, readJson, storeError } from "@/lib/board-api";
import { addMessage } from "@/lib/tickets-store";

type Params = { params: Promise<{ slug: string; id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { slug, id } = await params;
  const ctx = await boardContext(slug);
  if (ctx instanceof Response) return ctx;

  const input = await readJson(request);
  if (!input) return Response.json({ error: "Invalid request body." }, { status: 400 });

  // The author always comes from the session, never from the body.
  const result = await addMessage(ctx.session.orgId, ctx.board, id, input, {
    userId: ctx.session.userId,
    email: ctx.session.email,
  });
  if (result === null) return notFound("Ticket");
  if ("error" in result) return storeError(result);
  return Response.json(result);
}
