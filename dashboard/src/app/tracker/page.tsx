import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import TrackerClient from "@/components/TrackerClient";

export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const picks = await query<{
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
  }>(
    `SELECT up.id, up.fight_id, up.event_id,
            e.name AS event_name,
            e.date::text AS event_date,
            up.picked_fighter_name, up.opponent_name,
            up.odds_at_pick::float,
            up.stake_amount::float,
            up.result,
            up.profit_loss::float,
            up.notes,
            up.created_at::text
     FROM user_picks up
     LEFT JOIN events e ON e.id = up.event_id
     WHERE up.user_id = $1
     ORDER BY up.created_at DESC`,
    [session.user.id]
  );

  // Model accuracy for comparison
  const modelStats = await query<{ total: number; correct: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN was_correct THEN 1 ELSE 0 END) AS correct
     FROM model_performance`
  );
  const modelTotal = Number(modelStats[0]?.total ?? 0);
  const modelCorrect = Number(modelStats[0]?.correct ?? 0);
  const modelAccuracy = modelTotal > 0 ? modelCorrect / modelTotal : null;

  return (
    <TrackerClient
      picks={picks}
      modelAccuracy={modelAccuracy}
      userName={session.user.name ?? "You"}
    />
  );
}
