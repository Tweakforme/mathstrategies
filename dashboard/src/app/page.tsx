import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Calendar } from "lucide-react";

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Calendar className="w-12 h-12 text-accent mb-4" />
      <h1 className="text-2xl font-bold mb-2">Fight Card</h1>
      <p className="text-muted">Loading upcoming event…</p>
    </div>
  );
}
