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

  // Check if the recipient is actively viewing this exact conversation right now
  const viewerRows = await sql`
    SELECT * FROM active_viewers
    WHERE chat_id = ${chatId} AND role = ${role} AND last_active > NOW() - INTERVAL '8 seconds'
  `;
  if (viewerRows.length > 0) {
    // They're actively looking at this conversation, skip the notification
    return NextResponse.json({ success: true, skipped: true });
  }

  // Admin gets notified for ALL tickets, so subscription is stored under chatId "admin"
  const lookupId = role === "admin" ? "admin" : chatId;
  const rows = await sql`
    SELECT subscription FROM push_subscriptions WHERE chat_id = ${lookupId} AND role = ${role}
  `;
  if (!rows.length) return NextResponse.json({ success: false });

  try {
    await webpush.sendNotification(
      JSON.parse(rows[0].subscription),
      JSON.stringify({ title, body, chatId })
    );
  } catch (e) {
    await sql`DELETE FROM push_subscriptions WHERE chat_id = ${lookupId} AND role = ${role}`;
  }
  return NextResponse.json({ success: true });
}