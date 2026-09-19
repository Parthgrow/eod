import "server-only";
import { kv } from "@vercel/kv";
import {
  boardTicketKey,
  boardTicketsIndexKey,
  orgMembersKey,
  ticketMessagesKey,
  ticketMetaKey,
  ticketNumbersKey,
  ticketPayloadsKey,
  ticketSeqKey,
} from "@/lib/kv-keys";
import { effectiveFields, isColumn, PRIORITIES, type Board } from "@/lib/boards";
import { findOrCreateProjectByName } from "@/lib/projects-store";
import type { Ticket, TicketMessage, TicketPayload } from "@/lib/tickets";

// Scoped to an organization AND a board: every function takes the caller's orgId
// (only ever from their session), so a user can't reach another org's tickets.

// A store error may carry the HTTP status the route should answer with.
export type StoreError = { error: string; status?: number };

const MAX_MESSAGE_LENGTH = 5000;
const MAX_MESSAGES_PER_TICKET = 200;
const MAX_PAYLOAD_BODY = 100_000;
const MAX_PAYLOADS_PER_TICKET = 50;

// ---- numbering + counters ---------------------------------------------------
// Numbers and counts live in a per-board meta hash, not in the ticket JSON, so
// existing tickets are never rewritten and concurrent updates can't clobber them.

type Meta = Record<string, number>;

async function loadMeta(orgId: string, boardId: string): Promise<Meta> {
  return (await kv.hgetall<Meta>(ticketMetaKey(orgId, boardId))) ?? {};
}

// Idempotent + race-safe: the first writer of `{id}:n` wins, a loser adopts it.
async function assignNumber(orgId: string, boardId: string, id: string): Promise<number> {
  const metaKey = ticketMetaKey(orgId, boardId);
  const existing = await kv.hget<number>(metaKey, `${id}:n`);
  if (existing) return Number(existing);

  const candidate = await kv.incr(ticketSeqKey(orgId, boardId));
  const won = await kv.hsetnx(metaKey, `${id}:n`, candidate);
  if (!won) return Number(await kv.hget<number>(metaKey, `${id}:n`));

  await kv.hset(ticketNumbersKey(orgId, boardId), { [String(candidate)]: id });
  return candidate;
}

function decorate(ticket: Ticket, meta: Meta): Ticket {
  const n = meta[`${ticket.id}:n`];
  return {
    ...ticket,
    ...(n ? { number: Number(n) } : {}),
    messageCount: Math.max(0, Number(meta[`${ticket.id}:m`] ?? 0)),
    payloadCount: Math.max(0, Number(meta[`${ticket.id}:p`] ?? 0)),
  };
}

export async function listTickets(orgId: string, boardId: string): Promise<Ticket[]> {
  const ids = await kv.smembers<string[]>(boardTicketsIndexKey(orgId, boardId));
  if (!ids.length) return [];

  const [items, meta] = await Promise.all([
    Promise.all(ids.map((id) => kv.get<Ticket>(boardTicketKey(orgId, boardId, id)))),
    loadMeta(orgId, boardId),
  ]);

  const tickets = items
    .filter((t): t is Ticket => t !== null)
    .sort((a, b) => a.createdAt - b.createdAt);

  // Tickets that predate numbering get one now, oldest first, so numbers follow
  // creation order. This only writes to the meta hashes, never to a ticket.
  for (const t of tickets) {
    if (!meta[`${t.id}:n`]) meta[`${t.id}:n`] = await assignNumber(orgId, boardId, t.id);
  }

  return tickets.map((t) => decorate(t, meta));
}


