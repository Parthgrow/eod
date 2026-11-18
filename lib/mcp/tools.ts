import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  BOARDS,
  PRIORITIES,
  effectiveFields,
  getBoardBySlug,
  ticketLabel,
  type Board,
} from "@/lib/boards";
import {
  ENTRIES_PAGE_SIZE,
  getEntriesPage,
  getEntry,
  getOrgEntriesPage,
  isValidDateKey,
  saveEntry,
  todayDateKey,
  type EodEntry,
} from "@/lib/eod";
import { getOrg, getUserContext, listMembers, type OrgMember, type UserContext } from "@/lib/org-store";
import { createProject, findProjectByName, listProjects } from "@/lib/projects-store";
import type { Project } from "@/lib/projects";
import {
  addMessage,
  addPayload,
  createTicket,
  getTicket,
  getTicketDetail,
  getTicketIdByNumber,
  listTickets,
  removeTicket,
  updateTicket,
} from "@/lib/tickets-store";
import { toClientPayload, toClientTicket, type Ticket } from "@/lib/tickets";

// The EOD app's MCP tools. Transport-agnostic: the stdio script and the HTTP
// route both build an McpServer and call registerTools(server, userId).
//
// Every tool goes through the same stores as the web routes. The caller's org
// is always read from their user record (getUserContext), never from tool input.

export const MCP_SERVER_INFO = { name: "eod", version: "1.0.0" } as const;

export const MCP_INSTRUCTIONS = `Tools for the EOD app: end-of-day (EOD) updates, ticket boards and projects for the user's workspace.
- Boards: ${BOARDS.map((b) => `"${b.slug}" (${b.title}, ids like ${b.prefix}-12)`).join(", ")}. Call list_boards for columns and fields.
- Tickets are referenced by their human id (e.g. SUP-42); a raw ticket uuid also works if you pass its board.
- Dates are YYYY-MM-DD (UTC calendar day). "Today" is the current UTC day.
- Everything is scoped to the user's workspace; teammates see the same tickets, projects and EOD feed.`;

// ---- result helpers ---------------------------------------------------------

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
}

class ToolError extends Error {}

// Resolves the caller, runs the tool, and turns any failure into an isError
// result. Logs go to stderr only: stdout is the stdio transport's channel.
function handler<A>(
  userId: string,
  name: string,
  fn: (args: A, me: UserContext) => Promise<CallToolResult>
): (args: A) => Promise<CallToolResult> {
  return async (args: A) => {
    try {
      const me = await getUserContext(userId);
      if (!me) return fail("Your user account was not found or has no workspace. Sign in to the web app once.");
      return await fn(args, me);
    } catch (err) {
      if (err instanceof ToolError) return fail(err.message);
      console.error(`[mcp] tool ${name} failed:`, err);
      return fail("Something went wrong. Try again.");
    }
  };
}

// ---- shared lookups ---------------------------------------------------------

const BOARD_SLUGS = BOARDS.map((b) => b.slug) as [string, ...string[]];

function boardOrThrow(slug: string): Board {
  const board = getBoardBySlug(slug);
  if (!board) throw new ToolError(`Unknown board "${slug}". Use one of: ${BOARD_SLUGS.join(", ")}.`);
  return board;
}

