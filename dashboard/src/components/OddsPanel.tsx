"use client";

import { OddsRow, BookmakerLine } from "@/lib/queries";
import clsx from "clsx";

const BOOKMAKER_LABELS: Record<string, string> = {
  draftkings:     "DraftKings",
  fanduel:        "FanDuel",
  betmgm:         "BetMGM",
  pinnacle:       "Pinnacle",
  betonlineag:    "BetOnline",
  bovada:         "Bovada",
  betrivers:      "BetRivers",
  williamhill:    "William Hill",
  unibet:         "Unibet",
  unibet_uk:      "Unibet UK",
  unibet_se:      "Unibet SE",
  paddy_power:    "Paddy Power",
  paddypower:     "Paddy Power",
  bet365:         "Bet365",
  betfair_ex_uk:  "Betfair Exchange",
  betfair_ex_eu:  "Betfair Exchange",
  betfair_ex_au:  "Betfair Exchange",
  betfair_sb_uk:  "Betfair SB",
  betsson:        "Betsson",
  nordicbet:      "NordicBet",
  leovegas:       "LeoVegas",
  sportsbet:      "Sportsbet AU",
  hardrockbet:    "Hard Rock Bet",
  betparx:        "BetParx",
  ballybet:       "Bally Bet",
  coolbet:        "Coolbet",
  onexbet:        "1xBet",
  marathonbet:    "Marathonbet",
};

// Preferred display order
const PRIORITY = [
  "pinnacle", "draftkings", "fanduel", "betmgm", "betonlineag",
  "bovada", "betrivers", "williamhill", "unibet", "hardrockbet",
];

function formatDecimal(dec: number | null): string {
  if (!dec) return "—";
  return dec.toFixed(2);
}

function toAmerican(dec: number | null): string {
  if (!dec) return "—";
  return dec >= 2
    ? `+${Math.round((dec - 1) * 100)}`
    : `${Math.round(-100 / (dec - 1))}`;
}

interface Props {
  odds: OddsRow;
  f1Name: string;
  f2Name: string;
  f1Prob: number | null;
  f2Prob: number | null;
}

export default function OddsPanel({ odds, f1Name, f2Name, f1Prob, f2Prob }: Props) {
  const bookmakers: BookmakerLine[] = Array.isArray(odds.bookmakers)
    ? odds.bookmakers
    : [];

  // Sort: priority books first, then alphabetical
  const sorted = [...bookmakers].sort((a, b) => {
    const ai = PRIORITY.indexOf(a.bookmaker);
    const bi = PRIORITY.indexOf(b.bookmaker);
    if (ai === -1 && bi === -1) return a.bookmaker.localeCompare(b.bookmaker);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const f1Best = odds.best_f1_decimal;
  const f2Best = odds.best_f2_decimal;

  // Implied probs from consensus (vig removed)
  const rawF1 = odds.consensus_f1_decimal ? 1 / odds.consensus_f1_decimal : null;
  const rawF2 = odds.consensus_f2_decimal ? 1 / odds.consensus_f2_decimal : null;
  const total = (rawF1 ?? 0) + (rawF2 ?? 0);
  const fairF1 = rawF1 && total > 0 ? rawF1 / total : null;
  const fairF2 = rawF2 && total > 0 ? rawF2 / total : null;

  return (
    <div className="card p-5">
      <h3 className="font-semibold mb-1">Odds Comparison</h3>
      <p className="text-xs text-muted mb-4">
        Live odds · {bookmakers.length} bookmakers · Best highlighted green
      </p>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4 mb-4 text-center">
        <div className="bg-white/5 rounded-lg p-3">
          <p className="text-xs text-muted mb-1">{f1Name.split(" ").at(-1)} Best</p>
          <p className="text-xl font-bold text-green-400">{formatDecimal(f1Best)}</p>
          <p className="text-xs text-muted">{toAmerican(f1Best)}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <p className="text-xs text-muted mb-1">Market Implied</p>
          {fairF1 && fairF2 ? (
            <>
              <p className="text-sm font-semibold">
                {Math.round(fairF1 * 100)}% / {Math.round(fairF2 * 100)}%
              </p>
              {f1Prob !== null && f2Prob !== null && (
                <p className="text-xs text-muted mt-1">
                  Model: {Math.round(f1Prob * 100)}% / {Math.round(f2Prob * 100)}%
                </p>
              )}
            </>
          ) : (
            <p className="text-muted text-sm">—</p>
          )}
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <p className="text-xs text-muted mb-1">{f2Name.split(" ").at(-1)} Best</p>
          <p className="text-xl font-bold text-green-400">{formatDecimal(f2Best)}</p>
          <p className="text-xs text-muted">{toAmerican(f2Best)}</p>
        </div>
      </div>

      {/* Value edge indicators */}
      {f1Prob !== null && fairF1 !== null && (
        <div className="flex gap-3 mb-4 text-xs">
          <EdgeBadge name={f1Name.split(" ").at(-1)!} modelProb={f1Prob} marketProb={fairF1} />
          <EdgeBadge name={f2Name.split(" ").at(-1)!} modelProb={f2Prob!} marketProb={fairF2!} />
        </div>
      )}

      {/* Bookmaker table */}
      {sorted.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-border">
                <th className="text-left py-2 pr-4">Bookmaker</th>
                <th className="text-center py-2 px-2">{f1Name.split(" ").at(-1)}</th>
                <th className="text-center py-2 pl-2">{f2Name.split(" ").at(-1)}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 15).map((bk) => {
                const isF1Best = bk.f1_decimal !== null && Math.abs(bk.f1_decimal - f1Best) < 0.01;
                const isF2Best = bk.f2_decimal !== null && Math.abs(bk.f2_decimal - f2Best) < 0.01;
                const label = BOOKMAKER_LABELS[bk.bookmaker] ?? bk.bookmaker;
                return (
                  <tr key={bk.bookmaker} className="border-b border-border/50 hover:bg-white/[0.02]">
                    <td className="py-2 pr-4 text-muted">{label}</td>
                    <td className={clsx("text-center py-2 px-2 font-medium", isF1Best ? "text-green-400" : "text-white")}>
                      {formatDecimal(bk.f1_decimal)}
                      <span className="text-muted text-xs ml-1">({toAmerican(bk.f1_decimal)})</span>
                    </td>
                    <td className={clsx("text-center py-2 pl-2 font-medium", isF2Best ? "text-green-400" : "text-white")}>
                      {formatDecimal(bk.f2_decimal)}
                      <span className="text-muted text-xs ml-1">({toAmerican(bk.f2_decimal)})</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sorted.length > 15 && (
            <p className="text-xs text-muted mt-2">
              +{sorted.length - 15} more bookmakers available
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function EdgeBadge({
  name, modelProb, marketProb,
}: { name: string; modelProb: number; marketProb: number }) {
  const edge = modelProb - marketProb;
  const edgePct = Math.round(edge * 100);
  const isPositive = edge > 0.03;
  const isNegative = edge < -0.03;

  return (
    <span className={clsx(
      "badge",
      isPositive ? "bg-green-500/10 text-green-400" :
      isNegative ? "bg-red-500/10 text-red-400" :
      "bg-white/5 text-muted"
    )}>
      {name}: {edgePct > 0 ? "+" : ""}{edgePct}% vs market
    </span>
  );
}
