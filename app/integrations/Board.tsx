"use client";

import { useMemo, useState } from "react";
import { STATUSES, STATUS_LABELS, type ApiIntegration } from "@/lib/integrations";

export default function Board({ initial }: { initial: ApiIntegration[] }) {
  const [items, setItems] = useState(initial);
  const [provider, setProvider] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const [newProvider, setNewProvider] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(false);

  const providers = useMemo(
    () =>
      Array.from(new Set(items.map((i) => i.provider))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [items]
  );

  // Guard against a stale filter (e.g. after deleting a provider's last card).
  const activeProvider = provider && providers.includes(provider) ? provider : null;
  const visible = activeProvider
    ? items.filter((i) => i.provider === activeProvider)
    : items;

  function setBusyId(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const p = newProvider.trim();
    const n = newName.trim();
    if (!p || !n) return;

    setAdding(true);
    setAddError(false);
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: p, name: n }),
    });
    if (res.ok) {
      const { integration } = (await res.json()) as { integration: ApiIntegration };
      setItems((prev) => [...prev, integration]);
      setNewName(""); // keep the provider so you can add several APIs in a row
    } else {
      setAddError(true);
    }
    setAdding(false);
  }

  async function move(item: ApiIntegration, dir: -1 | 1) {
    const target = STATUSES[STATUSES.indexOf(item.status) + dir];
    if (!target) return;

    setBusyId(item.id, true);
    const res = await fetch(`/api/integrations/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: target }),
    });
    if (res.ok) {
      const { integration } = (await res.json()) as { integration: ApiIntegration };
      setItems((prev) => prev.map((i) => (i.id === item.id ? integration : i)));
    }
    setBusyId(item.id, false);
  }

  async function remove(item: ApiIntegration) {
    setBusyId(item.id, true);
    const res = await fetch(`/api/integrations/${item.id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } else {
      setBusyId(item.id, false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
        <input
          list="providers"
          value={newProvider}
          onChange={(e) => setNewProvider(e.target.value)}
          placeholder="Provider (e.g. Setu)"
          className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2 text-sm outline-none focus:border-black dark:focus:border-white"
        />
        <datalist id="providers">
          {providers.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="API name"
          className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2 text-sm outline-none focus:border-black dark:focus:border-white"
        />
        <button
          type="submit"
          disabled={adding || !newProvider.trim() || !newName.trim()}
          className="rounded-full bg-black dark:bg-white text-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {adding ? "Adding..." : "+ Add integration"}
        </button>
        {addError && (
          <span className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t add, try again.</span>
        )}
      </form>

      {providers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={activeProvider === null} onClick={() => setProvider(null)}>
            All
          </Chip>
          {providers.map((p) => (
            <Chip key={p} active={activeProvider === p} onClick={() => setProvider(p)}>
              {p}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map((status, colIdx) => {
          const cards = visible.filter((i) => i.status === status);
          return (
            <section key={status} className="shrink-0 w-64 flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {STATUS_LABELS[status]}
                </h2>
                <span className="text-xs text-zinc-400">{cards.length}</span>
              </div>
              <div className="flex flex-col gap-2 min-h-8">
                {cards.map((item) => (
                  <Card
                    key={item.id}
                    item={item}
                    busy={busy.has(item.id)}
                    canLeft={colIdx > 0}
                    canRight={colIdx < STATUSES.length - 1}
                    onMove={move}
                    onRemove={remove}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-3 py-1 text-xs font-medium border transition-colors " +
        (active
          ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
          : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800")
      }
    >
      {children}
    </button>
  );
}

function Card({
  item,
  busy,
  canLeft,
  canRight,
  onMove,
  onRemove,
}: {
  item: ApiIntegration;
  busy: boolean;
  canLeft: boolean;
  canRight: boolean;
  onMove: (item: ApiIntegration, dir: -1 | 1) => void;
  onRemove: (item: ApiIntegration) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-zinc-500">{item.provider}</p>
          <p className="text-sm text-black dark:text-zinc-50 break-words">{item.name}</p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(item)}
          disabled={busy}
          aria-label="Delete integration"
          className="shrink-0 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMove(item, -1)}
          disabled={busy || !canLeft}
          aria-label="Move to previous status"
          className="rounded-full border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300 disabled:opacity-30 hover:border-zinc-400"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => onMove(item, 1)}
          disabled={busy || !canRight}
          aria-label="Move to next status"
          className="rounded-full border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300 disabled:opacity-30 hover:border-zinc-400"
        >
          →
        </button>
      </div>
    </div>
  );
}
