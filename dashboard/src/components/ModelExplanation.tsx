"use client";

import clsx from "clsx";
import { TrendingUp, TrendingDown, Minus, Brain } from "lucide-react";

interface Fighter {
  wins: number;
  losses: number;
  slpm: number;
  str_acc: number;
  sapm: number;
  str_def: number;
  td_avg: number;
  td_acc: number;
  td_def: number;
  sub_avg: number;
  wins_by_ko: number;
  wins_by_sub: number;
  wins_by_dec: number;
  reach_cm?: number;
  height_cm?: number;
}

interface Props {
  f1Name: string;
  f2Name: string;
  f1: Fighter;
  f2: Fighter;
  f1Prob: number;
  f2Prob: number;
}

function pct(n: number | null | undefined, total: number): number {
  if (!n || !total) return 0;
  return Math.round((n / total) * 100);
}

function diff(a: number, b: number): number {
  return Number((a - b).toFixed(2));
}

export default function ModelExplanation({ f1Name, f2Name, f1, f2, f1Prob, f2Prob }: Props) {
  const pickedName = f1Prob >= f2Prob ? f1Name : f2Name;
  const picked = f1Prob >= f2Prob ? f1 : f2;
  const other = f1Prob >= f2Prob ? f2 : f1;
  const otherName = f1Prob >= f2Prob ? f2Name : f1Name;
  const pickedProb = Math.max(f1Prob, f2Prob);

  const hasStats = picked.slpm > 0 || other.slpm > 0;

  const pickedWins = picked.wins;
  const otherWins = other.wins;
  const pickedTotal = picked.wins + picked.losses;
  const otherTotal = other.wins + other.losses;
  const pickedFinishRate = pickedTotal > 0
    ? Math.round(((picked.wins_by_ko + picked.wins_by_sub) / pickedTotal) * 100)
    : 0;
  const otherFinishRate = otherTotal > 0
    ? Math.round(((other.wins_by_ko + other.wins_by_sub) / otherTotal) * 100)
    : 0;

  // Build factor list
  const factors: { label: string; detail: string; positive: boolean | null }[] = [];

  // Record
  const pickedRecord = `${picked.wins}-${picked.losses}`;
  const otherRecord = `${other.wins}-${other.losses}`;
  const pickedWinPct = pickedTotal > 0 ? picked.wins / pickedTotal : 0;
  const otherWinPct = otherTotal > 0 ? other.wins / otherTotal : 0;
  if (pickedWinPct > otherWinPct + 0.05) {
    factors.push({
      label: "Stronger record",
      detail: `${pickedRecord} vs ${otherRecord} — ${Math.round(pickedWinPct * 100)}% win rate`,
      positive: true,
    });
  } else if (otherWinPct > pickedWinPct + 0.05) {
    factors.push({
      label: "Record gap",
      detail: `${pickedRecord} vs ${otherRecord} — opponent has stronger record`,
      positive: false,
    });
  } else {
    factors.push({
      label: "Similar records",
      detail: `${pickedRecord} vs ${otherRecord} — model looks deeper at style`,
      positive: null,
    });
  }

  if (hasStats) {
    // Striking volume
    const slpmDiff = diff(picked.slpm, other.slpm);
    if (Math.abs(slpmDiff) > 0.5) {
      factors.push({
        label: slpmDiff > 0 ? "Striking volume edge" : "Striking volume deficit",
        detail: `${picked.slpm.toFixed(1)} vs ${other.slpm.toFixed(1)} strikes/min`,
        positive: slpmDiff > 0,
      });
    }

    // Striking accuracy
    const accDiff = diff(picked.str_acc, other.str_acc);
    if (Math.abs(accDiff) > 0.03) {
      factors.push({
        label: accDiff > 0 ? "Higher striking accuracy" : "Lower striking accuracy",
        detail: `${Math.round(picked.str_acc * 100)}% vs ${Math.round(other.str_acc * 100)}%`,
        positive: accDiff > 0,
      });
    }

    // Defence
    const defDiff = diff(picked.str_def, other.str_def);
    if (Math.abs(defDiff) > 0.04) {
      factors.push({
        label: defDiff > 0 ? "Better striking defence" : "Weaker striking defence",
        detail: `${Math.round(picked.str_def * 100)}% defence vs ${Math.round(other.str_def * 100)}%`,
        positive: defDiff > 0,
      });
    }

    // Grappling
    const tdDiff = diff(picked.td_avg, other.td_avg);
    if (Math.abs(tdDiff) > 0.5) {
      factors.push({
        label: tdDiff > 0 ? "Grappling volume edge" : "Grappling deficit",
        detail: `${picked.td_avg.toFixed(1)} vs ${other.td_avg.toFixed(1)} takedowns/15min`,
        positive: tdDiff > 0,
      });
    }

    // Submission threat
    if (picked.sub_avg > 0.8 && picked.sub_avg > other.sub_avg * 1.5) {
      factors.push({
        label: "Submission threat",
        detail: `${picked.sub_avg.toFixed(1)} submission attempts/15min`,
        positive: true,
      });
    }

    // Damage absorption
    const sapmDiff = diff(picked.sapm, other.sapm);
    if (Math.abs(sapmDiff) > 0.8) {
      factors.push({
        label: sapmDiff < 0 ? "Absorbs less damage" : "Takes more shots",
        detail: `${picked.sapm.toFixed(1)} vs ${other.sapm.toFixed(1)} strikes absorbed/min`,
        positive: sapmDiff < 0,
      });
    }

    // Reach
    if (picked.reach_cm && other.reach_cm && Math.abs(picked.reach_cm - other.reach_cm) >= 5) {
      const reachDiff = picked.reach_cm - other.reach_cm;
      factors.push({
        label: reachDiff > 0 ? "Reach advantage" : "Reach disadvantage",
        detail: `${picked.reach_cm}cm vs ${other.reach_cm}cm`,
        positive: reachDiff > 0,
      });
    }
  }

  // Finish rate
  if (pickedFinishRate > 0 || otherFinishRate > 0) {
    if (pickedFinishRate > otherFinishRate + 15) {
      factors.push({
        label: "Higher finish rate",
        detail: `${pickedFinishRate}% vs ${otherFinishRate}% finish rate in UFC`,
        positive: true,
      });
    }
  }

  const topFactors = factors.slice(0, 5);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-4 h-4 text-accent" />
        <h3 className="font-semibold">Why the model picks {pickedName.split(" ").at(-1)}</h3>
        <span className="ml-auto badge bg-accent/10 text-accent">{Math.round(pickedProb * 100)}% confidence</span>
      </div>

      {!hasStats && (
        <p className="text-xs text-muted mb-3 bg-yellow-500/5 border border-yellow-500/20 rounded p-2">
          Full stat analysis loads after fighter data is synced. Re-run predictions after scrape-fighters completes.
        </p>
      )}

      <div className="space-y-3">
        {topFactors.map((f, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className={clsx(
              "mt-0.5 shrink-0",
              f.positive === true ? "text-green-400" :
              f.positive === false ? "text-red-400" : "text-muted"
            )}>
              {f.positive === true ? <TrendingUp className="w-4 h-4" /> :
               f.positive === false ? <TrendingDown className="w-4 h-4" /> :
               <Minus className="w-4 h-4" />}
            </span>
            <div>
              <p className={clsx(
                "text-sm font-medium",
                f.positive === true ? "text-green-300" :
                f.positive === false ? "text-red-300" : "text-white"
              )}>{f.label}</p>
              <p className="text-xs text-muted mt-0.5">{f.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted mt-4 pt-3 border-t border-border">
        Model uses {hasStats ? "23 fighter stats" : "win/loss records (stats syncing)"} + historical fight patterns. Not financial advice.
      </p>
    </div>
  );
}
