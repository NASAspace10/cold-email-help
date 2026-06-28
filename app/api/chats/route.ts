import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (userId) {
    const rows = await sql`SELECT * FROM chats WHERE user_id = ${userId} ORDER BY last_message_at DESC`;
    return NextResponse.json(rows);
  }
  const rows = await sql`SELECT * FROM chats ORDER BY last_message_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { id, name, userId } = await req.json();
  await sql`INSERT INTO chats (id, name, user_id, status) VALUES (${id}, ${name}, ${userId}, 'open') ON CONFLICT (id) DO NOTHING`;
  return NextResponse.json({ success: true });
}