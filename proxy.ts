import { NextRequest, NextResponse } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/session";

const publicRoutes = ["/login", "/signup"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublicRoute = publicRoutes.includes(path);

  // Optimistic check only — verifies the cookie is present, signed correctly,
  // and carries an org. No KV lookup here; real authorization happens in the DAL.
  // Keying on orgId (not just userId) keeps this in lockstep with verifySession,
  // so a pre-organizations cookie reads as logged-out instead of looping.
  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value);

  if (!isPublicRoute && !session?.orgId) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isPublicRoute && session?.orgId) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$|.*\\.ico$).*)"],
};
