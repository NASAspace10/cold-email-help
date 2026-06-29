import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:admin@cold-email-help.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: Request) {
  const { chatId, role, title, body } = await req.json();
  const rows = await sql`
    SELECT subscription FROM push_subscriptions WHERE chat_id = ${chatId} AND role = ${role}
  `;
  if (!rows.length) return NextResponse.json({ success: false });
  try {
    await webpush.sendNotification(
      JSON.parse(rows[0].subscription),
      JSON.stringify({ title, body })
    );
  } catch (e) {
    await sql`DELETE FROM push_subscriptions WHERE chat_id = ${chatId} AND role = ${role}`;
  }
  return NextResponse.json({ success: true });
}