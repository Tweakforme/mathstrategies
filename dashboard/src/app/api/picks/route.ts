import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    fight_id,
    event_id,
    picked_fighter_id,
    picked_fighter_name,
    opponent_name,
    odds_at_pick,
    stake_amount,
  } = body;

  if (!fight_id || !picked_fighter_name || !odds_at_pick) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Check for duplicate pick on same fight by same user
  const existing = await queryOne(
    `SELECT id FROM user_picks WHERE user_id = $1 AND fight_id = $2`,
    [session.user.id, fight_id]
  );
  if (existing) {
    return NextResponse.json({ error: "You already picked this fight" }, { status: 409 });
  }

  const rows = await query(
    `INSERT INTO user_picks
       (user_id, fight_id, event_id, picked_fighter_id, picked_fighter_name,
        opponent_name, odds_at_pick, stake_amount, result)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
     RETURNING id`,
    [
      session.user.id,
      fight_id,
      event_id ?? null,
      picked_fighter_id ?? null,
      picked_fighter_name,
      opponent_name ?? null,
      odds_at_pick,
      stake_amount ?? null,
    ]
  );

  return NextResponse.json({ id: (rows[0] as { id: number }).id }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const picks = await query(
    `SELECT up.*, e.name AS event_name, e.date::text AS event_date
     FROM user_picks up
     LEFT JOIN events e ON e.id = up.event_id
     WHERE up.user_id = $1
     ORDER BY up.created_at DESC`,
    [session.user.id]
  );

  return NextResponse.json(picks);
}
