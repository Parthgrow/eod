import { requireUserId } from "@/lib/dal";
import { listIntegrations, createIntegration } from "@/lib/integrations-store";

export async function GET() {
  const userId = await requireUserId();
  if (userId instanceof Response) return userId;

  const integrations = await listIntegrations();
  return Response.json({ integrations });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (userId instanceof Response) return userId;

  const { provider, name } = (await request.json()) as {
    provider?: string;
    name?: string;
  };

  const trimmedProvider = (provider ?? "").trim();
  const trimmedName = (name ?? "").trim();
  if (!trimmedProvider || !trimmedName) {
    return Response.json({ error: "Provider and name are required." }, { status: 400 });
  }

  const integration = await createIntegration({
    provider: trimmedProvider,
    name: trimmedName,
  });
  return Response.json({ integration });
}