export async function createTicket(
  orgId: string,
  board: Board,
  input: Record<string, unknown>,
  createdBy: string
): Promise<Ticket | { error: string }> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return { error: "Title is required." };

  const description = typeof input.description === "string" ? input.description.trim() : "";

  // Collect + validate the board's fields plus the universal ones (e.g. assignee).
  const extra: Partial<Ticket> = {};
  for (const spec of effectiveFields(board)) {
    const raw = input[spec.key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      if (spec.required) return { error: `${spec.label} is required.` };
      continue;
    }

    if (spec.type === "select" && spec.options && !spec.options.includes(value)) {
      return { error: `${spec.label} is invalid.` };
    } else if (spec.type === "member") {
      const ok = await kv.sismember(orgMembersKey(orgId), value);
      if (!ok) return { error: `${spec.label} is not a valid member.` };
      extra[spec.key] = value; // assigneeId = userId
    } else if (spec.type === "project") {
      // The input holds a project *name*; reuse or create the project, store its id.
      const project = await findOrCreateProjectByName(orgId, value, createdBy);
      extra[spec.key] = project.id; // projectId
    } else {
      extra[spec.key] = value; // text / select
    }
  }

  const now = Date.now();
  const ticket: Ticket = {
    ...extra,
    id: crypto.randomUUID(),
    boardId: board.id,
    title,
    ...(description ? { description } : {}),
    status: board.initialStatus,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };

  await Promise.all([
    kv.set(boardTicketKey(orgId, board.id, ticket.id), ticket),
    kv.sadd(boardTicketsIndexKey(orgId, board.id), ticket.id),
  ]);

  const number = await assignNumber(orgId, board.id, ticket.id);
  return { ...ticket, number, messageCount: 0, payloadCount: 0 };
}

// A ticket's own editable fields. Only the keys present are touched, so the same
// call covers a column move (status) and an edit of the freeform text.
export type TicketEdits = {
  status?: string;
  title?: string;
  description?: string;
  priority?: string;
};

export async function updateTicket(
  orgId: string,
  board: Board,
  id: string,
  edits: TicketEdits
): Promise<Ticket | null | { error: string }> {
  const patch: Partial<Ticket> = {};

  if (edits.status !== undefined) {
    if (!isColumn(board, edits.status)) return { error: "Invalid status." };
    patch.status = edits.status;
  }

  if (edits.title !== undefined) {
    const title = edits.title.trim();
    if (!title) return { error: "Title is required." };
    patch.title = title;
  }

  // An empty description means "remove it", so the field is dropped rather than
  // stored as "" — keeping absent and blank the same thing everywhere.
  let clearDescription = false;
  if (edits.description !== undefined) {
    const description = edits.description.trim();
    if (description) patch.description = description;
    else clearDescription = true;
  }

  // Priority is universal and optional; an empty value clears it, same as description.
  let clearPriority = false;
  if (edits.priority !== undefined) {
    const priority = edits.priority.trim();
    if (!priority) {
      clearPriority = true;
    } else if (!(PRIORITIES as readonly string[]).includes(priority)) {
      return { error: "Priority is invalid." };
    } else {
      patch.priority = priority;
    }
  }

  if (!clearDescription && !clearPriority && Object.keys(patch).length === 0) {
    return { error: "Nothing to update." };
  }

  const existing = await kv.get<Ticket>(boardTicketKey(orgId, board.id, id));
  if (!existing) return null;

  const updated: Ticket = { ...existing, ...patch, updatedAt: Date.now() };
  if (clearDescription) delete updated.description;
  if (clearPriority) delete updated.priority;

  await kv.set(boardTicketKey(orgId, board.id, id), updated);
  return updated;
}

export async function removeTicket(orgId: string, boardId: string, id: string): Promise<boolean> {
  const existing = await kv.get<Ticket>(boardTicketKey(orgId, boardId, id));
  if (!existing) return false;

  const metaKey = ticketMetaKey(orgId, boardId);
  const number = await kv.hget<number>(metaKey, `${id}:n`);

  await Promise.all([
    kv.del(boardTicketKey(orgId, boardId, id)),
    kv.srem(boardTicketsIndexKey(orgId, boardId), id),
    // Everything hanging off the ticket goes with it.
    kv.del(ticketMessagesKey(orgId, boardId, id), ticketPayloadsKey(orgId, boardId, id)),
    kv.hdel(metaKey, `${id}:n`, `${id}:m`, `${id}:p`),
    number ? kv.hdel(ticketNumbersKey(orgId, boardId), String(number)) : Promise.resolve(0),
  ]);
  return true;
}

