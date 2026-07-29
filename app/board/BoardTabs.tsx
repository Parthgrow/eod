import Link from "next/link";
import { BOARDS } from "@/lib/boards";

// Segmented-pill nav across the boards. Each tab is a link to /board/{slug};
// the active board is filled/highlighted. Dividers separate inactive neighbours
// and disappear next to the active pill so it reads cleanly.
export default function BoardTabs({ activeSlug }: { activeSlug: string }) {
  return (
    <nav className="inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1">
      {BOARDS.map((b, i) => {
        const active = b.slug === activeSlug;
        const prevActive = i > 0 && BOARDS[i - 1].slug === activeSlug;
        return (
          <span key={b.id} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={
                  "mx-1 h-4 w-px " +
                  (active || prevActive ? "bg-transparent" : "bg-zinc-200 dark:bg-zinc-800")
                }
              />
            )}
            <Link
              href={`/board/${b.slug}`}
              aria-current={active ? "page" : undefined}
              className={
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors " +
                (active
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white")
              }
            >
              {b.title}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
