import { requireSession } from "@/lib/dal";
import { listIntegrations, createIntegration } from "@/lib/integrations-store";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const integrations = await listIntegrations(session.orgId);
  return Response.json({ integrations });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { provider, name } = (await request.json()) as {
    provider?: string;
    name?: string;
  };

  const trimmedProvider = (provider ?? "").trim();
  const trimmedName = (name ?? "").trim();
  if (!trimmedProvider || !trimmedName) {
    return Response.json({ error: "Provider and name are required." }, { status: 400 });
  }

  const integration = await createIntegration(session.orgId, {
    provider: trimmedProvider,
    name: trimmedName,
  });
  return Response.json({ integration });
}
