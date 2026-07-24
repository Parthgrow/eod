import { requireUserId } from "@/lib/dal";
import { isIntegrationStatus } from "@/lib/integrations";
import { setIntegrationStatus, removeIntegration } from "@/lib/integrations-store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireUserId();
  if (userId instanceof Response) return userId;

  const { id } = await params;
  const { status } = (await request.json()) as { status?: string };
  if (!isIntegrationStatus(status)) {
    return Response.json({ error: "Invalid status." }, { status: 400 });
  }

  const updated = await setIntegrationStatus(id, status);
  if (!updated) {
    return Response.json({ error: "Integration not found." }, { status: 404 });
  }
  return Response.json({ integration: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireUserId();
  if (userId instanceof Response) return userId;

  const { id } = await params;
  const removed = await removeIntegration(id);
  if (!removed) {
    return Response.json({ error: "Integration not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
