import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/session";

// For Server Components / pages: redirects to /login unless there's a valid,
// org-resolved session. A pre-organizations session cookie (no orgId) is
// treated as invalid, so the user re-logs in and gets an orgId — no migration.
export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await getSession();
  if (!session?.orgId) {
    redirect("/login");
  }
  return session;
});

// For Route Handlers: returns the session ({ userId, email, orgId }) or a 401
// Response. Callers check `if (session instanceof Response) return session;`.
// orgId comes only from here — never from the request — which is what keeps a
// user scoped to their own workspace.
export async function requireSession(): Promise<SessionPayload | Response> {
  const session = await getSession();
  if (!session?.orgId) {
    return new Response(null, { status: 401 });
  }
  return session;
}
