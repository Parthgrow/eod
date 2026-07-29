import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { getOrg } from "@/lib/org-store";
import { BOARDS } from "@/lib/boards";

export default async function BoardsIndexPage() {
  const session = await verifySession();
  const org = await getOrg(session.orgId);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-2xl mx-auto flex-col gap-6 py-12 px-6">
        <div className="w-full flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium text-black dark:text-zinc-50">Boards</h1>
            {org && <p className="text-xs text-zinc-500">{org.name}</p>}
          </div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-black dark:hover:text-white">
            Back
          </Link>
        </div>
        <ul className="flex flex-col gap-2">
          {BOARDS.map((b) => (
            <li key={b.id}>
              <Link
                href={`/board/${b.slug}`}
                className="block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-zinc-400"
              >
                <p className="text-sm font-medium text-black dark:text-zinc-50">{b.title}</p>
                <p className="text-xs text-zinc-500">
                  /board/{b.slug} · {b.columns.length} columns
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
