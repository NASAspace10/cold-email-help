import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { chatId, role, active } = await req.json();
  if (active) {
    await sql`
      INSERT INTO active_viewers (chat_id, role, last_active)
      VALUES (${chatId}, ${role}, NOW())
      ON CONFLICT (chat_id, role) DO UPDATE SET last_active = NOW()
    `;
  } else {
    await sql`DELETE FROM active_viewers WHERE chat_id = ${chatId} AND role = ${role}`;
  }
  return NextResponse.json({ success: true });
}