import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getFightDetail, getOddsForFight } from "@/lib/queries";
import StatsComparison from "@/components/StatsComparison";
import OddsPanel from "@/components/OddsPanel";
import { Shield, Star, AlertTriangle, Zap } from "lucide-react";
import clsx from "clsx";

export const dynamic = "force-dynamic";

export default async function FightPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const detail = await getFightDetail(params.id);
  if (!detail) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { fight, f1, f2 } = detail as any;

  const odds = await getOddsForFight(
    params.id,
    fight.fighter1_name as string,
    fight.fighter2_name as string
  );

  const f1UfcFights = ((f1?.wins as number) ?? 0) + ((f1?.losses as number) ?? 0);
  const f2UfcFights = ((f2?.wins as number) ?? 0) + ((f2?.losses as number) ?? 0);
  const f1IsProspect = f1UfcFights < 3;
  const f2IsProspect = f2UfcFights < 3;

  const hasPred = fight.f1_win_prob !== null;
  const f1Prob = (fight.f1_win_prob as number) ?? 0;
  const f2Prob = (fight.f2_win_prob as number) ?? 0;
  const confidence = (fight.confidence as number) ?? 0;
  const f1Favoured = f1Prob >= f2Prob;

  // Decimal → American
  const toAmerican = (dec: number) =>
    dec >= 2 ? `+${Math.round((dec - 1) * 100)}` : `${Math.round(-100 / (dec - 1))}`;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <a href="/" className="text-sm text-muted hover:text-white transition-colors">
        ← Back to Fight Card
      </a>

      {/* Event info */}
      <p className="text-muted text-sm">
        {fight.event_name as string} &middot; {fight.event_date as string} &middot;{" "}
        {fight.event_location as string}
      </p>

      {/* Fight header */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {fight.is_main_event && (
            <span className="badge bg-accent/10 text-accent">Main Event</span>
          )}
          {fight.is_title_fight && (
            <span className="badge bg-yellow-500/10 text-yellow-400 flex items-center gap-1">
              <Star className="w-3 h-3" /> Title Fight
            </span>
          )}
          <span className="badge bg-white/5 text-muted">{fight.weight_class as string}</span>
        </div>

        {/* Fighter names + records */}
        <div className="grid grid-cols-3 gap-4 items-center">
          <div className="text-left">
            <h2 className={clsx("text-2xl font-bold", f1Favoured ? "text-white" : "text-muted")}>
              {fight.fighter1_name as string}
            </h2>
            <p className="text-muted text-sm mt-0.5">
              {f1?.wins ?? 0}–{f1?.losses ?? 0}–{f1?.draws ?? 0}
              {f1?.nationality && <span className="ml-2">{f1.nationality as string}</span>}
            </p>
            {f1?.camp && <p className="text-xs text-muted mt-0.5">{f1.camp as string}</p>}
            {f1IsProspect && (
              <span className="badge bg-blue-500/10 text-blue-400 mt-1 flex items-center gap-1 w-fit">
                <Zap className="w-3 h-3" /> Prospect ({f1UfcFights} UFC fights)
              </span>
            )}
          </div>

          {/* Center: confidence + odds */}
          <div className="text-center space-y-2">
            {hasPred ? (
              <>
                <div className="text-xs text-muted">Model Confidence</div>
                <div className="flex items-end justify-center gap-4">
                  <div className="text-center">
                    <div className={clsx("text-3xl font-bold", f1Favoured ? "text-accent" : "text-muted")}>
                      {Math.round(f1Prob * 100)}%
                    </div>
                  </div>
                  <div className="text-muted text-lg font-bold mb-1">vs</div>
                  <div className="text-center">
                    <div className={clsx("text-3xl font-bold", !f1Favoured ? "text-accent" : "text-muted")}>
                      {Math.round(f2Prob * 100)}%
                    </div>
                  </div>
                </div>
                {/* Confidence bar */}
                <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
                  <div
                    className={clsx("h-full", f1Favoured ? "bg-accent" : "bg-white/20")}
                    style={{ width: `${Math.round(f1Prob * 100)}%` }}
                  />
                  <div
                    className={clsx("h-full", !f1Favoured ? "bg-accent" : "bg-white/20")}
                    style={{ width: `${Math.round(f2Prob * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted">
                  Picks: {f1Favoured ? fight.fighter1_name as string : fight.fighter2_name as string}{" "}
                  ({Math.round(confidence * 100)}% conf)
                </p>
              </>
            ) : (
              <div className="text-center text-muted">
                <Shield className="w-8 h-8 mx-auto mb-1" />
                <p className="text-sm">No prediction yet</p>
                <p className="text-xs mt-0.5">Run python pipeline.py predict</p>
              </div>
            )}

            {/* Best odds */}
            {odds && (
              <div className="flex items-center justify-center gap-3 text-sm pt-1">
                <span className="text-white font-semibold">
                  {odds.best_f1_decimal.toFixed(2)}{" "}
                  <span className="text-muted text-xs">({toAmerican(odds.best_f1_decimal)})</span>
                </span>
                <span className="text-muted">·</span>
                <span className="text-white font-semibold">
                  {odds.best_f2_decimal.toFixed(2)}{" "}
                  <span className="text-muted text-xs">({toAmerican(odds.best_f2_decimal)})</span>
                </span>
              </div>
            )}
          </div>

          <div className="text-right">
            <h2 className={clsx("text-2xl font-bold", !f1Favoured ? "text-white" : "text-muted")}>
              {fight.fighter2_name as string}
            </h2>
            <p className="text-muted text-sm mt-0.5">
              {f2?.wins ?? 0}–{f2?.losses ?? 0}–{f2?.draws ?? 0}
              {f2?.nationality && <span className="ml-2">{f2.nationality as string}</span>}
            </p>
            {f2?.camp && <p className="text-xs text-muted mt-0.5">{f2.camp as string}</p>}
            {f2IsProspect && (
              <span className="badge bg-blue-500/10 text-blue-400 mt-1 flex items-center gap-1 w-fit ml-auto">
                <Zap className="w-3 h-3" /> Prospect ({f2UfcFights} UFC fights)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Prospect alert */}
      {(f1IsProspect || f2IsProspect) && (
        <div className="card p-4 border-blue-500/30 bg-blue-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-2 w-full">
              <p className="font-semibold text-blue-300">Prospect Alert</p>
              {f1IsProspect && f1 && (
                <ProspectInfo
                  name={fight.fighter1_name as string}
                  preWins={f1.pre_ufc_wins as number}
                  preLosses={f1.pre_ufc_losses as number}
                  finishRate={f1.pre_ufc_finish_rate as number}
                  dwcs={f1.dwcs_appeared as boolean}
                  dwcsResult={f1.dwcs_result as string}
                  level={f1.regional_competition_level as number}
                />
              )}
              {f2IsProspect && f2 && (
                <ProspectInfo
                  name={fight.fighter2_name as string}
                  preWins={f2.pre_ufc_wins as number}
                  preLosses={f2.pre_ufc_losses as number}
                  finishRate={f2.pre_ufc_finish_rate as number}
                  dwcs={f2.dwcs_appeared as boolean}
                  dwcsResult={f2.dwcs_result as string}
                  level={f2.regional_competition_level as number}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats comparison */}
      {f1 && f2 && (
        <StatsComparison
          f1Name={fight.fighter1_name as string}
          f2Name={fight.fighter2_name as string}
          f1={f1 as Record<string, number>}
          f2={f2 as Record<string, number>}
        />
      )}

      {/* Odds panel */}
      {odds && (
        <OddsPanel
          odds={odds}
          f1Name={fight.fighter1_name as string}
          f2Name={fight.fighter2_name as string}
          f1Prob={hasPred ? f1Prob : null}
          f2Prob={hasPred ? f2Prob : null}
        />
      )}

      {/* Stake.com CTA */}
      <div className="card p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="font-semibold">Place your bet on Stake.com</p>
          <p className="text-sm text-muted mt-0.5">
            Best MMA odds · Crypto &amp; fiat · Instant payouts
          </p>
        </div>
        <a
          href={`https://stake.com/sports/mma?modal=betslip`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary shrink-0 px-6 py-2.5"
        >
          Bet on Stake
        </a>
      </div>
    </div>
  );
}

function ProspectInfo({
  name, preWins, preLosses, finishRate, dwcs, dwcsResult, level,
}: {
  name: string;
  preWins: number | null;
  preLosses: number | null;
  finishRate: number | null;
  dwcs: boolean | null;
  dwcsResult: string | null;
  level: number | null;
}) {
  return (
    <div className="text-sm text-blue-200">
      <span className="font-medium">{name}</span>:{" "}
      {preWins != null
        ? `${preWins}-${preLosses ?? 0} pre-UFC record`
        : "No pre-UFC data scraped yet"}
      {finishRate != null && ` · ${Math.round(finishRate * 100)}% finish rate`}
      {dwcs && ` · DWCS (${dwcsResult ?? "appeared"})`}
      {level != null && ` · Regional level ${level}/5`}
    </div>
  );
}
