"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Target, DollarSign, Trash2, Edit2 } from "lucide-react";
import clsx from "clsx";

interface Pick {
  id: number;
  fight_id: string;
  event_id: string;
  event_name: string;
  event_date: string;
  picked_fighter_name: string;
  opponent_name: string;
  odds_at_pick: number;
  stake_amount: number | null;
  result: string;
  profit_loss: number | null;
  notes: string | null;
  created_at: string;
}

interface Props {
  picks: Pick[];
  modelAccuracy: number | null;
  userName: string;
}

// Decimal → American string
function toAmerican(dec: number): string {
  return dec >= 2
    ? `+${Math.round((dec - 1) * 100)}`
    : `${Math.round(-100 / (dec - 1))}`;
}

export default function TrackerClient({ picks, modelAccuracy, userName }: Props) {
  const [localPicks, setLocalPicks] = useState<Pick[]>(picks);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editResult, setEditResult] = useState("pending");
  const [editPL, setEditPL] = useState("");

  // ── Stats ────────────────────────────────────────────────────────────────
  const settled = localPicks.filter((p) => p.result !== "pending");
  const wins = settled.filter((p) => p.result === "win").length;
  const losses = settled.filter((p) => p.result === "loss").length;
  const winRate = settled.length > 0 ? wins / settled.length : null;
  const totalPL = localPicks.reduce((s, p) => s + (p.profit_loss ?? 0), 0);
  const totalStaked = localPicks.reduce((s, p) => s + (p.stake_amount ?? 0), 0);
  const roi = totalStaked > 0 ? (totalPL / totalStaked) * 100 : null;

  // ── Cumulative bankroll chart data ───────────────────────────────────────
  const chartData = (() => {
    let running = 0;
    return [...localPicks]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((p) => {
        running += p.profit_loss ?? 0;
        return {
          date: p.event_date?.slice(0, 10) ?? p.created_at.slice(0, 10),
          pl: parseFloat(running.toFixed(2)),
          fighter: p.picked_fighter_name,
        };
      });
  })();

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function saveEdit(id: number) {
    const pl = editResult === "win"
      ? (localPicks.find((p) => p.id === id)?.stake_amount ?? 0) * ((localPicks.find((p) => p.id === id)?.odds_at_pick ?? 1) - 1)
      : editResult === "loss"
      ? -(localPicks.find((p) => p.id === id)?.stake_amount ?? 0)
      : parseFloat(editPL) || 0;

    await fetch(`/api/picks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: editResult, profit_loss: pl }),
    });

    setLocalPicks((prev) =>
      prev.map((p) => (p.id === id ? { ...p, result: editResult, profit_loss: pl } : p))
    );
    setEditingId(null);
  }

  async function deletePick(id: number) {
    if (!confirm("Delete this pick?")) return;
    await fetch(`/api/picks/${id}`, { method: "DELETE" });
    setLocalPicks((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{userName}&rsquo;s Tracker</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Target className="w-4 h-4" />}
          label="Win Rate"
          value={winRate !== null ? `${Math.round(winRate * 100)}%` : "—"}
          sub={`${wins}W ${losses}L`}
          color={winRate !== null && winRate >= 0.55 ? "green" : "muted"}
        />
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Total P/L"
          value={`${totalPL >= 0 ? "+" : ""}$${totalPL.toFixed(0)}`}
          sub={`${localPicks.length} picks`}
          color={totalPL >= 0 ? "green" : "red"}
        />
        <StatCard
          icon={totalPL >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          label="ROI"
          value={roi !== null ? `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%` : "—"}
          sub={`$${totalStaked.toFixed(0)} staked`}
          color={roi !== null && roi >= 0 ? "green" : roi !== null ? "red" : "muted"}
        />
        <StatCard
          icon={<Target className="w-4 h-4" />}
          label="vs Model"
          value={modelAccuracy !== null ? `${Math.round(modelAccuracy * 100)}%` : "—"}
          sub="Model accuracy"
          color="muted"
          extraLabel={winRate !== null && modelAccuracy !== null
            ? winRate > modelAccuracy ? "You're beating the model!" : "Model is ahead"
            : undefined}
        />
      </div>

      {/* Cumulative P/L chart */}
      {chartData.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold mb-4">Cumulative P/L</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1a1a", border: "1px solid #2a2a2a",
                  borderRadius: "6px", fontSize: "12px",
                }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, "P/L"]}
              />
              <ReferenceLine y={0} stroke="#2a2a2a" strokeDasharray="4 2" />
              <Line
                type="monotone"
                dataKey="pl"
                stroke="#e63946"
                strokeWidth={2}
                dot={{ fill: "#e63946", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Picks table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">Pick History</h3>
          <span className="text-xs text-muted">{localPicks.length} picks</span>
        </div>

        {localPicks.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <p>No picks yet.</p>
            <p className="text-sm mt-1">Go to any fight and tap Pick to add one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-border">
                  <th className="text-left px-4 py-2">Event</th>
                  <th className="text-left px-4 py-2">Pick</th>
                  <th className="text-center px-4 py-2">Odds</th>
                  <th className="text-center px-4 py-2">Stake</th>
                  <th className="text-center px-4 py-2">Result</th>
                  <th className="text-center px-4 py-2">P/L</th>
                  <th className="text-center px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {localPicks.map((pick) => (
                  <>
                    <tr
                      key={pick.id}
                      className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[160px]">
                          {pick.event_name ?? "—"}
                        </p>
                        <p className="text-xs text-muted">{pick.event_date?.slice(0, 10)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{pick.picked_fighter_name}</p>
                        <p className="text-xs text-muted">vs {pick.opponent_name}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono">
                          {pick.odds_at_pick?.toFixed(2)}{" "}
                          <span className="text-muted text-xs">
                            ({toAmerican(pick.odds_at_pick)})
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-muted">
                        {pick.stake_amount ? `$${pick.stake_amount.toFixed(0)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {editingId === pick.id ? (
                          <select
                            value={editResult}
                            onChange={(e) => setEditResult(e.target.value)}
                            className="bg-bg border border-border rounded px-2 py-1 text-xs"
                          >
                            <option value="pending">Pending</option>
                            <option value="win">Win</option>
                            <option value="loss">Loss</option>
                            <option value="nc">NC</option>
                          </select>
                        ) : (
                          <ResultBadge result={pick.result} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={clsx(
                          "font-semibold",
                          pick.profit_loss == null ? "text-muted" :
                          pick.profit_loss > 0 ? "text-green-400" : "text-red-400"
                        )}>
                          {pick.profit_loss == null
                            ? "—"
                            : `${pick.profit_loss >= 0 ? "+" : ""}$${pick.profit_loss.toFixed(2)}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {editingId === pick.id ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => saveEdit(pick.id)}
                              className="text-xs text-green-400 hover:text-green-300 font-semibold"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs text-muted hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setEditingId(pick.id);
                                setEditResult(pick.result);
                                setEditPL(pick.profit_loss?.toString() ?? "");
                              }}
                              className="text-muted hover:text-white transition-colors"
                              title="Edit result"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deletePick(pick.id)}
                              className="text-muted hover:text-red-400 transition-colors"
                              title="Delete pick"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {pick.notes && (
                      <tr key={`${pick.id}-note`} className="border-b border-border/30 bg-white/[0.01]">
                        <td colSpan={7} className="px-4 py-1.5 text-xs text-muted italic">
                          Note: {pick.notes}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, sub, color, extraLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: "green" | "red" | "muted";
  extraLabel?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-muted mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={clsx(
        "text-2xl font-bold",
        color === "green" ? "text-green-400" :
        color === "red" ? "text-red-400" : "text-white"
      )}>
        {value}
      </p>
      <p className="text-xs text-muted mt-0.5">{sub}</p>
      {extraLabel && <p className="text-xs text-accent mt-1 font-medium">{extraLabel}</p>}
    </div>
  );
}

function ResultBadge({ result }: { result: string }) {
  if (result === "win") return <span className="badge bg-green-500/10 text-green-400">W</span>;
  if (result === "loss") return <span className="badge bg-red-500/10 text-red-400">L</span>;
  if (result === "nc") return <span className="badge bg-white/5 text-muted">NC</span>;
  return <span className="badge bg-yellow-500/10 text-yellow-400">Pending</span>;
}
