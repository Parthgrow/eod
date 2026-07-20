import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { getEntriesPage, ENTRIES_PAGE_SIZE } from "@/lib/eod";
import EntriesList from "@/app/entries/EntriesList";

export default async function EntriesPage() {
  const session = await verifySession();
  const initialPage = await getEntriesPage(session.userId, 0, ENTRIES_PAGE_SIZE);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-xl flex-col gap-6 py-12 px-6">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-lg font-medium text-black dark:text-zinc-50">All EOD&apos;s</h1>
          <Link href="/" className="text-sm text-zinc-500 hover:text-black dark:hover:text-white">
            Back
          </Link>
        </div>
        <EntriesList initialPage={initialPage} />
      </main>
    </div>
  );
}
