import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function DELETE(req: Request) {
  const { messageId } = await req.json();
  await sql`DELETE FROM messages WHERE id = ${messageId}`;
  return NextResponse.json({ success: true });
}