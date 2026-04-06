"use client";

import { useState } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";
import clsx from "clsx";

interface Props {
  fightId: string;
  eventId: string;
  f1Id: string;
  f1Name: string;
  f1Decimal: number | null;
  f2Id: string;
  f2Name: string;
  f2Decimal: number | null;
  // Kelly-suggested bet (from model)
  suggestedBet: number | null;
  suggestedFighter: string | null;
}

export default function PickButtons({
  fightId, eventId,
  f1Id, f1Name, f1Decimal,
  f2Id, f2Name, f2Decimal,
  suggestedBet, suggestedFighter,
}: Props) {
  const [picked, setPicked] = useState<"f1" | "f2" | null>(null);
  const [stake, setStake] = useState(suggestedBet?.toString() ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "saved" | "error" | "duplicate">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const selectedName = picked === "f1" ? f1Name : picked === "f2" ? f2Name : null;
  const selectedId   = picked === "f1" ? f1Id   : picked === "f2" ? f2Id   : null;
  const selectedOdds = picked === "f1" ? f1Decimal : picked === "f2" ? f2Decimal : null;
  const opponentName = picked === "f1" ? f2Name : picked === "f2" ? f1Name : null;

  // Recalculate P/L preview
  const stakeNum = parseFloat(stake) || 0;
  const potentialWin = selectedOdds && stakeNum
    ? ((selectedOdds - 1) * stakeNum).toFixed(2)
    : null;

  async function savePick() {
    if (!picked || !selectedName || !selectedOdds) return;
    setStatus("loading");

    const res = await fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fight_id: fightId,
        event_id: eventId,
        picked_fighter_id: selectedId,
        picked_fighter_name: selectedName,
        opponent_name: opponentName,
        odds_at_pick: selectedOdds,
        stake_amount: stakeNum || null,
      }),
    });

    if (res.status === 409) {
      setStatus("duplicate");
    } else if (res.ok) {
      setStatus("saved");
    } else {
      const data = await res.json();
      setErrorMsg(data.error ?? "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "saved") {
    return (
      <div className="card p-5 text-center space-y-2">
        <CheckCircle className="w-8 h-8 text-green-400 mx-auto" />
        <p className="font-semibold text-green-400">Pick saved!</p>
        <p className="text-sm text-muted">
          {selectedName} @ {selectedOdds?.toFixed(2)}{" "}
          {stakeNum > 0 && `· $${stakeNum} to win $${potentialWin}`}
        </p>
        <a href="/tracker" className="text-xs text-accent hover:underline">
          View in Tracker →
        </a>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <h3 className="font-semibold">Your Pick</h3>

      {suggestedFighter && suggestedBet && (
        <p className="text-xs text-green-400 bg-green-500/10 px-3 py-2 rounded">
          Model suggests: <strong>{suggestedFighter}</strong> · Kelly bet ${suggestedBet}
        </p>
      )}

      {/* Fighter buttons */}
      <div className="grid grid-cols-2 gap-3">
        <FighterBtn
          name={f1Name}
          decimal={f1Decimal}
          active={picked === "f1"}
          onClick={() => setPicked(picked === "f1" ? null : "f1")}
        />
        <FighterBtn
          name={f2Name}
          decimal={f2Decimal}
          active={picked === "f2"}
          onClick={() => setPicked(picked === "f2" ? null : "f2")}
        />
      </div>

      {/* Stake input */}
      {picked && (
        <div className="space-y-2">
          <label className="text-xs text-muted">Stake amount ($)</label>
          <input
            type="number"
            min="0"
            step="5"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="e.g. 50"
            className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
          {potentialWin && stakeNum > 0 && (
            <p className="text-xs text-green-400">
              Potential win: +${potentialWin} (total return ${(stakeNum + parseFloat(potentialWin)).toFixed(2)})
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {status === "duplicate" && (
        <div className="flex items-center gap-2 text-yellow-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          You already have a pick for this fight.
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      <button
        onClick={savePick}
        disabled={!picked || status === "loading"}
        className="btn-primary w-full py-3 disabled:opacity-40"
      >
        {status === "loading"
          ? "Saving…"
          : picked
          ? `Lock in ${picked === "f1" ? f1Name : f2Name}`
          : "Select a fighter"}
      </button>
    </div>
  );
}

function FighterBtn({
  name, decimal, active, onClick,
}: {
  name: string;
  decimal: number | null;
  active: boolean;
  onClick: () => void;
}) {
  const american = decimal && decimal >= 2
    ? `+${Math.round((decimal - 1) * 100)}`
    : decimal
    ? `${Math.round(-100 / (decimal - 1))}`
    : null;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-lg border-2 p-4 text-left transition-all",
        active
          ? "border-accent bg-accent/10 text-white"
          : "border-border bg-white/[0.02] text-muted hover:border-white/20 hover:text-white"
      )}
    >
      <p className="font-semibold text-sm leading-tight">{name}</p>
      {decimal && (
        <p className={clsx("text-xs mt-1", active ? "text-accent" : "text-muted")}>
          {decimal.toFixed(2)} ({american})
        </p>
      )}
    </button>
  );
}