// ---- conversation + payloads ------------------------------------------------

async function ticketExists(orgId: string, boardId: string, id: string): Promise<boolean> {
  return (await kv.exists(boardTicketKey(orgId, boardId, id))) === 1;
}

function byCreatedAt<T extends { createdAt: number; id: string }>(a: T, b: T): number {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

// Everything the side panel needs for one ticket, in a single read.
export async function getTicketDetail(
  orgId: string,
  board: Board,
  id: string
): Promise<{ messages: TicketMessage[]; payloads: TicketPayload[] } | null> {
  if (!(await ticketExists(orgId, board.id, id))) return null;

  const [messages, payloads] = await Promise.all([
    board.features.conversation
      ? kv.hgetall<Record<string, TicketMessage>>(ticketMessagesKey(orgId, board.id, id))
      : null,
    board.features.payloads
      ? kv.hgetall<Record<string, TicketPayload>>(ticketPayloadsKey(orgId, board.id, id))
      : null,
  ]);

  return {
    messages: Object.values(messages ?? {}).sort(byCreatedAt),
    payloads: Object.values(payloads ?? {}).sort(byCreatedAt),
  };
}

type Author = { userId: string; email: string };

function cleanMessageBody(raw: unknown): string | StoreError {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body) return { error: "Message is required." };
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` };
  }
  return body;
}

export async function addMessage(
  orgId: string,
  board: Board,
  ticketId: string,
  input: { kind?: unknown; body?: unknown },
  author: Author
): Promise<{ message: TicketMessage; count: number } | null | StoreError> {
  if (!board.features.conversation) return { error: "Conversation isn't enabled on this board." };
  if (input.kind !== "request" && input.kind !== "response") return { error: "Invalid message type." };

  const body = cleanMessageBody(input.body);
  if (typeof body !== "string") return body;

  if (!(await ticketExists(orgId, board.id, ticketId))) return null;

  const key = ticketMessagesKey(orgId, board.id, ticketId);
  if ((await kv.hlen(key)) >= MAX_MESSAGES_PER_TICKET) {
    return { error: "This ticket has reached its message limit." };
  }

  const message: TicketMessage = {
    id: crypto.randomUUID(),
    ticketId,
    kind: input.kind,
    body,
    authorId: author.userId,
    authorEmail: author.email,
    createdAt: Date.now(),
  };
  await kv.hset(key, { [message.id]: message });
  const count = await kv.hincrby(ticketMetaKey(orgId, board.id), `${ticketId}:m`, 1);
  return { message, count };
}

export async function editMessage(
  orgId: string,
  board: Board,
  ticketId: string,
  messageId: string,
  userId: string,
  input: { body?: unknown }
): Promise<TicketMessage | null | StoreError> {
  const body = cleanMessageBody(input.body);
  if (typeof body !== "string") return body;

  const key = ticketMessagesKey(orgId, board.id, ticketId);
  const existing = await kv.hget<TicketMessage>(key, messageId);
  if (!existing) return null;
  if (existing.authorId !== userId) {
    return { error: "You can only edit your own messages.", status: 403 };
  }

  const updated: TicketMessage = { ...existing, body, editedAt: Date.now() };
  await kv.hset(key, { [messageId]: updated });
  return updated;
}

export async function removeMessage(
  orgId: string,
  board: Board,
  ticketId: string,
  messageId: string,
  userId: string
): Promise<{ count: number } | null | StoreError> {
  const key = ticketMessagesKey(orgId, board.id, ticketId);
  const existing = await kv.hget<TicketMessage>(key, messageId);
  if (!existing) return null;
  if (existing.authorId !== userId) {
    return { error: "You can only delete your own messages.", status: 403 };
  }

  await kv.hdel(key, messageId);
  const count = await kv.hincrby(ticketMetaKey(orgId, board.id), `${ticketId}:m`, -1);
  return { count: Math.max(0, count) };
}

const METHOD_RE = /^[A-Za-z]{3,10}$/;

// Validates the client's request/response pair into the stored shape. Bodies are
// kept as-is (only outer whitespace trimmed) — nothing is parsed or rewritten.
function cleanPayload(input: {
  request?: unknown;
  response?: unknown;
}): Pick<TicketPayload, "request" | "response"> | StoreError {
  const req = (input.request ?? {}) as Record<string, unknown>;
  const res = (input.response ?? {}) as Record<string, unknown>;

  const reqBody = typeof req.body === "string" ? req.body.trim() : "";
  const resBody = typeof res.body === "string" ? res.body.trim() : "";
  if (!reqBody && !resBody) return { error: "Add a request or a response body." };
  if (reqBody.length > MAX_PAYLOAD_BODY || resBody.length > MAX_PAYLOAD_BODY) {
    return { error: `Each body can be at most ${MAX_PAYLOAD_BODY / 1000}KB.` };
  }

  const request: TicketPayload["request"] = { body: reqBody };
  const method = typeof req.method === "string" ? req.method.trim() : "";
  if (method) {
    if (!METHOD_RE.test(method)) return { error: "Method is invalid." };
    request.method = method.toUpperCase();
  }
  const url = typeof req.url === "string" ? req.url.trim() : "";
  if (url) {
    if (url.length > 2000) return { error: "URL is too long." };
    request.url = url;
  }

  const response: TicketPayload["response"] = { body: resBody };
  const rawStatus = res.status;
  if (rawStatus !== undefined && rawStatus !== null && rawStatus !== "") {
    const status = Number(rawStatus);
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      return { error: "Status must be an HTTP code between 100 and 599." };
    }
    response.status = status;
  }

  return { request, response };
}

export async function addPayload(
  orgId: string,
  board: Board,
  ticketId: string,
  input: { request?: unknown; response?: unknown },
  createdBy: string
): Promise<{ payload: TicketPayload; count: number } | null | StoreError> {
  if (!board.features.payloads) return { error: "Payloads aren't enabled on this board." };

  const cleaned = cleanPayload(input);
  if ("error" in cleaned) return cleaned;

  if (!(await ticketExists(orgId, board.id, ticketId))) return null;

  const key = ticketPayloadsKey(orgId, board.id, ticketId);
  if ((await kv.hlen(key)) >= MAX_PAYLOADS_PER_TICKET) {
    return { error: "This ticket has reached its payload limit." };
  }

  const payload: TicketPayload = {
    id: crypto.randomUUID(),
    ticketId,
    ...cleaned,
    createdBy,
    createdAt: Date.now(),
  };
  await kv.hset(key, { [payload.id]: payload });
  const count = await kv.hincrby(ticketMetaKey(orgId, board.id), `${ticketId}:p`, 1);
  return { payload, count };
}

// Any org member can edit a payload — it's shared reference data, unlike messages.
export async function editPayload(
  orgId: string,
  board: Board,
  ticketId: string,
  payloadId: string,
  input: { request?: unknown; response?: unknown }
): Promise<TicketPayload | null | StoreError> {
  const cleaned = cleanPayload(input);
  if ("error" in cleaned) return cleaned;

  const key = ticketPayloadsKey(orgId, board.id, ticketId);
  const existing = await kv.hget<TicketPayload>(key, payloadId);
  if (!existing) return null;

  const updated: TicketPayload = { ...existing, ...cleaned, updatedAt: Date.now() };
  await kv.hset(key, { [payloadId]: updated });
  return updated;
}

export async function removePayload(
  orgId: string,
  board: Board,
  ticketId: string,
  payloadId: string
): Promise<{ count: number } | null> {
  const key = ticketPayloadsKey(orgId, board.id, ticketId);
  if (!(await kv.hexists(key, payloadId))) return null;

  await kv.hdel(key, payloadId);
  const count = await kv.hincrby(ticketMetaKey(orgId, board.id), `${ticketId}:p`, -1);
  return { count: Math.max(0, count) };
}
