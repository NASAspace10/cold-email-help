import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await sql`SELECT * FROM chats ORDER BY last_message_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { id, name } = await req.json();
  await sql`INSERT INTO chats (id, name) VALUES (${id}, ${name}) ON CONFLICT (id) DO NOTHING`;
  return NextResponse.json({ success: true });
}