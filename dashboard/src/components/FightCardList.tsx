"use client";

import Link from "next/link";
import { FightCard } from "@/lib/queries";
import { TrendingUp, AlertTriangle, ChevronRight, Shield, Zap } from "lucide-react";
import clsx from "clsx";

interface Props {
  fights: FightCard[];
  bankroll: number;
}

export default function FightCardList({ fights, bankroll }: Props) {
  // Sort: value bets first, then main event, then confidence desc
  const sorted = [...fights].sort((a, b) => {
    const aValue = a.is_value_bet && (a.value_edge ?? 0) > 0.05 ? 1 : 0;
    const bValue = b.is_value_bet && (b.value_edge ?? 0) > 0.05 ? 1 : 0;
    if (bValue !== aValue) return bValue - aValue;
    if (b.is_main_event !== a.is_main_event) return Number(b.is_main_event) - Number(a.is_main_event);
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });

  // Max 4 value bets highlighted
  let valueBetCount = 0;

  return (
    <div className="space-y-3">
      {sorted.map((fight) => {
        const isValue =
          fight.is_value_bet === true &&
          (fight.value_edge ?? 0) > 0.05 &&
          valueBetCount < 4;
        if (isValue) valueBetCount++;

        const hasPred = fight.f1_win_prob !== null;
        const conf = fight.confidence ?? 0;
        const skip = hasPred && conf < 0.55;

        const favoured = hasPred
          ? fight.f1_win_prob! > fight.f2_win_prob!
            ? { name: fight.fighter1_name, prob: fight.f1_win_prob! }
            : { name: fight.fighter2_name, prob: fight.f2_win_prob! }
          : null;

        const betSize =
          isValue && fight.kelly_pct
            ? Math.round((fight.kelly_pct / 100) * bankroll)
            : null;

        const f1Ufc = (fight.f1_wins ?? 0) + (fight.f1_losses ?? 0);
        const f2Ufc = (fight.f2_wins ?? 0) + (fight.f2_losses ?? 0);
        const isProspect = f1Ufc < 3 || f2Ufc < 3;

        return (
          <Link
            href={`/fight/${fight.id}`}
            key={fight.id}
            className={clsx(
              "card block p-4 hover:border-white/20 transition-all group",
              isValue && "border-accent/40 bg-accent/5"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              {/* Left: fighters */}
              <div className="flex-1 min-w-0">
                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {fight.is_main_event && (
                    <span className="badge bg-accent/10 text-accent">Main Event</span>
                  )}
                  {fight.is_title_fight && (
                    <span className="badge bg-yellow-500/10 text-yellow-400">Title Fight</span>
                  )}
                  <span className="badge bg-white/5 text-muted">{fight.weight_class}</span>
                  {isProspect && (
                    <span className="badge bg-blue-500/10 text-blue-400 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Prospect
                    </span>
                  )}
                  {isValue && (
                    <span className="badge bg-green-500/10 text-green-400 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Value +{((fight.value_edge ?? 0) * 100).toFixed(1)}%
                    </span>
                  )}
                  {skip && (
                    <span className="badge bg-white/5 text-muted">SKIP</span>
                  )}
                </div>

                {/* Fighter names */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <FighterName
                      name={fight.fighter1_name}
                      record={`${fight.f1_wins}-${fight.f1_losses}`}
                      prob={fight.f1_win_prob}
                      favoured={favoured?.name === fight.fighter1_name}
                    />
                  </div>
                  <span className="text-muted text-sm font-bold shrink-0">vs</span>
                  <div className="flex-1 text-right">
                    <FighterName
                      name={fight.fighter2_name}
                      record={`${fight.f2_wins}-${fight.f2_losses}`}
                      prob={fight.f2_win_prob}
                      favoured={favoured?.name === fight.fighter2_name}
                      align="right"
                    />
                  </div>
                </div>

                {/* Confidence bar */}
                {hasPred && favoured && (
                  <div className="mt-3">
                    <ConfidenceBar
                      f1Name={fight.fighter1_name}
                      f2Name={fight.fighter2_name}
                      f1Prob={fight.f1_win_prob!}
                      f2Prob={fight.f2_win_prob!}
                    />
                  </div>
                )}

                {/* Bet size + odds */}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                  {betSize !== null && (
                    <span className="text-green-400 font-semibold">
                      Bet ${betSize} on {fight.value_fighter}
                    </span>
                  )}
                  {fight.best_f1_decimal && (
                    <span>
                      {fight.fighter1_name.split(" ").at(-1)} {fight.best_f1_decimal.toFixed(2)}
                      {" · "}
                      {fight.fighter2_name.split(" ").at(-1)} {fight.best_f2_decimal?.toFixed(2)}
                    </span>
                  )}
                  {isProspect && (
                    <span className="flex items-center gap-0.5 text-yellow-500">
                      <AlertTriangle className="w-3 h-3" /> Prospect alert — check pre-UFC record
                    </span>
                  )}
                </div>
              </div>

              {/* Right: confidence % */}
              <div className="shrink-0 flex flex-col items-center justify-center w-14 text-center">
                {hasPred ? (
                  <>
                    <span className={clsx(
                      "text-xl font-bold",
                      skip ? "text-muted" : conf >= 0.65 ? "text-green-400" : "text-white"
                    )}>
                      {Math.round(conf * 100)}%
                    </span>
                    <span className="text-xs text-muted">conf</span>
                  </>
                ) : (
                  <Shield className="w-6 h-6 text-muted" />
                )}
                <ChevronRight className="w-4 h-4 text-muted mt-1 group-hover:text-white transition-colors" />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function FighterName({
  name, record, prob, favoured, align = "left",
}: {
  name: string;
  record: string;
  prob: number | null;
  favoured: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className={clsx(align === "right" && "flex flex-col items-end")}>
      <p className={clsx(
        "font-semibold text-sm leading-tight",
        favoured ? "text-white" : "text-muted"
      )}>
        {name}
      </p>
      <p className="text-xs text-muted mt-0.5">{record}</p>
    </div>
  );
}

function ConfidenceBar({
  f1Name, f2Name, f1Prob, f2Prob,
}: {
  f1Name: string; f2Name: string; f1Prob: number; f2Prob: number;
}) {
  const f1Pct = Math.round(f1Prob * 100);
  const f2Pct = Math.round(f2Prob * 100);
  const f1Favoured = f1Prob >= f2Prob;

  return (
    <div className="space-y-1">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5">
        <div
          className={clsx("h-full rounded-l-full transition-all",
            f1Favoured ? "bg-accent" : "bg-white/20"
          )}
          style={{ width: `${f1Pct}%` }}
        />
        <div
          className={clsx("h-full rounded-r-full transition-all",
            !f1Favoured ? "bg-accent" : "bg-white/20"
          )}
          style={{ width: `${f2Pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span className={f1Favoured ? "text-white" : ""}>{f1Pct}%</span>
        <span className={!f1Favoured ? "text-white" : ""}>{f2Pct}%</span>
      </div>
    </div>
  );
}
