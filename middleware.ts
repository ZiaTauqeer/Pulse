import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Protects everything except the marketing/legal pages, login, and
// Auth.js's own API routes. Add a new public route here explicitly rather
// than defaulting new routes to public.
const PUBLIC_PATHS = ["/login", "/signup", "/legal", "/api/auth"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  // Skip static assets and Next internals; everything else goes through
  // the check above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
