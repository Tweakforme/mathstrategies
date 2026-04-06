import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getNextEvent, getFightCard } from "@/lib/queries";
import FightCardList from "@/components/FightCardList";
import { Calendar, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const event = await getNextEvent();

  if (!event) {
    return (
      <div className="text-center py-24 text-muted">
        <Calendar className="w-10 h-10 mx-auto mb-3" />
        <p>No upcoming events found. Run <code className="text-accent">python pipeline.py scrape-upcoming</code> first.</p>
      </div>
    );
  }

  const fights = await getFightCard(event.id);
  const hasPredictions = fights.some((f) => f.f1_win_prob !== null);

  const eventDate = new Date(event.date);
  const dateStr = eventDate.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-6">
      {/* Event header */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{event.name}</h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {dateStr}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {event.location}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="badge bg-white/5 text-muted">
              {fights.length} fights
            </span>
            {!hasPredictions && (
              <span className="badge bg-yellow-500/10 text-yellow-400">
                Predictions pending
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Fight list */}
      {fights.length === 0 ? (
        <div className="text-center py-16 text-muted">
          No fights found for this event.
        </div>
      ) : (
        <FightCardList fights={fights} bankroll={1000} />
      )}
    </div>
  );
}
