import assert from "node:assert/strict";
import test from "node:test";
import { parseChatInput, portfolioForRag, parseRagReply } from "../app/rag-contract.ts";

test("question input ignores forged user/state/portfolio and rejects bad identifiers", () => {
  assert.deepEqual(parseChatInput({ question: " ETF? ", user_id: "someone-else", state: { forged: true }, portfolio: {} }), { question: "ETF?", conversationId: undefined });
  assert.equal(parseChatInput({ question: " " }), null);
  assert.equal(parseChatInput({ question: "x".repeat(2001) }), null);
  assert.equal(parseChatInput({ question: "ETF?", conversation_id: "../../secret" }), null);
});

test("portfolio mapping preserves the user's six assets and planning context", () => {
  const saved = { allocation: { domestic: .3, overseas: .1, bond: .2, equityFund: .1, cash: .2, gold: .1 }, inputMode: "practice", amount: 10000000, goal: "은퇴 준비", horizon: "10년 이상" };
  const payload = portfolioForRag({ tendency: "안정형", financeLevel: "초급", weakTags: ["분산투자", 9] }, saved);
  assert.equal(payload.portfolio.allocation["채권"], .2);
  assert.equal(payload.portfolio.allocation["주식형 ETF·펀드"], .1);
  assert.equal(payload.portfolio.allocation["금"], .1);
  assert.equal(payload.portfolio.input_mode, "가상 연습");
  assert.equal(payload.portfolio.amount_krw, 10000000);
  assert.equal(payload.portfolio.goal, "은퇴 준비");
  assert.equal(payload.portfolio.horizon, "10년 이상");
  assert.deepEqual(payload.diagnosis.weak_tags, ["분산투자"]);
  assert.equal(portfolioForRag({}, { allocation: { ...saved.allocation, gold: 0 } }), null);
  assert.equal(portfolioForRag({}, {}), null);
});

test("only valid state and matching assistant message can be saved", () => {
  const payload = { answer: "답변", status: "generated", degraded: false,
    state: { version: 1, messages: [], conversation_summary: "" },
    messages: [{ role: "user", content: "질문", meta: { secret: "hidden" } }, { role: "assistant", content: "답변" }] };
  assert.equal(parseRagReply(payload).answer, "답변");
  assert.equal(parseRagReply(payload).messages[0].meta, undefined);
  assert.throws(() => parseRagReply({ ...payload, state: { version: 999 } }), /INVALID/);
  assert.throws(() => parseRagReply({ ...payload, messages: [{ role: "user", content: "질문" }, { role: "assistant", content: "다른 답변" }] }), /INVALID/);
});

