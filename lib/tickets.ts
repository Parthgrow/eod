// A ticket is the atomic unit of work. One flat type across all boards; each
// board-specific field is an optional typed column, and each board's def
// (lib/boards.ts) declares which of them it uses.

export type TicketFieldKey = "provider" | "priority";

export type Ticket = {
  id: string;
  boardId: string;
  title: string;
  status: string; // one of the board's column ids
  createdAt: number;
  updatedAt: number;
  // board-specific fields — all optional; each board uses a subset:
  provider?: string;
  priority?: string;
};

export type FieldSpec = {
  key: TicketFieldKey;
  label: string;
  type: "text" | "select";
  required?: boolean;
  options?: readonly string[]; // for select
};
