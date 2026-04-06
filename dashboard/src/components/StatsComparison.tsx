"use client";

import clsx from "clsx";

interface Props {
  f1Name: string;
  f2Name: string;
  f1: Record<string, number>;
  f2: Record<string, number>;
}

const STATS: { key: string; label: string; unit?: string; higherIsBetter?: boolean }[] = [
  { key: "slpm",    label: "Strikes Landed / Min",  higherIsBetter: true },
  { key: "str_acc", label: "Striking Accuracy",     unit: "%", higherIsBetter: true },
  { key: "sapm",    label: "Strikes Absorbed / Min", higherIsBetter: false },
  { key: "str_def", label: "Striking Defence",      unit: "%", higherIsBetter: true },
  { key: "td_avg",  label: "Takedowns / 15min",     higherIsBetter: true },
  { key: "td_acc",  label: "Takedown Accuracy",     unit: "%", higherIsBetter: true },
  { key: "td_def",  label: "Takedown Defence",      unit: "%", higherIsBetter: true },
  { key: "sub_avg", label: "Submissions / 15min",   higherIsBetter: true },
];

export default function StatsComparison({ f1Name, f2Name, f1, f2 }: Props) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold mb-4">Head to Head Stats</h3>

      {/* Finish breakdown */}
      <div className="grid grid-cols-3 gap-2 mb-5 text-center text-sm">
        <FinishBox
          name={f1Name.split(" ")[0]}
          ko={f1.wins_by_ko ?? 0}
          sub={f1.wins_by_sub ?? 0}
          dec={f1.wins_by_dec ?? 0}
        />
        <div className="flex items-center justify-center text-muted text-xs">Win Method</div>
        <FinishBox
          name={f2Name.split(" ")[0]}
          ko={f2.wins_by_ko ?? 0}
          sub={f2.wins_by_sub ?? 0}
          dec={f2.wins_by_dec ?? 0}
          align="right"
        />
      </div>

      {/* Stat bars */}
      <div className="space-y-3">
        {STATS.map(({ key, label, unit, higherIsBetter = true }) => {
          const v1 = (f1[key] as number) ?? 0;
          const v2 = (f2[key] as number) ?? 0;
          const total = v1 + v2;
          const f1Pct = total > 0 ? (v1 / total) * 100 : 50;
          const f2Pct = 100 - f1Pct;
          const f1Better = higherIsBetter ? v1 >= v2 : v1 <= v2;

          return (
            <div key={key}>
              <div className="flex justify-between text-xs text-muted mb-1">
                <span className={clsx(f1Better ? "text-white font-medium" : "")}>
                  {formatStat(v1, unit)}
                </span>
                <span className="text-center">{label}</span>
                <span className={clsx(!f1Better ? "text-white font-medium" : "")}>
                  {formatStat(v2, unit)}
                </span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5">
                <div
                  className={clsx(
                    "h-full transition-all",
                    f1Better ? "bg-accent" : "bg-white/25"
                  )}
                  style={{ width: `${f1Pct}%` }}
                />
                <div
                  className={clsx(
                    "h-full transition-all",
                    !f1Better ? "bg-accent" : "bg-white/25"
                  )}
                  style={{ width: `${f2Pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinishBox({
  name, ko, sub, dec, align = "left",
}: {
  name: string;
  ko: number;
  sub: number;
  dec: number;
  align?: "left" | "right";
}) {
  return (
    <div className={clsx("space-y-1", align === "right" ? "text-right" : "text-left")}>
      <p className="font-medium text-sm">{name}</p>
      {ko > 0 && (
        <p className="text-xs">
          <span className="text-accent font-bold">{ko}</span>{" "}
          <span className="text-muted">KO/TKO</span>
        </p>
      )}
      {sub > 0 && (
        <p className="text-xs">
          <span className="text-blue-400 font-bold">{sub}</span>{" "}
          <span className="text-muted">SUB</span>
        </p>
      )}
      {dec > 0 && (
        <p className="text-xs">
          <span className="text-white font-bold">{dec}</span>{" "}
          <span className="text-muted">DEC</span>
        </p>
      )}
    </div>
  );
}

function formatStat(val: number, unit?: string): string {
  if (!val) return unit ? `0${unit}` : "0";
  const rounded = Number.isInteger(val) ? val : val.toFixed(2);
  return unit ? `${rounded}${unit}` : String(rounded);
}
