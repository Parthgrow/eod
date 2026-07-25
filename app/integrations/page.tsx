import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { getOrg } from "@/lib/org-store";
import { listIntegrations } from "@/lib/integrations-store";
import Board from "@/app/integrations/Board";

export default async function IntegrationsPage() {
  const session = await verifySession();
  const [org, integrations] = await Promise.all([
    getOrg(session.orgId),
    listIntegrations(session.orgId),
  ]);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-6xl mx-auto flex-col gap-6 py-12 px-6">
        <div className="w-full flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium text-black dark:text-zinc-50">API integrations</h1>
            {org && <p className="text-xs text-zinc-500">{org.name}</p>}
          </div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-black dark:hover:text-white">
            Back
          </Link>
        </div>
        <Board initial={integrations} />
      </main>
    </div>
  );
}
