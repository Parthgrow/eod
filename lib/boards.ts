// The board catalog. Boards are defined in code (a fixed set), not stored in KV.
// Each board declares its columns, the initial column, and which ticket fields
// it uses. `slug` is the URL name; `id` is the internal id used in KV keys.

import type { FieldSpec } from "@/lib/tickets";

export type Column = { id: string; label: string };

export type Board = {
  id: string; // internal, used in KV keys (e.g. "integrations")
  slug: string; // URL name (e.g. "api")
  title: string;
  columns: Column[];
  initialStatus: string;
  fields: FieldSpec[]; // which ticket fields this board shows / collects
};

export const BOARDS: readonly Board[] = [
  {
    id: "integrations",
    slug: "api",
    title: "API integrations",
    columns: [
      { id: "pending", label: "Pending" },
      { id: "uat_access_given", label: "UAT access given" },
      { id: "uat_tested", label: "UAT tested" },
      { id: "production_tested", label: "Production tested" },
      { id: "prod_live", label: "Prod live" },
    ],
    initialStatus: "pending",
    fields: [{ key: "provider", label: "Provider", type: "text", required: true }],
  },
  {
    id: "support",
    slug: "support",
    title: "Support",
    columns: [
      { id: "open", label: "Open" },
      { id: "in_progress", label: "In progress" },
      { id: "waiting", label: "Waiting" },
      { id: "resolved", label: "Resolved" },
      { id: "closed", label: "Closed" },
    ],
    initialStatus: "open",
    fields: [
      { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high"], required: true },
    ],
  },
  {
    id: "general",
    slug: "general",
    title: "General",
    columns: [
      { id: "todo", label: "To do" },
      { id: "in_progress", label: "In progress" },
      { id: "done", label: "Done" },
    ],
    initialStatus: "todo",
    fields: [],
  },
];

export function getBoardBySlug(slug: string): Board | undefined {
  return BOARDS.find((b) => b.slug === slug);
}

export function getBoardById(id: string): Board | undefined {
  return BOARDS.find((b) => b.id === id);
}

export function isColumn(board: Board, statusId: string): boolean {
  return board.columns.some((c) => c.id === statusId);
}
