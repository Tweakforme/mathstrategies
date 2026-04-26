import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUpcomingEvents, getFightCard } from "@/lib/queries";
import FightCardList from "@/components/FightCardList";
import { Calendar, MapPin, TrendingUp, Target, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const events = await getUpcomingEvents();

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-muted gap-3">
        <Calendar className="w-10 h-10 opacity-30" />
        <p className="text-sm">No upcoming events found.</p>
        <code className="text-xs bg-white/5 px-3 py-1.5 rounded-lg text-accent">
          python pipeline.py scrape-upcoming
        </code>
      </div>
    );
  }

  const eventCards = await Promise.all(
    events.map(async (event) => {
      const fights = await getFightCard(event.id);
      return { event, fights };
    })
  );

  return (
    <div className="space-y-12 animate-fade-in">
      {eventCards.map(({ event, fights }, idx) => {
        const hasPredictions = fights.some((f) => f.f1_win_prob !== null);
        const valueBets = fights.filter(f => f.is_value_bet && (f.value_edge ?? 0) > 0.05);
        const strongPicks = fights.filter(f => (f.confidence ?? 0) >= 0.70);

        const dateStr = new Date(event.date).toLocaleDateString("en-US", {
          weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
        });

        const daysUntil = Math.ceil(
          (new Date(event.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        const countdownLabel =
          daysUntil <= 0 ? "Fight Night" :
          daysUntil === 1 ? "Tomorrow" :
          `${daysUntil} days away`;

        return (
          <div key={event.id} className="space-y-6">
            {/* Event hero card */}
            <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-bg-2 p-6">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-electric/5 pointer-events-none" />

              <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    {idx === 0 ? <div className="live-dot" /> : <div className="w-1.5 h-1.5 rounded-full bg-muted/40" />}
                    <span className="text-xs text-muted font-medium">{countdownLabel}</span>
                  </div>

                  <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">
                    {event.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> {dateStr}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> {event.location}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 sm:flex-col sm:items-end">
                  <div className="stat-pill min-w-[70px]">
                    <span className="text-xl font-bold text-white">{fights.length}</span>
                    <span className="text-[10px] text-muted mt-0.5">Fights</span>
                  </div>
                </div>
              </div>

              {hasPredictions && (
                <div className="relative flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/50">
                  {valueBets.length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold/10 border border-gold/20 text-xs text-gold font-medium">
                      <TrendingUp className="w-3 h-3" />
                      {valueBets.length} value bet{valueBets.length > 1 ? "s" : ""}
                    </div>
                  )}
                  {strongPicks.length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-electric/10 border border-electric/20 text-xs text-electric font-medium">
                      <Target className="w-3 h-3" />
                      {strongPicks.length} strong pick{strongPicks.length > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              )}

              {!hasPredictions && (
                <div className="relative flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/50">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400">
                    <Zap className="w-3 h-3" />
                    Run predictions to see model picks
                  </div>
                </div>
              )}
            </div>

            {/* Section header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Fight Card</h2>
              <span className="text-xs text-muted">{fights.length} bouts · sorted by value</span>
            </div>

            {/* Fight list */}
            {fights.length === 0 ? (
              <div className="text-center py-16 text-muted text-sm">
                No fights found for this event.
              </div>
            ) : (
              <FightCardList fights={fights} bankroll={1000} />
            )}
          </div>
        );
      })}
    </div>
  );
}
