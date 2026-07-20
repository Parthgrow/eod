"use client";

import { useState } from "react";

type Status = "idle" | "saving" | "saved" | "error";

export default function EodForm({ initialContent }: { initialContent: string }) {
  const [value, setValue] = useState(initialContent);
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;

    setStatus("saving");
    const res = await fetch("/api/eod", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: value }),
    });
    setStatus(res.ok ? "saved" : "error");
  }

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus("idle");
        }}
        placeholder="Write your EOD here"
        autoFocus
        className="w-full rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-3 text-sm outline-none focus:border-black dark:focus:border-white"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving" || !value.trim()}
          className="rounded-full bg-black dark:bg-white text-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {status === "saving" ? "Saving..." : "Save"}
        </button>
        {status === "saved" && <span className="text-sm text-zinc-500">Saved</span>}
        {status === "error" && (
          <span className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t save, try again.</span>
        )}
      </div>
    </form>
  );
}
