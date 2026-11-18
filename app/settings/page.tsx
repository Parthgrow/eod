import Link from "next/link";
import { headers } from "next/headers";
import { verifySession } from "@/lib/dal";
import { getOrg } from "@/lib/org-store";
import { listTokens } from "@/lib/mcp/auth";
import SettingsView from "@/app/settings/SettingsView";

export default async function SettingsPage() {
  const session = await verifySession();
  const [org, tokens, h] = await Promise.all([getOrg(session.orgId), listTokens(session.userId), headers()]);

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-2xl mx-auto flex-col gap-6 py-12 px-6">
        <div className="w-full flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium text-black dark:text-zinc-50">Connect Claude</h1>
            {org && <p className="text-xs text-zinc-500">{org.name}</p>}
          </div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-black dark:hover:text-white">
            Back
          </Link>
        </div>
        <SettingsView
          origin={origin}
          userId={session.userId}
          tokens={tokens.map((t) => ({ id: t.id, name: t.name, hint: t.hint, createdAt: t.createdAt }))}
        />
      </main>
    </div>
  );
}
