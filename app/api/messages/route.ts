import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chatId");
  const rows = await sql`SELECT * FROM messages WHERE chat_id = ${chatId} ORDER BY created_at ASC`;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { chatId, text, sender } = await req.json();
  await sql`INSERT INTO messages (chat_id, text, sender) VALUES (${chatId}, ${text}, ${sender})`;
  await sql`UPDATE chats SET last_message = ${text}, last_message_at = NOW(), has_unread = ${sender === "user"} WHERE id = ${chatId}`;
  return NextResponse.json({ success: true });
}