"use client";

import { useMemo, useState } from "react";
import { effectiveFields, PRIORITIES, type Board as BoardDef } from "@/lib/boards";
import type { Ticket, TicketFieldKey } from "@/lib/tickets";

type Member = { userId: string; email: string };
type ProjectOption = { id: string; name: string };

const inputCls =
  "rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2 text-sm outline-none focus:border-black dark:focus:border-white";
const btnCls =
  "rounded-full bg-black dark:bg-white text-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50";
// Descriptions are multi-line, so they get a squared-off box rather than a pill.
const textareaCls =
  "w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm outline-none resize-y focus:border-black dark:focus:border-white";
const cardInputCls =
  "w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-sm outline-none focus:border-black dark:focus:border-white";

const localPart = (email: string) => email.split("@")[0];

export default function Board({
  board,
  initial,
  members,
  projects,
}: {
  board: BoardDef;
  initial: Ticket[];
  members: Member[];
  projects: ProjectOption[];
}) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const projectsMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const membersMap = useMemo(() => new Map(members.map((m) => [m.userId, m.email])), [members]);

  // Filter on the first plain (text/select) field, board-specific ones first and
  // then the universal ones — reference fields (member/project) aren't filterable.
  const filterField = effectiveFields(board).find(
    (f) => f.type === "text" || f.type === "select"
  );
  const [filterValue, setFilterValue] = useState<string | null>(null);

  const valuesOf = useMemo(() => {
    return (key: TicketFieldKey) =>
      Array.from(new Set(items.map((t) => t[key]).filter((v): v is string => !!v))).sort((a, b) =>
        a.localeCompare(b)
      );
  }, [items]);

  const filterOptions = filterField ? valuesOf(filterField.key) : [];
  const activeFilter = filterValue && filterOptions.includes(filterValue) ? filterValue : null;
  const visible =
    activeFilter && filterField ? items.filter((t) => t[filterField.key] === activeFilter) : items;

  function setBusyId(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function setField(key: string, value: string) {
    setFieldValues((v) => ({ ...v, [key]: value }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    for (const f of effectiveFields(board)) {
      if (f.required && !(fieldValues[f.key] ?? "").trim()) {
        setAddError(`${f.label} is required.`);
        return;
      }
    }

    setAdding(true);
    setAddError(null);
    const res = await fetch(`/api/board/${board.slug}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim(), ...fieldValues }),
    });
    if (res.ok) {
      const { ticket } = (await res.json()) as { ticket: Ticket };
      setItems((prev) => [...prev, ticket]);
      setTitle("");
      setDescription("");
      setFieldValues({});
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setAddError(body.error ?? "Couldn't add, try again.");
    }
    setAdding(false);
  }

  async function move(ticket: Ticket, dir: -1 | 1) {
    const idx = board.columns.findIndex((c) => c.id === ticket.status);
    const next = board.columns[idx + dir];
    if (!next) return;

    setBusyId(ticket.id, true);
    const res = await fetch(`/api/board/${board.slug}/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next.id }),
    });
    if (res.ok) {
      const { ticket: updated } = (await res.json()) as { ticket: Ticket };
      setItems((prev) => prev.map((t) => (t.id === ticket.id ? updated : t)));
    }
    setBusyId(ticket.id, false);
  }

  // Title / description edit. Returns an error message, or null on success, so
  // the card can keep its editor open and show what went wrong.
  async function saveEdits(
    ticket: Ticket,
    edits: { title: string; description: string; priority: string }
  ): Promise<string | null> {
    setBusyId(ticket.id, true);
    const res = await fetch(`/api/board/${board.slug}/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edits),
    });
    setBusyId(ticket.id, false);

    if (res.ok) {
      const { ticket: updated } = (await res.json()) as { ticket: Ticket };
      setItems((prev) => prev.map((t) => (t.id === ticket.id ? updated : t)));
      return null;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return body.error ?? "Couldn't save, try again.";
  }

  async function remove(ticket: Ticket) {
    setBusyId(ticket.id, true);
    const res = await fetch(`/api/board/${board.slug}/tickets/${ticket.id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((t) => t.id !== ticket.id));
    else setBusyId(ticket.id, false);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className={inputCls}
          />
          {effectiveFields(board).map((f) => {
            const value = fieldValues[f.key] ?? "";
            if (f.type === "member") {
              return (
                <select key={f.key} value={value} onChange={(e) => setField(f.key, e.target.value)} className={inputCls}>
                  <option value="">{f.label}</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.email}
                    </option>
                  ))}
                </select>
              );
            }
            if (f.type === "select") {
              return (
                <select key={f.key} value={value} onChange={(e) => setField(f.key, e.target.value)} className={inputCls}>
                  <option value="">{f.label}</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              );
            }
            if (f.type === "project") {
              return (
                <span key={f.key}>
                  <input
                    list="dl-projects"
                    value={value}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.label}
                    className={inputCls}
                  />
                  <datalist id="dl-projects">
                    {projects.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                </span>
              );
            }
            return (
              <span key={f.key}>
                <input
                  list={`dl-${f.key}`}
                  value={value}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.label}
                  className={inputCls}
                />
                <datalist id={`dl-${f.key}`}>
                  {valuesOf(f.key).map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </span>
            );
          })}
          <button type="submit" disabled={adding || !title.trim()} className={btnCls}>
            {adding ? "Adding..." : "+ Add ticket"}
          </button>
          {addError && <span className="text-sm text-red-600 dark:text-red-400">{addError}</span>}
        </div>
        {/* The description only appears once there's something to describe. */}
        {title.trim() && (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            className={`${textareaCls} max-w-2xl`}
          />
        )}
      </form>

      {filterField && filterOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={activeFilter === null} onClick={() => setFilterValue(null)}>
            All
          </Chip>
          {filterOptions.map((o) => (
            <Chip key={o} active={activeFilter === o} onClick={() => setFilterValue(o)}>
              {o}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {board.columns.map((col, colIdx) => {
          const cards = visible.filter((t) => t.status === col.id);
          return (
            <section key={col.id} className="shrink-0 w-64 flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{col.label}</h2>
                <span className="text-xs text-zinc-400">{cards.length}</span>
              </div>
              <div className="flex flex-col gap-2 min-h-8">
                {cards.map((ticket) => (
                  <Card
                    key={ticket.id}
                    ticket={ticket}
                    board={board}
                    projectsMap={projectsMap}
                    membersMap={membersMap}
                    busy={busy.has(ticket.id)}
                    canLeft={colIdx > 0}
                    canRight={colIdx < board.columns.length - 1}
                    onMove={move}
                    onRemove={remove}
                    onSave={saveEdits}
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
  ticket,
  board,
  projectsMap,
  membersMap,
  busy,
  canLeft,
  canRight,
  onMove,
  onRemove,
  onSave,
}: {
  ticket: Ticket;
  board: BoardDef;
  projectsMap: Map<string, string>;
  membersMap: Map<string, string>;
  busy: boolean;
  canLeft: boolean;
  canRight: boolean;
  onMove: (ticket: Ticket, dir: -1 | 1) => void;
  onRemove: (ticket: Ticket) => void;
  onSave: (
    ticket: Ticket,
    edits: { title: string; description: string; priority: string }
  ) => Promise<string | null>;
}) {
  const assigneeEmail = ticket.assigneeId ? membersMap.get(ticket.assigneeId) : undefined;
  const description = ticket.description ?? "";

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(ticket.title);
  const [draftDescription, setDraftDescription] = useState(description);
  const [draftPriority, setDraftPriority] = useState(ticket.priority ?? "");
  const [editError, setEditError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Only long descriptions get clamped on the card — short ones never need the toggle.
  const clampable = description.length > 140 || description.split("\n").length > 3;

  function startEditing() {
    setDraftTitle(ticket.title);
    setDraftDescription(description);
    setDraftPriority(ticket.priority ?? "");
    setEditError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditError(null);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!draftTitle.trim()) {
      setEditError("Title is required.");
      return;
    }
    // An empty description clears it; the server drops the field entirely.
    const error = await onSave(ticket, {
      title: draftTitle.trim(),
      description: draftDescription.trim(),
      priority: draftPriority,
    });
    if (error) setEditError(error);
    else cancelEditing();
  }

  if (editing) {
    return (
      <form
        onSubmit={submitEdit}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 flex flex-col gap-2"
      >
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder="Title"
          autoFocus
          className={cardInputCls}
        />
        <select
          value={draftPriority}
          onChange={(e) => setDraftPriority(e.target.value)}
          className={cardInputCls}
        >
          <option value="">No priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.toUpperCase()}
            </option>
          ))}
          {/* Keep a pre-existing value that isn't one of the current options
              (e.g. an older "high") selectable, so editing doesn't silently drop it. */}
          {draftPriority && !(PRIORITIES as readonly string[]).includes(draftPriority) && (
            <option value={draftPriority}>{draftPriority}</option>
          )}
        </select>
        <textarea
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          placeholder="Description"
          rows={4}
          className={`${cardInputCls} resize-y`}
        />
        {editError && <p className="text-xs text-red-600 dark:text-red-400">{editError}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !draftTitle.trim()}
            className="rounded-full bg-black dark:bg-white text-white dark:text-black px-3 py-1 text-xs font-medium disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={busy}
            className="text-xs text-zinc-500 hover:text-black dark:hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {board.fields.map((f) => {
            const val =
              f.type === "project"
                ? ticket.projectId
                  ? projectsMap.get(ticket.projectId)
                  : undefined
                : ticket[f.key];
            return val ? (
              <p key={f.key} className="text-xs text-zinc-500">
                {val}
              </p>
            ) : null;
          })}
          <p className="text-sm text-black dark:text-zinc-50 break-words">{ticket.title}</p>
          {description && (
            <>
              <p
                className={
                  "mt-1 text-xs text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap break-words " +
                  (clampable && !expanded ? "line-clamp-3" : "")
                }
              >
                {description}
              </p>
              {clampable && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-0.5 text-xs text-zinc-400 hover:text-black dark:hover:text-white"
                >
                  {expanded ? "Show less" : "Show more"}
                </button>
              )}
            </>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2 leading-none">
          <button
            type="button"
            onClick={startEditing}
            disabled={busy}
            aria-label="Edit ticket"
            className="text-xs text-zinc-400 hover:text-black dark:hover:text-white disabled:opacity-40"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onRemove(ticket)}
            disabled={busy}
            aria-label="Delete ticket"
            className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {ticket.priority && (
            <span className="shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-xs font-medium uppercase text-zinc-600 dark:text-zinc-300">
              {ticket.priority}
            </span>
          )}
          {assigneeEmail && (
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300 truncate">
              {localPart(assigneeEmail)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onMove(ticket, -1)}
            disabled={busy || !canLeft}
            aria-label="Move to previous status"
            className="rounded-full border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300 disabled:opacity-30 hover:border-zinc-400"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onMove(ticket, 1)}
            disabled={busy || !canRight}
            aria-label="Move to next status"
            className="rounded-full border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300 disabled:opacity-30 hover:border-zinc-400"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
