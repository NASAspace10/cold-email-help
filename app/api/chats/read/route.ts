import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { chatId } = await req.json();
  await sql`UPDATE chats SET has_unread = FALSE WHERE id = ${chatId}`;
  return NextResponse.json({ success: true });
}