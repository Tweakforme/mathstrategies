import type { Metadata } from "next";
import "./globals.css";
import { auth } from "@/lib/auth";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "UFC Predictions",
  description: "UFC fight card predictions and betting tracker",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-white">
        {session && <Nav user={session.user} />}
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
