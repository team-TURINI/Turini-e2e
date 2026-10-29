import assert from "node:assert/strict";
import test from "node:test";
import { parseChatInput, portfolioForRag, parseRagReply, splitDisclaimer } from "../app/rag-contract.ts";

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


test("the trailing disclaimer of a RAG answer is split off for the card footer", () => {
  const answer = "ETF는 거래소에 상장돼요. 다만 원금 손실 가능성이 있으니 유의하시기 바라며, 본 안내는 투자 권유가 아닌 정보 제공이에요.";
  assert.deepEqual(splitDisclaimer(answer), {
    body: "ETF는 거래소에 상장돼요.",
    note: "다만 원금 손실 가능성이 있으니 유의하시기 바라며, 본 안내는 투자 권유가 아닌 정보 제공이에요.",
  });
  // 면책 문장이 없거나 본문 자체가 원금 손실 설명이면 나누지 않는다
  assert.deepEqual(splitDisclaimer("ETF는 거래소에 상장돼요."), { body: "ETF는 거래소에 상장돼요.", note: "" });
  assert.deepEqual(splitDisclaimer("원금 손실 가능성이 있는 상품이에요."), { body: "원금 손실 가능성이 있는 상품이에요.", note: "" });
});

test("disclaimer split also catches differently worded trailing notices", () => {
  const answer = "“계란을 한 바구니에 담지 말라”는 말은 여러 자산에 나눠 투자하라는 뜻입니다. 경제 상황이 불확실할 때 특히 중요합니다. 원금 손실이 발생할 수 있으므로 유의하시기 바라며, 본 안내는 투자 권유가 아닌 정보 제공입니다.";
  assert.deepEqual(splitDisclaimer(answer), {
    body: "“계란을 한 바구니에 담지 말라”는 말은 여러 자산에 나눠 투자하라는 뜻입니다. 경제 상황이 불확실할 때 특히 중요합니다.",
    note: "원금 손실이 발생할 수 있으므로 유의하시기 바라며, 본 안내는 투자 권유가 아닌 정보 제공입니다.",
  });
  // 고지가 두 문장으로 나뉘어 있어도 함께 모은다
  assert.equal(splitDisclaimer("ETF는 상장돼요. 원금 손실이 생길 수 있어요. 본 안내는 투자 권유가 아니에요.").note,
    "원금 손실이 생길 수 있어요. 본 안내는 투자 권유가 아니에요.");
});
