import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { getBoardBySlug } from "@/lib/boards";
import { listTickets } from "@/lib/tickets-store";
import { toClientTicket } from "@/lib/tickets";
import { listMembers } from "@/lib/org-store";
import { listProjects } from "@/lib/projects-store";
import Board from "@/app/board/[slug]/Board";
import BoardTabs from "@/app/board/BoardTabs";

export default async function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await verifySession();
  const { slug } = await params;

  const board = getBoardBySlug(slug);
  if (!board) notFound();

  const [tickets, members, projects] = await Promise.all([
    listTickets(session.orgId, board.id),
    listMembers(session.orgId), // for the assignee picker + card resolution
    listProjects(session.orgId), // for the project picker + card resolution
  ]);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-6xl mx-auto flex-col gap-6 py-12 px-6">
        <div className="w-full flex items-center justify-between gap-4">
          <BoardTabs activeSlug={board.slug} />
          <Link href="/" className="text-sm text-zinc-500 hover:text-black dark:hover:text-white">
            Back
          </Link>
        </div>
        <Board
          board={board}
          initial={tickets.map(toClientTicket)}
          members={members}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        />
      </main>
    </div>
  );
}
