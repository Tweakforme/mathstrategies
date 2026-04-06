export { auth as middleware } from "@/lib/auth";

export const config = {
  // Protect everything except login and NextAuth API routes
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
