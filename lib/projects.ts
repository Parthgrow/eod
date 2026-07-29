// A project is a normalized entity (its own table) that tickets reference by id.
// Shared type — no server-only, so the client board can render project names.

export type Project = {
  id: string;
  orgId: string;
  name: string;
  createdAt: number;
  createdBy?: string; // userId
};
