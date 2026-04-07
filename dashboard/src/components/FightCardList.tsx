"use client";

import Link from "next/link";
import { FightCard } from "@/lib/queries";
import { TrendingUp, AlertTriangle, ChevronRight, Shield, Zap, Star, Target } from "lucide-react";
import clsx from "clsx";

interface Props {
  fights: FightCard[];
  bankroll: number;
}

export default function FightCardList({ fights, bankroll }: Props) {
  const sorted = [...fights].sort((a, b) => {
    const aVal = a.is_value_bet && (a.value_edge ?? 0) > 0.05 ? 1 : 0;
    const bVal = b.is_value_bet && (b.value_edge ?? 0) > 0.05 ? 1 : 0;
    if (bVal !== aVal) return bVal - aVal;
    if (b.is_main_event !== a.is_main_event) return Number(b.is_main_event) - Number(a.is_main_event);
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });

  let valueBetCount = 0;

  return (
    <div className="space-y-2.5">
      {sorted.map((fight) => {
        const isValue = fight.is_value_bet === true && (fight.value_edge ?? 0) > 0.05 && valueBetCount < 4;
        if (isValue) valueBetCount++;

        const hasPred = fight.f1_win_prob !== null;
        const conf = fight.confidence ?? 0;
        const skip = hasPred && conf < 0.55;
        const strong = hasPred && conf >= 0.70;

        const f1Fav = hasPred ? fight.f1_win_prob! >= fight.f2_win_prob! : null;
        const favName = f1Fav == null ? null : f1Fav ? fight.fighter1_name : fight.fighter2_name;
        const favProb = f1Fav == null ? null : f1Fav ? fight.f1_win_prob! : fight.f2_win_prob!;

        const f1Ufc = (fight.f1_wins ?? 0) + (fight.f1_losses ?? 0);
        const f2Ufc = (fight.f2_wins ?? 0) + (fight.f2_losses ?? 0);
        const hasProspect = f1Ufc < 3 || f2Ufc < 3;

        const betSize = isValue && fight.kelly_pct
          ? Math.round((fight.kelly_pct / 100) * bankroll)
          : null;

        const f1Initial = fight.fighter1_name.split(" ").map(w => w[0]).join("").slice(0,2);
        const f2Initial = fight.fighter2_name.split(" ").map(w => w[0]).join("").slice(0,2);

        return (
          <Link
            href={`/fight/${fight.id}`}
            key={fight.id}
            className={clsx(
              "block rounded-xl border transition-all duration-200 hover:-translate-y-px group",
              "bg-gradient-to-br",
              isValue
                ? "from-gold/5 to-card border-gold/30 hover:border-gold/50 shadow-gold-glow"
                : fight.is_main_event
                ? "from-accent/5 to-card border-accent/25 hover:border-accent/40"
                : "from-card to-card-2 border-border hover:border-border-2 hover:shadow-card-hover"
            )}
          >
            <div className="p-4">
              {/* Top row: badges + confidence */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {fight.is_main_event && (
                    <span className="badge-accent text-xs">Main Event</span>
                  )}
                  {fight.is_title_fight && (
                    <span className="badge-gold flex items-center gap-1">
                      <Star className="w-2.5 h-2.5" /> Title
                    </span>
                  )}
                  <span className="badge-muted text-xs">{fight.weight_class}</span>
                  {isValue && (
                    <span className="badge-gold flex items-center gap-1">
                      <TrendingUp className="w-2.5 h-2.5" />
                      +{((fight.value_edge ?? 0) * 100).toFixed(0)}% edge
                    </span>
                  )}
                  {strong && !isValue && (
                    <span className="badge-electric flex items-center gap-1">
                      <Target className="w-2.5 h-2.5" /> Strong pick
                    </span>
                  )}
                  {hasProspect && (
                    <span className="badge-blue flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5" /> Prospect
                    </span>
                  )}
                  {skip && <span className="badge-muted text-xs">Skip</span>}
                </div>

                {/* Confidence bubble */}
                <div className="shrink-0 flex items-center gap-1.5">
                  {hasPred && favProb !== null ? (
                    <div className={clsx(
                      "w-12 h-12 rounded-xl flex flex-col items-center justify-center border text-center",
                      strong ? "bg-success/10 border-success/30 text-success" :
                      skip ? "bg-white/5 border-border text-muted" :
                      "bg-white/5 border-border text-white"
                    )}>
                      <span className="text-sm font-bold leading-none">{Math.round(conf * 100)}%</span>
                      <span className="text-[9px] text-muted mt-0.5">conf</span>
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-white/5 border border-border flex items-center justify-center">
                      <Shield className="w-4 h-4 text-muted" />
                    </div>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>

              {/* Fighter row */}
              <div className="flex items-center gap-3">
                {/* F1 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <div className={clsx(
                      "fighter-avatar text-xs",
                      f1Fav ? "border-white/20 text-white" : ""
                    )}>
                      {f1Initial}
                    </div>
                    <div className="min-w-0">
                      <p className={clsx(
                        "font-semibold text-sm truncate leading-tight",
                        f1Fav ? "text-white" : "text-muted"
                      )}>
                        {fight.fighter1_name}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {fight.f1_wins ?? 0}–{fight.f1_losses ?? 0}
                        {fight.f1_nationality && ` · ${fight.f1_nationality}`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* VS + prob bar */}
                <div className="shrink-0 text-center w-20">
                  {hasPred && fight.f1_win_prob !== null ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs font-bold">
                        <span className={clsx(f1Fav ? "text-white" : "text-muted")}>
                          {Math.round(fight.f1_win_prob! * 100)}%
                        </span>
                        <span className="text-muted text-[10px] mx-0.5">·</span>
                        <span className={clsx(!f1Fav ? "text-white" : "text-muted")}>
                          {Math.round(fight.f2_win_prob! * 100)}%
                        </span>
                      </div>
                      <div className="flex h-1 rounded-full overflow-hidden bg-white/10">
                        <div
                          className={clsx("h-full", f1Fav ? "bg-accent" : "bg-white/25")}
                          style={{ width: `${Math.round(fight.f1_win_prob! * 100)}%` }}
                        />
                        <div
                          className={clsx("h-full", !f1Fav ? "bg-accent" : "bg-white/25")}
                          style={{ width: `${Math.round(fight.f2_win_prob! * 100)}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">vs</span>
                  )}
                </div>

                {/* F2 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-row-reverse">
                    <div className={clsx(
                      "fighter-avatar text-xs",
                      !f1Fav && f1Fav !== null ? "border-white/20 text-white" : ""
                    )}>
                      {f2Initial}
                    </div>
                    <div className="min-w-0 text-right">
                      <p className={clsx(
                        "font-semibold text-sm truncate leading-tight",
                        !f1Fav && f1Fav !== null ? "text-white" : "text-muted"
                      )}>
                        {fight.fighter2_name}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {fight.f2_wins ?? 0}–{fight.f2_losses ?? 0}
                        {fight.f2_nationality && ` · ${fight.f2_nationality}`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom: bet suggestion + odds */}
              {(betSize || fight.best_f1_decimal || hasProspect) && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50 text-xs text-muted">
                  {betSize !== null && (
                    <span className="text-gold font-semibold flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Bet ${betSize} · {fight.value_fighter?.split(" ").at(-1)}
                    </span>
                  )}
                  {fight.best_f1_decimal && !betSize && (
                    <span>
                      {fight.fighter1_name.split(" ").at(-1)} <span className="text-white">{fight.best_f1_decimal.toFixed(2)}</span>
                      {" · "}
                      {fight.fighter2_name.split(" ").at(-1)} <span className="text-white">{fight.best_f2_decimal?.toFixed(2)}</span>
                    </span>
                  )}
                  {hasProspect && (
                    <span className="flex items-center gap-1 text-yellow-500 ml-auto">
                      <AlertTriangle className="w-3 h-3" /> Prospect
                    </span>
                  )}
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
