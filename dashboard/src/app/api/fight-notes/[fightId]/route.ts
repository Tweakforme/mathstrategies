import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { fightId: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await queryOne<{ notes: string }>(
    `SELECT notes FROM fight_notes WHERE fight_id = $1`,
    [params.fightId]
  );
  return NextResponse.json({ notes: row?.notes ?? "" });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { fightId: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { notes } = await req.json();
  await query(
    `INSERT INTO fight_notes (fight_id, notes, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (fight_id) DO UPDATE SET notes = $2, updated_at = NOW()`,
    [params.fightId, notes ?? ""]
  );
  return NextResponse.json({ ok: true });
}
