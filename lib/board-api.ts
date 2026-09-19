import "server-only";
import { requireSession } from "@/lib/dal";
import { getBoardBySlug, type Board } from "@/lib/boards";
import type { StoreError } from "@/lib/tickets-store";

type Session = Exclude<Awaited<ReturnType<typeof requireSession>>, Response>;

// Shared preamble for the ticket sub-resource routes: an authed session plus the
// board named in the URL, or the Response to return instead.
export async function boardContext(
  slug: string
): Promise<{ session: Session; board: Board } | Response> {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const board = getBoardBySlug(slug);
  if (!board) return Response.json({ error: "Unknown board." }, { status: 404 });

  return { session, board };
}

export function storeError(result: StoreError): Response {
  return Response.json({ error: result.error }, { status: result.status ?? 400 });
}

export function notFound(what: string): Response {
  return Response.json({ error: `${what} not found.` }, { status: 404 });
}

// A malformed JSON body is the caller's mistake, not a 500.
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
