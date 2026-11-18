import { boardContext, readJson, storeError } from "@/lib/board-api";
import { createTag, listTags } from "@/lib/tags-store";

type Params = { params: Promise<{ slug: string }> };

// The board's tag catalog (only boards with `tags` in lib/boards.ts).
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await boardContext(slug);
  if (ctx instanceof Response) return ctx;
  if (!ctx.board.tags) return Response.json({ error: "This board doesn't use tags." }, { status: 404 });

  const tags = await listTags(ctx.session.orgId, ctx.board);
  return Response.json({ tags });
}

// Adds a tag. Adding a name that already exists returns the existing tag (200).
export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await boardContext(slug);
  if (ctx instanceof Response) return ctx;

  const body = await readJson(request);
  if (!body) return Response.json({ error: "Invalid request body." }, { status: 400 });

  const result = await createTag(ctx.session.orgId, ctx.board, body.name, ctx.session.userId);
  if ("error" in result) return storeError(result);
  return Response.json(result, { status: result.created ? 201 : 200 });
}
