"use client";

import { useEffect, useState } from "react";
import { PRIORITIES, ticketLabel, type Board as BoardDef } from "@/lib/boards";
import type { Ticket, TicketMessage, TicketPayload } from "@/lib/tickets";

type Tab = "conversation" | "payload";
type Counts = { messageCount?: number; payloadCount?: number };
type Edits = { title: string; description: string; priority: string };

const fieldCls =
  "w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-black dark:focus:border-white";
const monoCls = `${fieldCls} font-mono text-xs resize-y`;
const primaryBtn =
  "rounded-full bg-black dark:bg-white text-white dark:text-black px-4 py-1.5 text-sm font-medium disabled:opacity-50";
const ghostBtn =
  "text-xs text-zinc-500 hover:text-black dark:hover:text-white disabled:opacity-50";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const localPart = (email: string) => email.split("@")[0];

async function callApi<T>(
  url: string,
  method: string,
  body?: unknown
): Promise<{ data: T } | { error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { error: json.error ?? "Something went wrong, try again." };
    return { data: json };
  } catch {
    return { error: "Network error, try again." };
  }
}

// Bodies are usually JSON; pretty-print when they are, show them untouched when not.
function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard can be blocked (insecure context / permissions); nothing to fall back to.
  }
}

export default function TicketPanel({
  board,
  ticket,
  membersMap,
  projectsMap,
  currentUserId,
  busy,
  onClose,
  onSaveEdits,
  onSetStatus,
  onRemove,
  onCounts,
}: {
  board: BoardDef;
  ticket: Ticket;
  membersMap: Map<string, string>;
  projectsMap: Map<string, string>;
  currentUserId: string;
  busy: boolean;
  onClose: () => void;
  onSaveEdits: (ticket: Ticket, edits: Edits) => Promise<string | null>;
  onSetStatus: (ticket: Ticket, status: string) => void;
  onRemove: (ticket: Ticket) => void;
  onCounts: (ticketId: string, counts: Counts) => void;
}) {
  const label = ticketLabel(board, ticket);
  const endpoint = `/api/board/${board.slug}/tickets/${ticket.id}`;

  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? "");
  const [priority, setPriority] = useState(ticket.priority ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty =
    title !== ticket.title ||
    description !== (ticket.description ?? "") ||
    priority !== (ticket.priority ?? "");

  const tabs: { id: Tab; label: string; count: number }[] = [];
  if (board.features.conversation) {
    tabs.push({ id: "conversation", label: "Conversation", count: ticket.messageCount ?? 0 });
  }
  if (board.features.payloads) {
    tabs.push({ id: "payload", label: "Payload", count: ticket.payloadCount ?? 0 });
  }
  const [tab, setTab] = useState<Tab | null>(tabs[0]?.id ?? null);

  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [payloads, setPayloads] = useState<TicketPayload[]>([]);
  const [loading, setLoading] = useState(tabs.length > 0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!board.features.conversation && !board.features.payloads) return;
    let cancelled = false;
    callApi<{ messages: TicketMessage[]; payloads: TicketPayload[] }>(`${endpoint}/detail`, "GET").then(
      (res) => {
        if (cancelled) return;
        if ("error" in res) setLoadError(res.error);
        else {
          setMessages(res.data.messages);
          setPayloads(res.data.payloads);
        }
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [endpoint, board.features.conversation, board.features.payloads]);

  function requestClose() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setSaveError("Title is required.");
      return;
    }
    setSaveState("saving");
    setSaveError(null);
    const error = await onSaveEdits(ticket, {
      title: title.trim(),
      description: description.trim(),
      priority,
    });
    if (error) {
      setSaveError(error);
      setSaveState("idle");
    } else {
      setSaveState("saved");
    }
  }

  const assigneeEmail = ticket.assigneeId ? membersMap.get(ticket.assigneeId) : undefined;
  const projectName = ticket.projectId ? projectsMap.get(ticket.projectId) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Ticket details">
      <button
        type="button"
        aria-label="Close panel"
        onClick={requestClose}
        className="absolute inset-0 bg-black/40 cursor-default"
      />
      <aside className="relative flex h-full w-full sm:w-[520px] flex-col gap-5 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 p-5 shadow-xl">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {label && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-black dark:text-zinc-50">{label}</span>
                <button type="button" onClick={() => copyText(label)} className={ghostBtn}>
                  Copy
                </button>
              </div>
            )}
            <p className="text-xs text-zinc-500">{board.title}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onRemove(ticket)}
              disabled={busy}
              className="text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="text-lg leading-none text-zinc-500 hover:text-black dark:hover:text-white"
            >
              ✕
            </button>
          </div>
        </header>

        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <Labeled label="Title">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaveState("idle");
              }}
              className={fieldCls}
            />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Status">
              <select
                value={ticket.status}
                onChange={(e) => onSetStatus(ticket, e.target.value)}
                disabled={busy}
                className={fieldCls}
              >
                {board.columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Priority">
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  setSaveState("idle");
                }}
                className={fieldCls}
              >
                <option value="">No priority</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                  </option>
                ))}
                {/* Keep an older value that isn't a current option selectable. */}
                {priority && !(PRIORITIES as readonly string[]).includes(priority) && (
                  <option value={priority}>{priority}</option>
                )}
              </select>
            </Labeled>
          </div>
          <Labeled label="Description">
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setSaveState("idle");
              }}
              rows={4}
              className={`${fieldCls} resize-y`}
            />
          </Labeled>
          <p className="text-xs text-zinc-500">
            {assigneeEmail ? `Assignee: ${localPart(assigneeEmail)}` : "Unassigned"}
            {projectName ? ` · Project: ${projectName}` : ""}
          </p>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy || saveState === "saving" || !dirty} className={primaryBtn}>
              {saveState === "saving" ? "Saving..." : "Save changes"}
            </button>
            {saveState === "saved" && !dirty && <span className="text-sm text-zinc-500">Saved</span>}
            {saveError && <span className="text-sm text-red-600 dark:text-red-400">{saveError}</span>}
          </div>
        </form>

        {tabs.length > 0 && (
          <section className="flex flex-col gap-4 border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <div className="flex items-center gap-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={
                    "rounded-full px-3 py-1 text-xs font-medium border transition-colors " +
                    (tab === t.id
                      ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800")
                  }
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>

            {loading && <p className="text-sm text-zinc-500">Loading...</p>}
            {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

            {!loading && !loadError && tab === "conversation" && (
              <ConversationTab
                endpoint={endpoint}
                messages={messages}
                setMessages={setMessages}
                currentUserId={currentUserId}
                onCount={(messageCount) => onCounts(ticket.id, { messageCount })}
              />
            )}
            {!loading && !loadError && tab === "payload" && (
              <PayloadTab
                endpoint={endpoint}
                payloads={payloads}
                setPayloads={setPayloads}
                onCount={(payloadCount) => onCounts(ticket.id, { payloadCount })}
              />
            )}
          </section>
        )}
      </aside>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

// ---- Conversation -----------------------------------------------------------

function ConversationTab({
  endpoint,
  messages,
  setMessages,
  currentUserId,
  onCount,
}: {
  endpoint: string;
  messages: TicketMessage[];
  setMessages: React.Dispatch<React.SetStateAction<TicketMessage[]>>;
  currentUserId: string;
  onCount: (count: number) => void;
}) {
  const [kind, setKind] = useState<TicketMessage["kind"]>("request");
  const [body, setBody] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setAdding(true);
    setError(null);
    const res = await callApi<{ message: TicketMessage; count: number }>(`${endpoint}/messages`, "POST", {
      kind,
      body,
    });
    if ("error" in res) setError(res.error);
    else {
      setMessages((prev) => [...prev, res.data.message]);
      onCount(res.data.count);
      setBody("");
    }
    setAdding(false);
  }

  async function saveEdit(id: string) {
    if (!draft.trim()) return;
    setError(null);
    const res = await callApi<{ message: TicketMessage }>(`${endpoint}/messages/${id}`, "PATCH", {
      body: draft,
    });
    if ("error" in res) setError(res.error);
    else {
      setMessages((prev) => prev.map((m) => (m.id === id ? res.data.message : m)));
      setEditingId(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await callApi<{ count: number }>(`${endpoint}/messages/${id}`, "DELETE");
    if ("error" in res) setError(res.error);
    else {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      onCount(res.data.count);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 && <p className="text-sm text-zinc-500">No messages yet.</p>}
      {messages.map((m) => {
        const mine = m.authorId === currentUserId;
        return (
          <div
            key={m.id}
            className={
              "max-w-[85%] rounded-xl border p-3 flex flex-col gap-1.5 " +
              (m.kind === "request"
                ? "self-start border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                : "self-end border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800")
            }
          >
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
              {m.kind} · {localPart(m.authorEmail)} · {new Date(m.createdAt).toLocaleString()}
              {m.editedAt ? " · edited" : ""}
            </p>
            {editingId === m.id ? (
              <>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className={fieldCls} />
                <div className="flex gap-3">
                  <button type="button" onClick={() => saveEdit(m.id)} disabled={!draft.trim()} className={ghostBtn}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className={ghostBtn}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-black dark:text-zinc-50 whitespace-pre-wrap break-words">{m.body}</p>
                {mine && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(m.id);
                        setDraft(m.body);
                      }}
                      className={ghostBtn}
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(m.id)} className={ghostBtn}>
                      Delete
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      <form onSubmit={add} className="flex flex-col gap-2 pt-1">
        <div className="flex gap-2">
          {(["request", "response"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium border capitalize " +
                (kind === k
                  ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                  : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300")
              }
            >
              {k}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "request" ? "What was asked..." : "What we replied..."}
          rows={3}
          className={`${fieldCls} resize-y`}
        />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={adding || !body.trim()} className={primaryBtn}>
            {adding ? "Adding..." : "+ Add"}
          </button>
          {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </form>
    </div>
  );
}

// ---- Payload (API request/response pairs) -----------------------------------

type PayloadInput = {
  request: { method: string; url: string; body: string };
  response: { status: string; body: string };
};

function PayloadTab({
  endpoint,
  payloads,
  setPayloads,
  onCount,
}: {
  endpoint: string;
  payloads: TicketPayload[];
  setPayloads: React.Dispatch<React.SetStateAction<TicketPayload[]>>;
  onCount: (count: number) => void;
}) {
  // The newest pair starts open; older ones start collapsed.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(payloads.length ? [payloads[payloads.length - 1].id] : [])
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function add(input: PayloadInput): Promise<string | null> {
    const res = await callApi<{ payload: TicketPayload; count: number }>(`${endpoint}/payloads`, "POST", input);
    if ("error" in res) return res.error;
    setPayloads((prev) => [...prev, res.data.payload]);
    setOpen((prev) => new Set(prev).add(res.data.payload.id));
    onCount(res.data.count);
    return null;
  }

  async function save(id: string, input: PayloadInput): Promise<string | null> {
    const res = await callApi<{ payload: TicketPayload }>(`${endpoint}/payloads/${id}`, "PATCH", input);
    if ("error" in res) return res.error;
    setPayloads((prev) => prev.map((p) => (p.id === id ? res.data.payload : p)));
    setEditingId(null);
    return null;
  }

  async function remove(id: string) {
    setError(null);
    const res = await callApi<{ count: number }>(`${endpoint}/payloads/${id}`, "DELETE");
    if ("error" in res) setError(res.error);
    else {
      setPayloads((prev) => prev.filter((p) => p.id !== id));
      onCount(res.data.count);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {payloads.length === 0 && <p className="text-sm text-zinc-500">No payloads yet.</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {payloads.map((p, i) => {
        const isOpen = open.has(p.id);
        if (editingId === p.id) {
          return (
            <div key={p.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
              <PayloadForm
                initial={p}
                submitLabel="Save"
                onSubmit={(input) => save(p.id, input)}
                onCancel={() => setEditingId(null)}
              />
            </div>
          );
        }
        return (
          <div key={p.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-2 p-3">
              <button type="button" onClick={() => toggle(p.id)} className="flex min-w-0 items-center gap-2 text-left">
                <span className="text-xs text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                <span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  #{i + 1}
                  {p.request.method ? ` · ${p.request.method}` : ""}
                  {p.request.url ? ` ${p.request.url}` : ""}
                  {p.response.status ? ` · ${p.response.status}` : ""}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-[11px] text-zinc-400">{new Date(p.createdAt).toLocaleString()}</span>
                <button type="button" onClick={() => setEditingId(p.id)} className={ghostBtn}>
                  Edit
                </button>
                <button type="button" onClick={() => remove(p.id)} className={ghostBtn}>
                  Delete
                </button>
              </div>
            </div>
            {isOpen && (
              <div className="flex flex-col gap-3 border-t border-zinc-200 dark:border-zinc-800 p-3">
                <CodeBlock heading="Request" text={p.request.body} />
                <CodeBlock
                  heading={p.response.status ? `Response · ${p.response.status}` : "Response"}
                  text={p.response.body}
                />
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-3">
        <p className="mb-2 text-xs font-medium text-zinc-500">Add payload</p>
        <PayloadForm submitLabel="+ Add" onSubmit={add} resetOnSuccess />
      </div>
    </div>
  );
}

function CodeBlock({ heading, text }: { heading: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{heading}</span>
        {text && (
          <button type="button" onClick={() => copyText(text)} className={ghostBtn}>
            Copy
          </button>
        )}
      </div>
      {text ? (
        <pre className="max-h-72 overflow-auto rounded-lg bg-zinc-100 dark:bg-zinc-950 p-2 font-mono text-xs whitespace-pre-wrap break-words text-zinc-800 dark:text-zinc-200">
          {pretty(text)}
        </pre>
      ) : (
        <p className="text-xs text-zinc-400">Empty</p>
      )}
    </div>
  );
}

function PayloadForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  resetOnSuccess,
}: {
  initial?: TicketPayload;
  submitLabel: string;
  onSubmit: (input: PayloadInput) => Promise<string | null>;
  onCancel?: () => void;
  resetOnSuccess?: boolean;
}) {
  const [method, setMethod] = useState(initial?.request.method ?? "");
  const [url, setUrl] = useState(initial?.request.url ?? "");
  const [reqBody, setReqBody] = useState(initial?.request.body ?? "");
  const [status, setStatus] = useState(initial?.response.status ? String(initial.response.status) : "");
  const [resBody, setResBody] = useState(initial?.response.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reqBody.trim() && !resBody.trim()) {
      setError("Add a request or a response body.");
      return;
    }
    setSaving(true);
    setError(null);
    const err = await onSubmit({
      request: { method, url, body: reqBody },
      response: { status, body: resBody },
    });
    setSaving(false);
    if (err) setError(err);
    else if (resetOnSuccess) {
      setMethod("");
      setUrl("");
      setReqBody("");
      setStatus("");
      setResBody("");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={`${fieldCls} w-28 shrink-0`}>
          <option value="">Method</option>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL (optional)" className={fieldCls} />
      </div>
      <textarea
        value={reqBody}
        onChange={(e) => setReqBody(e.target.value)}
        placeholder="Request body"
        rows={5}
        className={monoCls}
      />
      <input
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        placeholder="Response status (e.g. 504)"
        inputMode="numeric"
        className={`${fieldCls} w-48`}
      />
      <textarea
        value={resBody}
        onChange={(e) => setResBody(e.target.value)}
        placeholder="Response body"
        rows={5}
        className={monoCls}
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className={primaryBtn}>
          {saving ? "Saving..." : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving} className={ghostBtn}>
            Cancel
          </button>
        )}
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </form>
  );
}