// Accepts "SUP-42" (board inferred from the prefix), or a number / uuid plus a board.
async function resolveTicket(
  orgId: string,
  ref: string,
  boardSlug?: string
): Promise<{ board: Board; ticket: Ticket }> {
  const raw = ref.trim();
  const human = /^([A-Za-z]+)-(\d+)$/.exec(raw);

  let board: Board | undefined;
  let id: string | null = null;

  if (human) {
    board = BOARDS.find((b) => b.prefix.toLowerCase() === human[1].toLowerCase());
    if (!board) throw new ToolError(`Unknown ticket prefix "${human[1]}". Prefixes: ${BOARDS.map((b) => b.prefix).join(", ")}.`);
    if (boardSlug && boardSlug !== board.slug) {
      throw new ToolError(`${raw} belongs to the "${board.slug}" board, not "${boardSlug}".`);
    }
    id = await getTicketIdByNumber(orgId, board.id, Number(human[2]));
  } else {
    if (!boardSlug) throw new ToolError(`Pass a ticket id like SUP-42, or pass "board" along with "${raw}".`);
    board = boardOrThrow(boardSlug);
    id = /^\d+$/.test(raw) ? await getTicketIdByNumber(orgId, board.id, Number(raw)) : raw;
  }

  const ticket = id ? await getTicket(orgId, board.id, id) : null;
  if (!ticket) throw new ToolError(`Ticket ${raw} not found.`);
  return { board, ticket };
}

// An assignee may be given as an email or a userId; tickets store the userId.
function resolveMember(members: OrgMember[], who: string): OrgMember {
  const target = who.trim().toLowerCase();
  const m = members.find((x) => x.userId === who.trim() || x.email === target);
  if (!m) throw new ToolError(`"${who}" is not a member of this workspace. Call list_members.`);
  return m;
}

type Lookups = { members: OrgMember[]; projects: Project[] };

async function lookups(orgId: string): Promise<Lookups> {
  const [members, projects] = await Promise.all([listMembers(orgId), listProjects(orgId)]);
  return { members, projects };
}

// The ticket as tools return it: human id, board slug, and names next to ids.
function present(board: Board, ticket: Ticket, l: Lookups) {
  const t = toClientTicket(ticket);
  return {
    key: ticketLabel(board, t) || undefined,
    board: board.slug,
    ...t,
    boardId: undefined,
    statusLabel: board.columns.find((c) => c.id === t.status)?.label ?? t.status,
    assigneeEmail: t.assigneeId ? l.members.find((m) => m.userId === t.assigneeId)?.email : undefined,
    projectName: t.projectId ? l.projects.find((p) => p.id === t.projectId)?.name : undefined,
  };
}

function presentEntry(e: EodEntry) {
  return { date: e.date, author: e.authorEmail, content: e.content, createdAt: e.createdAt, updatedAt: e.updatedAt };
}

const dateSchema = z
  .string()
  .refine(isValidDateKey, "Must be a real date in YYYY-MM-DD format.")
  .describe("Date as YYYY-MM-DD (UTC). Defaults to today.");

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

// ---- tools ------------------------------------------------------------------

