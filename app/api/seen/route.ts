import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { chatId } = await req.json();
  await sql`
    UPDATE messages SET seen_at = NOW()
    WHERE chat_id = ${chatId} AND sender = 'admin' AND seen_at IS NULL
  `;
  return NextResponse.json({ success: true });
}