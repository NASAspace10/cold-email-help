import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { subscription, chatId, role } = await req.json();
  await sql`
    INSERT INTO push_subscriptions (chat_id, role, subscription, created_at)
    VALUES (${chatId}, ${role}, ${JSON.stringify(subscription)}, NOW())
    ON CONFLICT (chat_id, role) DO UPDATE SET subscription = ${JSON.stringify(subscription)}
  `;
  return NextResponse.json({ success: true });
}