import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { getBoardBySlug } from "@/lib/boards";
import { listTickets } from "@/lib/tickets-store";
import Board from "@/app/board/[slug]/Board";

export default async function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await verifySession();
  const { slug } = await params;

  const board = getBoardBySlug(slug);
  if (!board) notFound();

  const tickets = await listTickets(session.orgId, board.id);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-6xl mx-auto flex-col gap-6 py-12 px-6">
        <div className="w-full flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium text-black dark:text-zinc-50">{board.title}</h1>
            <p className="text-xs text-zinc-500">/board/{board.slug}</p>
          </div>
          <Link href="/board" className="text-sm text-zinc-500 hover:text-black dark:hover:text-white">
            All boards
          </Link>
        </div>
        <Board board={board} initial={tickets} />
      </main>
    </div>
  );
}
