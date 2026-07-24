"use client";

import { useState } from "react";

type Status = "idle" | "saving" | "saved" | "error";

const inputClass =
  "w-full rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-3 text-sm outline-none focus:border-black dark:focus:border-white";
const buttonClass =
  "rounded-full bg-black dark:bg-white text-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50";

export default function EodForm({
  today,
  initialContent,
  yesterday,
  initialYesterdayContent,
  yesterdayAlreadyFilled,
}: {
  today: string;
  initialContent: string;
  yesterday: string;
  initialYesterdayContent: string;
  yesterdayAlreadyFilled: boolean;
}) {
  // Today: editable, saving upserts the entry.
  const [value, setValue] = useState(initialContent);
  const [status, setStatus] = useState<Status>("idle");

  // Yesterday: a write-once back-fill, hidden behind a button.
  const [showYesterday, setShowYesterday] = useState(false);
  const [yValue, setYValue] = useState(initialYesterdayContent);
  const [yStatus, setYStatus] = useState<Status>("idle");
  const [yFilled, setYFilled] = useState(yesterdayAlreadyFilled);

  async function saveEntry(content: string, date: string) {
    return fetch("/api/eod", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, date }),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;

    setStatus("saving");
    const res = await saveEntry(value, today);
    setStatus(res.ok ? "saved" : "error");
  }

  async function handleYesterdaySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!yValue.trim()) return;

    setYStatus("saving");
    const res = await saveEntry(yValue, yesterday);
    if (res.ok) {
      setYStatus("saved");
      setYFilled(true); // write-once: lock it once recorded
    } else if (res.status === 409) {
      // Already recorded elsewhere since the page loaded — reflect that.
      setYStatus("idle");
      setYFilled(true);
    } else {
      setYStatus("error");
    }
  }

  return (
    <div className="w-full flex flex-col gap-6">
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
          className={inputClass}
        />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={status === "saving" || !value.trim()} className={buttonClass}>
            {status === "saving" ? "Saving..." : "Save"}
          </button>
          {status === "saved" && <span className="text-sm text-zinc-500">Saved</span>}
          {status === "error" && (
            <span className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t save, try again.</span>
          )}
        </div>
      </form>

      <div className="w-full border-t border-zinc-200 dark:border-zinc-800 pt-4">
        {!showYesterday ? (
          <button
            type="button"
            onClick={() => setShowYesterday(true)}
            className="text-sm font-medium text-zinc-500 hover:text-black dark:hover:text-white"
          >
            {yFilled ? "View yesterday's EOD" : "+ Add yesterday's EOD"}
          </button>
        ) : (
          <div className="w-full flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Yesterday · {yesterday}</h2>
              <button
                type="button"
                onClick={() => setShowYesterday(false)}
                className="text-xs text-zinc-400 hover:text-black dark:hover:text-white"
              >
                Hide
              </button>
            </div>

            {yFilled ? (
              <div className="flex flex-col gap-1">
                <p className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-3 text-sm text-black dark:text-zinc-50 whitespace-pre-wrap">
                  {yValue}
                </p>
                <span className="text-xs text-zinc-400">Already recorded — past EODs can&apos;t be changed.</span>
              </div>
            ) : (
              <form onSubmit={handleYesterdaySubmit} className="w-full flex flex-col gap-4">
                <input
                  type="text"
                  value={yValue}
                  onChange={(e) => {
                    setYValue(e.target.value);
                    setYStatus("idle");
                  }}
                  placeholder="Write yesterday's EOD here"
                  className={inputClass}
                />
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={yStatus === "saving" || !yValue.trim()} className={buttonClass}>
                    {yStatus === "saving" ? "Saving..." : "Save"}
                  </button>
                  {yStatus === "error" && (
                    <span className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t save, try again.</span>
                  )}
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
