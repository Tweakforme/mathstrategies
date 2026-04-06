"use client";

import clsx from "clsx";
import { Target, Clock, Zap, Shield } from "lucide-react";

interface Fighter {
  wins: number;
  losses: number;
  wins_by_ko: number;
  wins_by_sub: number;
  wins_by_dec: number;
  slpm: number;
  sapm: number;
  str_def: number;
  td_avg: number;
  sub_avg: number;
}

interface Props {
  f1Name: string;
  f2Name: string;
  f1: Fighter;
  f2: Fighter;
  f1Prob: number;
  f2Prob: number;
  weightClass: string;
  isTitleFight: boolean;
}

function safeDiv(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

export default function BettingAngles({ f1Name, f2Name, f1, f2, f1Prob, f2Prob, weightClass, isTitleFight }: Props) {
  const f1Total = f1.wins + f1.losses;
  const f2Total = f2.wins + f2.losses;

  const f1KoPct  = safeDiv(f1.wins_by_ko,  f1Total);
  const f1SubPct = safeDiv(f1.wins_by_sub, f1Total);
  const f1DecPct = safeDiv(f1.wins_by_dec, f1Total);
  const f2KoPct  = safeDiv(f2.wins_by_ko,  f2Total);
  const f2SubPct = safeDiv(f2.wins_by_sub, f2Total);
  const f2DecPct = safeDiv(f2.wins_by_dec, f2Total);

  const hasFinishData = f1.wins_by_ko + f1.wins_by_sub + f1.wins_by_dec + f2.wins_by_ko + f2.wins_by_sub + f2.wins_by_dec > 0;

  // Combined finish probability (average of both fighters' tendencies)
  const koProb  = (f1KoPct + f2KoPct) / 2;
  const subProb = (f1SubPct + f2SubPct) / 2;
  const decProb = 1 - koProb - subProb;

  // Over/Under 2.5 round estimate
  // Fights going to decision → likely over 2.5
  // Title fights are 5 rounds — use 4.5 rounds threshold instead
  const isChampionship = isTitleFight || weightClass?.toLowerCase().includes("women");
  const overThreshold = isChampionship ? 0.5 : 0.5; // 50% = coin flip at 2.5

  // High finish rate = under more likely
  const totalFinishRate = hasFinishData ? (koProb + subProb) : (
    // Fallback: use slpm and str_def as proxy if no finish data
    (f1.slpm + f2.slpm) > 8 ? 0.55 : 0.40
  );

  const underProb = Math.min(0.85, Math.max(0.15, totalFinishRate));
  const overProb  = 1 - underProb;

  const roundLine = isChampionship ? "4.5 rounds" : "2.5 rounds";

  // Dominant method
  const dominantMethod =
    koProb >= subProb && koProb >= decProb * 0.6 && hasFinishData ? "KO/TKO"
    : subProb >= koProb && subProb >= decProb * 0.6 && hasFinishData ? "Submission"
    : "Decision";

  // Per-fighter finish breakdown
  const f1FinishRate = hasFinishData ? Math.round((f1KoPct + f1SubPct) * 100) : null;
  const f2FinishRate = hasFinishData ? Math.round((f2KoPct + f2SubPct) * 100) : null;

  // Style tags
  const tags: string[] = [];
  if (f1.sub_avg > 1.0 || f2.sub_avg > 1.0) tags.push("Submission danger");
  if ((f1.slpm + f2.slpm) > 9 && hasFinishData) tags.push("High pace striker");
  if (f1.td_avg > 3 || f2.td_avg > 3) tags.push("Heavy grappler");
  if (f1.str_def > 0.65 && f2.str_def > 0.65 && hasFinishData) tags.push("Both defensively solid");

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-accent" />
        <h3 className="font-semibold">Betting Angles</h3>
      </div>

      {!hasFinishData && (
        <p className="text-xs text-muted mb-3 bg-yellow-500/5 border border-yellow-500/20 rounded p-2">
          Method breakdowns will show after fighter stats sync. Estimates below use striking stats as proxy.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Over/Under */}
        <div className="bg-white/5 rounded-lg p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Clock className="w-3.5 h-3.5 text-muted" />
            <span className="text-xs text-muted font-medium uppercase tracking-wide">Over/Under {roundLine}</span>
          </div>
          <div className="space-y-2">
            <AngleBar label={`Over ${roundLine}`} prob={overProb} color="text-blue-400" barColor="bg-blue-400" />
            <AngleBar label={`Under ${roundLine}`} prob={underProb} color="text-orange-400" barColor="bg-orange-400" />
          </div>
          <p className="text-xs text-muted mt-2">
            {underProb > 0.60
              ? "High finish rate — favour Under"
              : overProb > 0.60
              ? "Both fighters durable — favour Over"
              : "Coin flip — avoid unless getting edge"}
          </p>
        </div>

        {/* Method */}
        <div className="bg-white/5 rounded-lg p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Zap className="w-3.5 h-3.5 text-muted" />
            <span className="text-xs text-muted font-medium uppercase tracking-wide">Method</span>
          </div>
          {hasFinishData ? (
            <div className="space-y-2">
              <AngleBar label="KO/TKO" prob={koProb} color="text-red-400" barColor="bg-red-400" />
              <AngleBar label="Submission" prob={subProb} color="text-purple-400" barColor="bg-purple-400" />
              <AngleBar label="Decision" prob={decProb} color="text-gray-400" barColor="bg-gray-400" />
            </div>
          ) : (
            <p className="text-sm text-muted mt-2">Awaiting stat sync</p>
          )}
        </div>
      </div>

      {/* Per-fighter style */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <FighterStyle
          name={f1Name.split(" ").at(-1)!}
          wins={f1.wins}
          koWins={f1.wins_by_ko}
          subWins={f1.wins_by_sub}
          decWins={f1.wins_by_dec}
          hasData={hasFinishData}
          prob={f1Prob}
        />
        <FighterStyle
          name={f2Name.split(" ").at(-1)!}
          wins={f2.wins}
          koWins={f2.wins_by_ko}
          subWins={f2.wins_by_sub}
          decWins={f2.wins_by_dec}
          hasData={hasFinishData}
          prob={f2Prob}
        />
      </div>

      {/* Recommended angle */}
      <div className={clsx(
        "rounded-lg p-3 text-sm border",
        underProb > 0.62 ? "bg-orange-500/5 border-orange-500/20" :
        dominantMethod === "KO/TKO" ? "bg-red-500/5 border-red-500/20" :
        dominantMethod === "Submission" ? "bg-purple-500/5 border-purple-500/20" :
        "bg-white/5 border-border"
      )}>
        <p className="font-medium mb-1">
          {underProb > 0.62 ? `Lean: Under ${roundLine}` :
           dominantMethod !== "Decision" && hasFinishData ? `Lean: Win by ${dominantMethod}` :
           overProb > 0.60 ? `Lean: Over ${roundLine}` :
           "No strong angle — focus on winner market"}
        </p>
        <p className="text-xs text-muted">
          {underProb > 0.62
            ? `Combined ${Math.round(totalFinishRate * 100)}% finish rate across both fighters`
            : dominantMethod !== "Decision" && hasFinishData
            ? `Most wins in this matchup come by ${dominantMethod.toLowerCase()}`
            : overProb > 0.60
            ? "Both fighters trend toward going the distance"
            : "Model sees this as competitive — stick to value pick"}
        </p>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tags.map(t => (
            <span key={t} className="badge bg-white/5 text-muted text-xs">
              <Shield className="w-2.5 h-2.5 inline mr-1" />{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AngleBar({ label, prob, color, barColor }: {
  label: string; prob: number; color: string; barColor: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-muted">{label}</span>
        <span className={clsx("font-semibold", color)}>{Math.round(prob * 100)}%</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div className={clsx("h-full rounded-full", barColor)} style={{ width: `${Math.round(prob * 100)}%` }} />
      </div>
    </div>
  );
}

function FighterStyle({ name, wins, koWins, subWins, decWins, hasData, prob }: {
  name: string; wins: number; koWins: number; subWins: number; decWins: number; hasData: boolean; prob: number;
}) {
  const finishRate = wins > 0 ? Math.round(((koWins + subWins) / wins) * 100) : 0;
  const style = !hasData ? "Syncing..."
    : koWins > subWins && koWins > decWins ? "KO/TKO artist"
    : subWins > koWins && subWins > decWins ? "Submission specialist"
    : decWins >= koWins + subWins ? "Decision fighter"
    : "Finisher";

  return (
    <div className="bg-white/5 rounded-lg p-3 text-xs">
      <p className="font-medium text-white mb-1">{name}</p>
      <p className="text-muted">{style}</p>
      {hasData && (
        <>
          <p className="text-muted mt-0.5">{finishRate}% finish rate</p>
          <p className="text-muted">{koWins} KO · {subWins} Sub · {decWins} Dec</p>
        </>
      )}
      <p className={clsx("font-semibold mt-1", prob >= 0.5 ? "text-accent" : "text-muted")}>
        {Math.round(prob * 100)}% model prob
      </p>
    </div>
  );
}
