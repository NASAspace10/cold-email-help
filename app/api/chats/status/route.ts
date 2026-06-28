import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { chatId, status } = await req.json();
  await sql`UPDATE chats SET status = ${status} WHERE id = ${chatId}`;
  return NextResponse.json({ success: true });
}