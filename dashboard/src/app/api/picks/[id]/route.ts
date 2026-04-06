import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { result, profit_loss, notes } = body;

  if (!result || !["win", "loss", "pending", "nc"].includes(result)) {
    return NextResponse.json({ error: "Invalid result" }, { status: 400 });
  }

  const rows = await query(
    `UPDATE user_picks
     SET result = $1,
         profit_loss = $2,
         notes = $3,
         updated_at = NOW()
     WHERE id = $4 AND user_id = $5
     RETURNING id`,
    [result, profit_loss ?? null, notes ?? null, params.id, session.user.id]
  );

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await query(
    `DELETE FROM user_picks WHERE id = $1 AND user_id = $2`,
    [params.id, session.user.id]
  );
  return NextResponse.json({ ok: true });
}
