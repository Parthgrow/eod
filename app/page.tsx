import Link from "next/link";
import { kv } from "@vercel/kv";
import { verifySession } from "@/lib/dal";
import { entryKey } from "@/lib/kv-keys";
import { todayDateKey, yesterdayDateKey, type EodEntry } from "@/lib/eod";
import { logout } from "@/app/actions/auth";
import { getOrg } from "@/lib/org-store";
import EodForm from "@/app/EodForm";

export default async function Home() {
  const session = await verifySession();
  const date = todayDateKey();
  const yesterday = yesterdayDateKey();

  const [org, entry, yesterdayEntry] = await Promise.all([
    getOrg(session.orgId),
    kv.get<EodEntry>(entryKey(session.userId, date)),
    kv.get<EodEntry>(entryKey(session.userId, yesterday)),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-xl flex-col items-center justify-center gap-8 py-12 px-6">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-lg font-medium text-zinc-500 dark:text-zinc-400">{date}</h1>
          <div className="flex flex-col items-end gap-0.5">
            {org && (
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{org.name}</span>
            )}
            <form action={logout}>
              <button
                type="submit"
                className="text-sm text-zinc-500 hover:text-black dark:hover:text-white"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <EodForm
          today={date}
          initialContent={entry?.content ?? ""}
          yesterday={yesterday}
          initialYesterdayContent={yesterdayEntry?.content ?? ""}
          yesterdayAlreadyFilled={yesterdayEntry !== null}
        />
        <Link
          href="/entries"
          className="text-base font-medium text-black dark:text-zinc-50 hover:underline"
        >
          Show all EOD&apos;s
        </Link>
        <Link
          href="/board"
          className="text-sm text-zinc-500 hover:text-black dark:hover:text-white"
        >
          Boards →
        </Link>
        <Link
          href="/projects"
          className="text-sm text-zinc-500 hover:text-black dark:hover:text-white"
        >
          Projects →
        </Link>
      </main>
    </div>
  );
}
