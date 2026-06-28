import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { chatId, questions, type } = await req.json();
  await sql`
    INSERT INTO questionnaires (chat_id, questions, type, status, created_at)
    VALUES (${chatId}, ${JSON.stringify(questions)}, ${type}, 'pending', NOW())
  `;
  // Send as admin message in chat
  const questionText = "📋 **QUESTIONNAIRE**\n\n" + questions.map((q: any, i: number) =>
    `${i + 1}. ${q.question}${q.type === "multiple" ? "\n   Options: " + q.options.join(" / ") : ""}`
  ).join("\n\n");
  await sql`
    INSERT INTO messages (chat_id, text, sender, created_at)
    VALUES (${chatId}, ${questionText}, 'admin', NOW())
  `;
  await sql`
    UPDATE chats SET last_message = 'Questionnaire sent', last_message_at = NOW(), last_sender = 'admin'
    WHERE id = ${chatId}
  `;
  return NextResponse.json({ success: true });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chatId");
  const rows = await sql`
    SELECT * FROM questionnaires WHERE chat_id = ${chatId} AND status = 'pending' ORDER BY created_at DESC LIMIT 1
  `;
  return NextResponse.json(rows[0] || null);
}

export async function PATCH(req: Request) {
  const { chatId, answers } = await req.json();
  await sql`UPDATE questionnaires SET status = 'completed' WHERE chat_id = ${chatId} AND status = 'pending'`;
  const answerText = "📋 **MY ANSWERS**\n\n" + answers.map((a: any, i: number) =>
    `${i + 1}. ${a.question}\n   → ${a.answer}`
  ).join("\n\n");
  await sql`
    INSERT INTO messages (chat_id, text, sender, created_at)
    VALUES (${chatId}, ${answerText}, 'user', NOW())
  `;
  await sql`
    UPDATE chats SET last_message = 'Questionnaire answered', last_message_at = NOW(), last_sender = 'user', has_unread = true
    WHERE id = ${chatId}
  `;
  return NextResponse.json({ success: true });
}