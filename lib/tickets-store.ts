import "server-only";
import { kv } from "@vercel/kv";
import { boardTicketKey, boardTicketsIndexKey, orgMembersKey } from "@/lib/kv-keys";
import { effectiveFields, isColumn, type Board } from "@/lib/boards";
import { findOrCreateProjectByName } from "@/lib/projects-store";
import type { Ticket } from "@/lib/tickets";

// Scoped to an organization AND a board: every function takes the caller's orgId
// (only ever from their session), so a user can't reach another org's tickets.

export async function listTickets(orgId: string, boardId: string): Promise<Ticket[]> {
  const ids = await kv.smembers<string[]>(boardTicketsIndexKey(orgId, boardId));
  if (!ids.length) return [];

  const items = await Promise.all(
    ids.map((id) => kv.get<Ticket>(boardTicketKey(orgId, boardId, id)))
  );

  return items
    .filter((t): t is Ticket => t !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function createTicket(
  orgId: string,
  board: Board,
  input: Record<string, unknown>,
  createdBy: string
): Promise<Ticket | { error: string }> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return { error: "Title is required." };

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
    status: board.initialStatus,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };

  await Promise.all([
    kv.set(boardTicketKey(orgId, board.id, ticket.id), ticket),
    kv.sadd(boardTicketsIndexKey(orgId, board.id), ticket.id),
  ]);
  return ticket;
}

export async function setTicketStatus(
  orgId: string,
  board: Board,
  id: string,
  status: string
): Promise<Ticket | null | { error: string }> {
  if (!isColumn(board, status)) return { error: "Invalid status." };

  const existing = await kv.get<Ticket>(boardTicketKey(orgId, board.id, id));
  if (!existing) return null;

  const updated: Ticket = { ...existing, status, updatedAt: Date.now() };
  await kv.set(boardTicketKey(orgId, board.id, id), updated);
  return updated;
}

export async function removeTicket(orgId: string, boardId: string, id: string): Promise<boolean> {
  const existing = await kv.get<Ticket>(boardTicketKey(orgId, boardId, id));
  if (!existing) return false;

  await Promise.all([
    kv.del(boardTicketKey(orgId, boardId, id)),
    kv.srem(boardTicketsIndexKey(orgId, boardId), id),
  ]);
  return true;
}
