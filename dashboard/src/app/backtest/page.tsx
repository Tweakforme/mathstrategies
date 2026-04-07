import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBacktestSummary, getBacktestFights } from "@/lib/backtest-queries";
import { CheckCircle, XCircle, Minus, TrendingUp, Brain } from "lucide-react";
import clsx from "clsx";

export const dynamic = "force-dynamic";

export default async function BacktestPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const events = await getBacktestSummary();

  // Fetch all fights for all events in parallel
  const allFights = await Promise.all(
    events.map((e) => getBacktestFights(e.event_id))
  );

  const totalFights = events.reduce((s, e) => s + Number(e.total), 0);
  const totalCorrect = events.reduce((s, e) => s + Number(e.correct), 0);
  const overallAcc = totalFights > 0 ? Math.round((totalCorrect / totalFights) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <a href="/" className="text-sm text-muted hover:text-white transition-colors">
          ← Back to Fight Card
        </a>
        <h1 className="text-2xl font-bold mt-2">Model Backtest</h1>
        <p className="text-muted text-sm mt-1">
          What would the model have picked on the last 5 fight cards — before knowing the results.
        </p>
      </div>

      {/* Overall summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-accent">{overallAcc}%</p>
          <p className="text-xs text-muted mt-1">Overall Accuracy</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold">{totalCorrect}/{totalFights}</p>
          <p className="text-xs text-muted mt-1">Fights Correct</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold">{events.length}</p>
          <p className="text-xs text-muted mt-1">Events Analysed</p>
        </div>
      </div>

      <div className="card p-4 bg-yellow-500/5 border-yellow-500/20 text-xs text-yellow-300">
        <Brain className="w-3.5 h-3.5 inline mr-1.5" />
        These predictions use <strong>current</strong> fighter stats, not historical stats at fight time.
        Treat this as a model quality indicator, not a precise backtest.
      </div>

      {/* Event breakdown */}
      {events.map((event, idx) => {
        const fights = allFights[idx];
        const acc = Number(event.accuracy);
        const correct = Number(event.correct);
        const total = Number(event.total);

        return (
          <div key={event.event_id} className="card p-5">
            {/* Event header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold">{event.event_name}</h2>
                <p className="text-xs text-muted mt-0.5">{event.event_date}</p>
              </div>
              <div className="text-right">
                <p className={clsx(
                  "text-xl font-bold",
                  acc >= 65 ? "text-green-400" : acc >= 50 ? "text-yellow-400" : "text-red-400"
                )}>
                  {acc}%
                </p>
                <p className="text-xs text-muted">{correct}/{total} correct</p>
              </div>
            </div>

            {/* Accuracy bar */}
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-4">
              <div
                className={clsx("h-full rounded-full", acc >= 65 ? "bg-green-400" : acc >= 50 ? "bg-yellow-400" : "bg-red-400")}
                style={{ width: `${acc}%` }}
              />
            </div>

            {/* Fight rows */}
            <div className="space-y-1">
              {fights.map((fight) => {
                const f1Favoured = fight.f1_win_prob > fight.f2_win_prob;
                const conf = Math.round(Math.max(fight.f1_win_prob, fight.f2_win_prob) * 100);

                return (
                  <a
                    key={fight.fight_id}
                    href={`/fight/${fight.fight_id}`}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.03] transition-colors group"
                  >
                    {/* Result icon */}
                    <span className="shrink-0 w-5">
                      {fight.was_correct === true ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : fight.was_correct === false ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <Minus className="w-4 h-4 text-muted" />
                      )}
                    </span>

                    {/* Fighters */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className={clsx("font-medium", f1Favoured ? "text-white" : "text-muted")}>
                          {fight.fighter1_name}
                        </span>
                        <span className="text-muted text-xs">vs</span>
                        <span className={clsx("font-medium", !f1Favoured ? "text-white" : "text-muted")}>
                          {fight.fighter2_name}
                        </span>
                        {fight.is_main_event && (
                          <span className="badge bg-accent/10 text-accent text-xs">ME</span>
                        )}
                        {fight.is_title_fight && (
                          <span className="badge bg-yellow-500/10 text-yellow-400 text-xs">Title</span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        <span className="text-accent">Model: {fight.predicted_winner}</span>
                        {fight.actual_winner && (
                          <span className={clsx("ml-2", fight.was_correct ? "text-green-400" : "text-red-400")}>
                            · Actual: {fight.actual_winner}
                            {fight.method && ` (${fight.method})`}
                          </span>
                        )}
                        {!fight.actual_winner && (
                          <span className="ml-2 text-muted">· No result recorded</span>
                        )}
                      </div>
                    </div>

                    {/* Confidence */}
                    <div className="text-right shrink-0">
                      <p className={clsx(
                        "text-sm font-semibold",
                        conf >= 70 ? "text-accent" : "text-muted"
                      )}>
                        {conf}%
                      </p>
                      <p className="text-xs text-muted">{fight.weight_class?.replace(" weight", "")}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
