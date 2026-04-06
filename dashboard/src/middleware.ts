import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
  const isStatic = req.nextUrl.pathname.startsWith("/_next") || req.nextUrl.pathname === "/favicon.ico";

  if (isStatic || isAuthRoute) return NextResponse.next();
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
