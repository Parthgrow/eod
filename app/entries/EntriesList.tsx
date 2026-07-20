"use client";

import { useState } from "react";
import type { EntriesPage } from "@/lib/eod";

export default function EntriesList({ initialPage }: { initialPage: EntriesPage }) {
  const [data, setData] = useState(initialPage);
  const [loading, setLoading] = useState(false);

  async function goToPage(page: number) {
    if (page < 0 || page >= data.totalPages || loading) return;
    setLoading(true);
    const res = await fetch(`/api/eod/entries?page=${page}`);
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {data.entries.length === 0 ? (
        <p className="text-sm text-zinc-500">No EOD&apos;s yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.entries.map((entry) => (
            <li
              key={entry.date}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
            >
              <p className="text-xs text-zinc-500 mb-1">{entry.date}</p>
              <p className="text-sm text-black dark:text-zinc-50 whitespace-pre-wrap">{entry.content}</p>
            </li>
          ))}
        </ul>
      )}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => goToPage(data.page - 1)}
            disabled={data.page === 0 || loading}
            className="text-sm text-zinc-500 hover:text-black dark:hover:text-white disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-400">
            Page {data.page + 1} of {data.totalPages}
          </span>
          <button
            type="button"
            onClick={() => goToPage(data.page + 1)}
            disabled={data.page >= data.totalPages - 1 || loading}
            className="text-sm text-zinc-500 hover:text-black dark:hover:text-white disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
