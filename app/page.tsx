import { kv } from "@vercel/kv";
import { verifySession } from "@/lib/dal";
import { entryKey } from "@/lib/kv-keys";
import { todayDateKey, type EodEntry } from "@/lib/eod";
import { logout } from "@/app/actions/auth";
import EodForm from "@/app/EodForm";

export default async function Home() {
  const session = await verifySession();
  const date = todayDateKey();
  const entry = await kv.get<EodEntry>(entryKey(session.userId, date));

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-xl flex-col items-center justify-center gap-8 py-12 px-6">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-lg font-medium text-zinc-500 dark:text-zinc-400">{date}</h1>
          <form action={logout}>
            <button
              type="submit"
              className="text-sm text-zinc-500 hover:text-black dark:hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
        <EodForm initialContent={entry?.content ?? ""} />
      </main>
    </div>
  );
}
