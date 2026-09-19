// A ticket is the atomic unit of work. One flat type across all boards; each
// board-specific field is an optional typed column, and each board's def
// (lib/boards.ts) declares which of them it uses.

export type TicketFieldKey = "provider" | "priority" | "projectId" | "assigneeId";

export type Ticket = {
  id: string;
  boardId: string;
  title: string;
  description?: string; // freeform notes; optional on every board
  status: string; // one of the board's column ids
  createdAt: number;
  updatedAt: number;
  createdBy?: string; // userId — set from session on create, never shown in UI
  // board-specific / reference fields — all optional; each board uses a subset:
  provider?: string;
  priority?: string;
  projectId?: string; // reference to a project (general board)
  assigneeId?: string; // reference to an org member (universal)
  // Derived, not stored in the ticket JSON: the store merges these in from the
  // per-board meta hash when tickets are listed / created.
  number?: number; // per-board sequence, shown as e.g. SUP-42
  messageCount?: number;
  payloadCount?: number;
};

// A note in a ticket's conversation. "request" = what the other side asked,
// "response" = what we replied.
export type TicketMessage = {
  id: string;
  ticketId: string;
  kind: "request" | "response";
  body: string;
  authorId: string;
  authorEmail: string;
  createdAt: number;
  editedAt?: number;
};

// One API request/response pair attached to a ticket. Bodies are raw text (often
// JSON, but not always), so nothing is parsed on the way in.
export type TicketPayload = {
  id: string;
  ticketId: string;
  request: { body: string; method?: string; url?: string };
  response: { body: string; status?: number };
  createdBy?: string; // userId — server-side only, stripped before it reaches the browser
  createdAt: number;
  updatedAt?: number;
};

export function toClientPayload(payload: TicketPayload): TicketPayload {
  const copy = { ...payload };
  delete copy.createdBy;
  return copy;
}

export type FieldSpec = {
  key: TicketFieldKey;
  label: string;
  // "member" and "project" are reference fields: the ticket stores an id, which is
  // resolved to a display name via a lookup (org members / projects).
  type: "text" | "select" | "member" | "project";
  required?: boolean;
  options?: readonly string[]; // for select
};

// createdBy is tracked server-side but never shown; strip it before a ticket
// crosses to the browser, so it isn't even present in the client payload.
export function toClientTicket(ticket: Ticket): Ticket {
  const copy = { ...ticket };
  delete copy.createdBy;
  return copy;
}