export function registerTools(server: McpServer, userId: string): void {
  // -- identity & overview --

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "Returns the signed-in user (id, email), their workspace, and today's date (UTC, YYYY-MM-DD).",
      annotations: READ,
    },
    handler(userId, "whoami", async (_args: unknown, me) => {
      const org = await getOrg(me.orgId);
      return ok({
        userId: me.userId,
        email: me.email,
        workspace: org ? { id: org.id, name: org.name, kind: org.kind } : { id: me.orgId },
        today: todayDateKey(),
      });
    })
  );

  server.registerTool(
    "get_stats",
    {
      title: "Workspace stats",
      description:
        "Overview of the workspace: ticket counts per board and status, open tickets assigned to you, project and member counts, and whether your EOD for today (UTC) is filled in.",
      annotations: READ,
    },
    handler(userId, "get_stats", async (_args: unknown, me) => {
      const today = todayDateKey();
      const [perBoard, projects, members, todayEntry, mine] = await Promise.all([
        Promise.all(BOARDS.map(async (b) => ({ board: b, tickets: await listTickets(me.orgId, b.id) }))),
        listProjects(me.orgId),
        listMembers(me.orgId),
        getEntry(me.userId, today),
        getEntriesPage(me.userId, 0, 1),
      ]);

      const lastColumn = (b: Board) => b.columns[b.columns.length - 1].id;
      return ok({
        today,
        eodFilledToday: todayEntry !== null,
        myEodCount: mine.total,
        projects: projects.length,
        members: members.length,
        boards: perBoard.map(({ board, tickets }) => ({
          board: board.slug,
          title: board.title,
          total: tickets.length,
          byStatus: Object.fromEntries(
            board.columns.map((c) => [c.id, tickets.filter((t) => t.status === c.id).length])
          ),
          assignedToMeNotDone: tickets.filter(
            (t) => t.assigneeId === me.userId && t.status !== lastColumn(board)
          ).length,
        })),
      });
    })
  );

  server.registerTool(
    "list_boards",
    {
      title: "List boards",
      description:
        "Lists the ticket boards with their slug, ticket id prefix, columns (valid status values, in order), the initial status for new tickets, extra fields, and whether conversation/payloads are enabled.",
      annotations: READ,
    },
    handler(userId, "list_boards", async () =>
      ok(
        BOARDS.map((b) => ({
          slug: b.slug,
          title: b.title,
          prefix: b.prefix,
          columns: b.columns,
          initialStatus: b.initialStatus,
          fields: effectiveFields(b).map((f) => ({
            key: f.key === "projectId" ? "project" : f.key === "assigneeId" ? "assignee" : f.key,
            label: f.label,
            required: !!f.required,
            ...(f.options ? { options: f.options } : {}),
          })),
          features: b.features,
        }))
      )
    )
  );

  // -- tickets --

  server.registerTool(
    "list_tickets",
    {
      title: "List tickets",
      description:
        "Lists tickets on one board, oldest first, with optional filters. Returns at most `limit` tickets (default 50, max 200) plus the total that matched.",
      inputSchema: {
        board: z.enum(BOARD_SLUGS).describe("Board slug (see list_boards)."),
        status: z.string().optional().describe("Only tickets in this column id (e.g. in_progress)."),
        priority: z.enum(PRIORITIES).optional().describe("Only tickets with this priority."),
        assignee: z
          .string()
          .optional()
          .describe('Only tickets assigned to this member (email or userId). Use "me" for yourself, "none" for unassigned.'),
        project: z.string().optional().describe("Only tickets in this project (name or id). General board only."),
        query: z.string().optional().describe("Case-insensitive text match on title and description."),
        limit: z.number().int().min(1).max(200).optional().describe("Max tickets to return. Default 50."),
      },
      annotations: READ,
    },
    handler(userId, "list_tickets", async (args, me) => {
      const board = boardOrThrow(args.board);
      const [tickets, l] = await Promise.all([listTickets(me.orgId, board.id), lookups(me.orgId)]);

      let filtered = tickets;
      if (args.status) {
        if (!board.columns.some((c) => c.id === args.status)) {
          throw new ToolError(`Invalid status "${args.status}". Columns: ${board.columns.map((c) => c.id).join(", ")}.`);
        }
        filtered = filtered.filter((t) => t.status === args.status);
      }
      if (args.priority) filtered = filtered.filter((t) => t.priority === args.priority);
      if (args.assignee) {
        const a = args.assignee.trim().toLowerCase();
        if (a === "none") filtered = filtered.filter((t) => !t.assigneeId);
        else {
          const target = a === "me" ? me.userId : resolveMember(l.members, args.assignee).userId;
          filtered = filtered.filter((t) => t.assigneeId === target);
        }
      }
      if (args.project) {
        const p = args.project.trim().toLowerCase();
        const project = l.projects.find((x) => x.id === args.project || x.name.toLowerCase() === p);
        if (!project) throw new ToolError(`Project "${args.project}" not found. Call list_projects.`);
        filtered = filtered.filter((t) => t.projectId === project.id);
      }
      if (args.query) {
        const q = args.query.toLowerCase();
        filtered = filtered.filter(
          (t) => t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)
        );
      }

      const limit = args.limit ?? 50;
      return ok({
        board: board.slug,
        total: filtered.length,
        returned: Math.min(limit, filtered.length),
        tickets: filtered.slice(0, limit).map((t) => present(board, t, l)),
      });
    })
  );

  const ticketRef = {
    ticket: z.string().min(1).describe('Ticket id like "SUP-42". A number or uuid also works together with "board".'),
    board: z.enum(BOARD_SLUGS).optional().describe("Board slug. Only needed when `ticket` is not a prefixed id."),
  };

  server.registerTool(
    "get_ticket",
    {
      title: "Get ticket",
      description:
        "Returns one ticket with all its fields, plus its conversation messages and API payloads (on boards that have them).",
      inputSchema: ticketRef,
      annotations: READ,
    },
    handler(userId, "get_ticket", async (args, me) => {
      const { board, ticket } = await resolveTicket(me.orgId, args.ticket, args.board);
      const [detail, l] = await Promise.all([getTicketDetail(me.orgId, board, ticket.id), lookups(me.orgId)]);
      return ok({
        ...present(board, ticket, l),
        messages: detail?.messages ?? [],
        payloads: (detail?.payloads ?? []).map(toClientPayload),
      });
    })
  );

  server.registerTool(
    "create_ticket",
    {
      title: "Create ticket",
      description:
        "Creates a ticket on a board in the board's initial column. Returns the new ticket with its id (e.g. GEN-7). `provider` is required on the api board. `project` (general board) is a project name; it is created if it doesn't exist.",
      inputSchema: {
        board: z.enum(BOARD_SLUGS).describe("Board slug (see list_boards)."),
        title: z.string().min(1).describe("Ticket title."),
        description: z.string().optional().describe("Freeform notes (markdown)."),
        priority: z.enum(PRIORITIES).optional().describe("Priority."),
        assignee: z.string().optional().describe('Assignee email or userId, or "me".'),
        project: z.string().optional().describe("Project name (general board only)."),
        provider: z.string().optional().describe("Provider name (api board only, required there)."),
      },
      annotations: WRITE,
    },
    handler(userId, "create_ticket", async (args, me) => {
      const board = boardOrThrow(args.board);
      const l = await lookups(me.orgId);

      const input: Record<string, unknown> = {
        title: args.title,
        description: args.description,
        priority: args.priority,
        provider: args.provider,
      };
      if (args.assignee) {
        input.assigneeId = args.assignee.trim().toLowerCase() === "me" ? me.userId : resolveMember(l.members, args.assignee).userId;
      }
      if (args.project) {
        if (!board.fields.some((f) => f.key === "projectId")) throw new ToolError(`The ${board.slug} board has no project field.`);
        input.projectId = args.project; // the store finds-or-creates by name
      }
      if (args.provider && !board.fields.some((f) => f.key === "provider")) {
        throw new ToolError(`The ${board.slug} board has no provider field.`);
      }

      const result = await createTicket(me.orgId, board, input, me.userId);
      if ("error" in result) throw new ToolError(result.error);
      return ok(present(board, result, await lookups(me.orgId)));
    })
  );

  server.registerTool(
    "update_ticket",
    {
      title: "Update ticket",
      description:
        'Edits a ticket. Only the fields you pass change. `status` moves it to another column (see list_boards). Pass "" for description or priority to clear it.',
      inputSchema: {
        ...ticketRef,
        status: z.string().optional().describe("New column id."),
        title: z.string().optional().describe("New title (cannot be empty)."),
        description: z.string().optional().describe('New description; "" clears it.'),
        priority: z.enum([...PRIORITIES, ""]).optional().describe('New priority; "" clears it.'),
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    handler(userId, "update_ticket", async (args, me) => {
      const { board, ticket } = await resolveTicket(me.orgId, args.ticket, args.board);
      const result = await updateTicket(me.orgId, board, ticket.id, {
        status: args.status,
        title: args.title,
        description: args.description,
        priority: args.priority,
      });
      if (result === null) throw new ToolError(`Ticket ${args.ticket} not found.`);
      if ("error" in result) throw new ToolError(result.error);

      // Re-read rather than merging the old ticket over the result: a merge would
      // bring back a description or priority that was just cleared.
      const fresh = await getTicket(me.orgId, board.id, ticket.id);
      return ok(present(board, fresh ?? result, await lookups(me.orgId)));
    })
  );

  server.registerTool(
    "delete_ticket",
    {
      title: "Delete ticket",
      description:
        "Permanently deletes a ticket with its messages and payloads. Cannot be undone. Requires confirm: true.",
      inputSchema: {
        ...ticketRef,
        confirm: z.literal(true).describe("Must be true to delete."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    handler(userId, "delete_ticket", async (args, me) => {
      if (args.confirm !== true) throw new ToolError("Pass confirm: true to delete.");
      const { board, ticket } = await resolveTicket(me.orgId, args.ticket, args.board);
      const removed = await removeTicket(me.orgId, board.id, ticket.id);
      if (!removed) throw new ToolError(`Ticket ${args.ticket} not found.`);
      return ok({ deleted: ticketLabel(board, ticket) || ticket.id, title: ticket.title });
    })
  );

  server.registerTool(
    "add_ticket_message",
    {
      title: "Add ticket message",
      description:
        'Adds a message to a ticket\'s conversation (support board). kind "request" is what the other side asked; "response" is what we replied. Max 5000 characters. You are recorded as the author.',
      inputSchema: {
        ...ticketRef,
        kind: z.enum(["request", "response"]).describe("request = from the other side, response = our reply."),
        body: z.string().min(1).describe("Message text."),
      },
      annotations: WRITE,
    },
    handler(userId, "add_ticket_message", async (args, me) => {
      const { board, ticket } = await resolveTicket(me.orgId, args.ticket, args.board);
      const result = await addMessage(me.orgId, board, ticket.id, { kind: args.kind, body: args.body }, {
        userId: me.userId,
        email: me.email,
      });
      if (result === null) throw new ToolError(`Ticket ${args.ticket} not found.`);
      if ("error" in result) throw new ToolError(result.error);
      return ok({ ticket: ticketLabel(board, ticket), message: result.message, messageCount: result.count });
    })
  );

  server.registerTool(
    "add_ticket_payload",
    {
      title: "Add ticket payload",
      description:
        "Attaches an API request/response pair to a ticket (api and support boards). At least one body is required; bodies are stored as raw text (max 100KB each).",
      inputSchema: {
        ...ticketRef,
        request_body: z.string().optional().describe("Request body (raw text, often JSON)."),
        request_method: z.string().optional().describe("HTTP method, e.g. POST."),
        request_url: z.string().optional().describe("Request URL."),
        response_body: z.string().optional().describe("Response body (raw text)."),
        response_status: z.number().int().min(100).max(599).optional().describe("HTTP status code."),
      },
      annotations: WRITE,
    },
    handler(userId, "add_ticket_payload", async (args, me) => {
      const { board, ticket } = await resolveTicket(me.orgId, args.ticket, args.board);
      const result = await addPayload(
        me.orgId,
        board,
        ticket.id,
        {
          request: { body: args.request_body, method: args.request_method, url: args.request_url },
          response: { body: args.response_body, status: args.response_status },
        },
        me.userId
      );
      if (result === null) throw new ToolError(`Ticket ${args.ticket} not found.`);
      if ("error" in result) throw new ToolError(result.error);
      return ok({ ticket: ticketLabel(board, ticket), payload: toClientPayload(result.payload), payloadCount: result.count });
    })
  );

  // -- projects & members --

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "Lists the workspace's projects (id, name, createdAt), oldest first.",
      annotations: READ,
    },
    handler(userId, "list_projects", async (_args: unknown, me) =>
      ok((await listProjects(me.orgId)).map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt })))
    )
  );

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description: "Creates a project. Names are unique per workspace (case-insensitive).",
      inputSchema: { name: z.string().min(1).describe("Project name.") },
      annotations: WRITE,
    },
    handler(userId, "create_project", async (args, me) => {
      const name = args.name.trim();
      if (!name) throw new ToolError("Project name is required.");
      if (await findProjectByName(me.orgId, name)) throw new ToolError("A project with that name already exists.");
      const p = await createProject(me.orgId, name, me.userId);
      return ok({ id: p.id, name: p.name, createdAt: p.createdAt });
    })
  );

  server.registerTool(
    "list_members",
    {
      title: "List members",
      description: "Lists the workspace's members (userId, email). Use these as ticket assignees.",
      annotations: READ,
    },
    handler(userId, "list_members", async (_args: unknown, me) =>
      ok((await listMembers(me.orgId)).map((m) => ({ ...m, isMe: m.userId === me.userId })))
    )
  );

  // -- EOD --

  server.registerTool(
    "get_eod",
    {
      title: "Get EOD",
      description:
        "Returns one EOD entry for a day (YYYY-MM-DD, default today UTC): yours by default, or a teammate's via `member`. Returns entry: null if none was written.",
      inputSchema: {
        date: dateSchema.optional(),
        member: z.string().optional().describe("Teammate email or userId. Defaults to you."),
      },
      annotations: READ,
    },
    handler(userId, "get_eod", async (args, me) => {
      const date = args.date ?? todayDateKey();
      let who = me.userId;
      if (args.member) who = resolveMember(await listMembers(me.orgId), args.member).userId;
      const entry = await getEntry(who, date);
      return ok({ date, entry: entry ? presentEntry(entry) : null });
    })
  );

  server.registerTool(
    "list_eod_entries",
    {
      title: "List EOD entries",
      description: `Lists EOD entries newest first, ${ENTRIES_PAGE_SIZE} per page by default. scope "team" (default) is the whole workspace's feed; "mine" is only yours. Pages start at 1.`,
      inputSchema: {
        scope: z.enum(["team", "mine"]).optional().describe('"team" (default) or "mine".'),
        page: z.number().int().min(1).optional().describe("Page number, starting at 1. Default 1."),
        page_size: z.number().int().min(1).max(50).optional().describe(`Entries per page. Default ${ENTRIES_PAGE_SIZE}, max 50.`),
      },
      annotations: READ,
    },
    handler(userId, "list_eod_entries", async (args, me) => {
      const page = (args.page ?? 1) - 1;
      const size = args.page_size ?? ENTRIES_PAGE_SIZE;
      const result =
        args.scope === "mine"
          ? await getEntriesPage(me.userId, page, size)
          : await getOrgEntriesPage(me.orgId, page, size);
      return ok({
        scope: args.scope ?? "team",
        page: page + 1,
        pageSize: size,
        total: result.total,
        totalPages: result.totalPages,
        entries: result.entries.map(presentEntry),
      });
    })
  );

  server.registerTool(
    "save_eod",
    {
      title: "Save EOD",
      description:
        "Writes your EOD for a day (YYYY-MM-DD, default today UTC). Today's entry replaces the existing text, or with append: true adds to the end of it. A past day can only be written if it has no entry yet; future days are rejected.",
      inputSchema: {
        content: z.string().min(1).describe("The EOD text (markdown)."),
        date: dateSchema.optional(),
        append: z.boolean().optional().describe("Add to today's existing entry instead of replacing it. Default false."),
      },
      annotations: WRITE,
    },
    handler(userId, "save_eod", async (args, me) => {
      const result = await saveEntry(me, { content: args.content, date: args.date, append: args.append });
      if ("error" in result) throw new ToolError(result.error);
      return ok({ saved: true, entry: presentEntry(result.entry) });
    })
  );
}
