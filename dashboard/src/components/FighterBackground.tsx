"use client";

import clsx from "clsx";
import { Building2, Globe, TrendingUp, Star, Zap, Award } from "lucide-react";

interface Fighter {
  name: string;
  camp: string | null;
  nationality: string | null;
  pre_ufc_wins: number | null;
  pre_ufc_losses: number | null;
  pre_ufc_finish_rate: number | null;
  dwcs_appeared: boolean | null;
  dwcs_result: string | null;
  regional_competition_level: number | null;
}

interface Props {
  f1: Fighter;
  f2: Fighter;
  sameCamp: boolean;
}

function LevelDots({ level }: { level: number | null }) {
  if (!level) return <span className="text-muted text-xs">—</span>;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={clsx(
            "w-2 h-2 rounded-full",
            i <= level ? "bg-gold" : "bg-white/10"
          )}
        />
      ))}
    </div>
  );
}

function FighterCard({ fighter }: { fighter: Fighter }) {
  const hasData = fighter.camp || fighter.nationality || fighter.pre_ufc_wins != null;
  if (!hasData) return (
    <div className="flex-1 text-center text-muted text-xs py-4">No Tapology data</div>
  );

  const preTotal = (fighter.pre_ufc_wins ?? 0) + (fighter.pre_ufc_losses ?? 0);
  const finishPct = fighter.pre_ufc_finish_rate != null
    ? Math.round(fighter.pre_ufc_finish_rate * 100)
    : null;

  return (
    <div className="flex-1 space-y-2.5">
      {fighter.nationality && (
        <div className="flex items-center gap-2 text-sm">
          <Globe className="w-3.5 h-3.5 text-electric shrink-0" />
          <span className="text-white">{fighter.nationality}</span>
        </div>
      )}

      {fighter.camp && (
        <div className="flex items-center gap-2 text-sm">
          <Building2 className="w-3.5 h-3.5 text-gold shrink-0" />
          <span className="text-white leading-tight">{fighter.camp}</span>
        </div>
      )}

      {fighter.pre_ufc_wins != null && preTotal > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="w-3.5 h-3.5 text-success shrink-0" />
          <span>
            <span className="text-white font-semibold">{fighter.pre_ufc_wins}–{fighter.pre_ufc_losses ?? 0}</span>
            <span className="text-muted"> pre-UFC</span>
            {finishPct != null && (
              <span className="text-muted"> · {finishPct}% finish</span>
            )}
          </span>
        </div>
      )}

      {fighter.dwcs_appeared && (
        <div className="flex items-center gap-2 text-sm">
          <Zap className="w-3.5 h-3.5 text-accent shrink-0" />
          <span>
            <span className="text-white">DWCS</span>
            {fighter.dwcs_result && (
              <span className={clsx(
                "ml-1 text-xs font-semibold",
                fighter.dwcs_result === "signed" ? "text-success" : "text-muted"
              )}>
                ({fighter.dwcs_result})
              </span>
            )}
          </span>
        </div>
      )}

      {fighter.regional_competition_level != null && (
        <div className="flex items-center gap-2">
          <Star className="w-3.5 h-3.5 text-muted shrink-0" />
          <div className="flex items-center gap-2">
            <LevelDots level={fighter.regional_competition_level} />
            <span className="text-xs text-muted">regional level</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FighterBackground({ f1, f2, sameCamp }: Props) {
  const hasAnyData =
    f1.camp || f1.nationality || f1.pre_ufc_wins != null ||
    f2.camp || f2.nationality || f2.pre_ufc_wins != null;

  if (!hasAnyData) return null;

  return (
    <div className="card p-5 space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Award className="w-4 h-4 text-gold" /> Fighter Background
      </h3>

      {sameCamp && (
        <div className="flex items-center gap-2 text-xs bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
          <Building2 className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <span className="text-yellow-300 font-semibold">Same training camp</span>
          <span className="text-yellow-200">— they know each other's game</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">
            {f1.name.split(" ").at(-1)}
          </p>
          <FighterCard fighter={f1} />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">
            {f2.name.split(" ").at(-1)}
          </p>
          <FighterCard fighter={f2} />
        </div>
      </div>
    </div>
  );
}
