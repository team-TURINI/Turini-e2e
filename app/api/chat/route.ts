import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/app/server/auth";
import { databaseErrorResponse, getSql } from "@/app/server/db";
import { askRag, requireRagConfig } from "@/app/server/rag-client";
import { parseChatInput, portfolioForRag } from "@/app/rag-contract";

export const runtime = "nodejs";

function sameOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const expected = process.env.APP_ORIGIN ?? (host ? `${protocol}://${host}` : new URL(request.url).origin);
  return request.headers.get("origin") === expected;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
    const sql = getSql();
    const id = new URL(request.url).searchParams.get("conversation_id");
    if (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "대화 번호가 올바르지 않아요." }, { status: 400 });
      const rows = await sql`SELECT id, title, messages FROM turini_rag_conversations WHERE id=${id}::uuid AND user_id=${user.id}`;
      if (!rows[0]) return Response.json({ error: "대화를 찾을 수 없어요." }, { status: 404 });
      return Response.json(rows[0], { headers: { "Cache-Control": "no-store" } });
    }
    const rows = await sql`SELECT id, title, updated_at FROM turini_rag_conversations
      WHERE user_id=${user.id} ORDER BY updated_at DESC LIMIT 50`;
    return Response.json({ conversations: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return databaseErrorResponse(error); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "요청 출처가 올바르지 않아요." }, { status: 403 });
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 16_000) return Response.json({ error: "질문이 너무 길어요." }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  const input = parseChatInput(body);
  if (!input) return Response.json({ error: "질문은 1~2,000자로 입력해 주세요." }, { status: 400 });
  try { requireRagConfig(); }
  catch { return Response.json({ error: "투리니 채팅 연결을 준비 중이에요." }, { status: 503 }); }

  const sql = getSql();
  const id = input.conversationId ?? randomUUID();
  const lease = randomUUID();
  let acquired = false;
  try {
    const allowed = await sql`INSERT INTO turini_rag_rate(user_id) VALUES(${user.id})
      ON CONFLICT(user_id) DO UPDATE SET
        window_start=CASE WHEN turini_rag_rate.window_start < NOW()-INTERVAL '1 minute' THEN NOW() ELSE turini_rag_rate.window_start END,
        request_count=CASE WHEN turini_rag_rate.window_start < NOW()-INTERVAL '1 minute' THEN 1 ELSE turini_rag_rate.request_count+1 END
      WHERE turini_rag_rate.window_start < NOW()-INTERVAL '1 minute' OR turini_rag_rate.request_count < 10
      RETURNING user_id`;
    if (!allowed[0]) return Response.json({ error: "질문이 너무 많아요. 1분 뒤 다시 시도해 주세요." }, { status: 429 });
    if (!input.conversationId) {
      await sql`INSERT INTO turini_rag_conversations(id,user_id,title)
        VALUES(${id}::uuid,${user.id},${input.question.slice(0,40)})`;
    }
    // DB lease serializes turns even across Render workers. State stays server-side.
    const rows = await sql`UPDATE turini_rag_conversations
      SET lease_token=${lease}::uuid, busy_until=NOW()+INTERVAL '3 minutes'
      WHERE id=${id}::uuid AND user_id=${user.id} AND (busy_until IS NULL OR busy_until<NOW())
      RETURNING state`;
    if (!rows[0]) {
      const existing = await sql`SELECT id FROM turini_rag_conversations WHERE id=${id}::uuid AND user_id=${user.id}`;
      return Response.json({ error: existing[0] ? "이 대화의 답변을 기다려 주세요." : "대화를 찾을 수 없어요." }, { status: existing[0] ? 409 : 404 });
    }
    acquired = true;
    const reply = await askRag({ user_id: user.id, question: input.question, conversation_id: id,
      state: rows[0].state ?? null, portfolio: portfolioForRag(user.progress, user.portfolio) });
    const saved = await sql`UPDATE turini_rag_conversations
      SET state=${JSON.stringify(reply.state)}::jsonb,
          messages=messages || ${JSON.stringify(reply.messages)}::jsonb,
          lease_token=NULL, busy_until=NULL, updated_at=NOW()
      WHERE id=${id}::uuid AND user_id=${user.id} AND lease_token=${lease}::uuid RETURNING id`;
    if (!saved[0]) throw new Error("RAG_STATE_SAVE_CONFLICT");
    acquired = false;
    return Response.json({ conversation_id: id, answer: reply.answer, messages: reply.messages,
      status: reply.status, degraded: reply.degraded }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.", conversation_id: id }, { status: 502 });
  } finally {
    if (acquired) await sql`UPDATE turini_rag_conversations SET lease_token=NULL,busy_until=NULL
      WHERE id=${id}::uuid AND user_id=${user.id} AND lease_token=${lease}::uuid`.catch(() => undefined);
  }
}
