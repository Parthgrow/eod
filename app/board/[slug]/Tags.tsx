"use client";

import { useState } from "react";

export type TagOption = { id: string; name: string };

// A tag keeps the same color everywhere: picked from a small palette by its id.
// Full class strings so Tailwind keeps them.
const PALETTE = [
  "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900",
  "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900",
  "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900",
  "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-900",
  "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-900",
  "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-900",
];

export function tagColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function TagChip({ tag }: { tag: TagOption }) {
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tagColor(tag.id)}`}>
      {tag.name}
    </span>
  );
}

// Multi-select: every tag is a toggle chip, and "+ New" adds a tag to the
// board's catalog (and selects it) without leaving the form.
export function TagPicker({
  label,
  tags,
  value,
  onChange,
  onCreate,
}: {
  label: string;
  tags: TagOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  onCreate: (name: string) => Promise<TagOption | string>; // the tag, or an error
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const result = await onCreate(trimmed);
    setSaving(false);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    if (!value.includes(result.id)) onChange([...value, result.id]);
    setName("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="text-xs text-zinc-500 mr-0.5">{label}</span>
      {tags.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            aria-pressed={on}
            className={
              "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors " +
              (on
                ? tagColor(t.id)
                : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800")
            }
          >
            {on ? "✓ " : ""}
            {t.name}
          </button>
        );
      })}
      {adding ? (
        <span className="flex items-center gap-1">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              // Enter adds the tag instead of submitting the surrounding form.
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setAdding(false);
                setName("");
                setError(null);
              }
            }}
            autoFocus
            maxLength={30}
            placeholder={`New ${label} tag`}
            aria-label={`New ${label} tag`}
            className="w-32 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-0.5 text-xs outline-none focus:border-black dark:focus:border-white"
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={saving || !name.trim()}
            className="text-xs font-medium text-black dark:text-white disabled:opacity-40"
          >
            {saving ? "Adding..." : "Add"}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-500 hover:text-black dark:hover:text-white"
        >
          + New
        </button>
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
