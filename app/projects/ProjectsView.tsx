"use client";

import { useState } from "react";
import type { Project } from "@/lib/projects";

const inputCls =
  "rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2 text-sm outline-none focus:border-black dark:focus:border-white";
const btnCls =
  "rounded-full bg-black dark:bg-white text-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50";

export default function ProjectsView({ initial }: { initial: Project[] }) {
  const [projects, setProjects] = useState(initial);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setAdding(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      const { project } = (await res.json()) as { project: Project };
      setProjects((prev) => [...prev, project]);
      setName("");
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Couldn't create, try again.");
    }
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="New project name"
          className={inputCls}
        />
        <button type="submit" disabled={adding || !name.trim()} className={btnCls}>
          {adding ? "Adding..." : "+ Add project"}
        </button>
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </form>

      {projects.length === 0 ? (
        <p className="text-sm text-zinc-500">No projects yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
            >
              <p className="text-sm text-black dark:text-zinc-50">{p.name}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
