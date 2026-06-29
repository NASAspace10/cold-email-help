import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { chatId, sender, isTyping } = await req.json();
  if (sender === "user") {
    await sql`UPDATE chats SET typing_user = ${isTyping}, typing_user_at = NOW() WHERE id = ${chatId}`;
  } else {
    await sql`UPDATE chats SET typing_admin = ${isTyping}, typing_admin_at = NOW() WHERE id = ${chatId}`;
  }
  return NextResponse.json({ success: true });
}