import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const panelSource = await readFile(new URL("../app/chat/chat-panel.tsx", import.meta.url), "utf8");
const chatCss = await readFile(new URL("../app/chat/chat.css", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const chatRouteSource = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");

test("a submitted question is rendered before the RAG request finishes", () => {
  const optimisticUpdate = panelSource.indexOf('setMessages((previous) => [...previous, { role: "user", content: submitted }]');
  const request = panelSource.indexOf('const response = await fetch("/api/chat"', optimisticUpdate);
  assert.ok(optimisticUpdate >= 0 && request > optimisticUpdate);
  assert.match(panelSource, /setMessages\(\(previous\) => \[\.\.\.previous, assistant\]\)/);
  assert.doesNotMatch(panelSource, /\.\.\.data\.messages/);
});

test("RAG waiting state uses an accessible animated three-dot assistant bubble", () => {
  assert.match(panelSource, /rag-chat-typing[^>]+role="status"[^>]+aria-label="투리니가 답변을 작성하고 있어요"/);
  assert.match(panelSource, /<i \/><i \/><i \/>/);
  assert.match(chatCss, /@keyframes rag-chat-dot/);
  assert.match(chatCss, /prefers-reduced-motion: reduce/);
});

test("the question panel lives on the portfolio screen with its separate AI coach", () => {
  const home = pageSource.indexOf('{view === "home"');
  const portfolio = pageSource.indexOf('{view === "portfolio"');
  const assets = pageSource.indexOf('{view === "assets"');
  const chat = pageSource.indexOf("<ChatPanel", portfolio);
  assert.ok(home >= 0 && portfolio > home && chat > portfolio && chat < assets);
  assert.equal(pageSource.slice(home, portfolio).includes("<ChatPanel"), false);
  assert.equal(pageSource.indexOf("<ChatPanel", chat + 1), -1);
  assert.match(pageSource, />AI 코치<\/button>/);
});

test("the portfolio question panel keeps its visible title and input", () => {
  assert.match(panelSource, /id="rag-chat"/);
  assert.match(panelSource, /<h2>투리니에게 질문<\/h2>/);
  assert.match(panelSource, /id="rag-question"/);
});

test("concept RAG and personal portfolio coaching are separated at the gateway", () => {
  assert.match(chatRouteSource, /portfolio: null/);
  assert.doesNotMatch(chatRouteSource, /portfolioForRag/);
  assert.match(panelSource, /내 비중과 조정 질문은 포트폴리오 AI 코치를 이용해 주세요/);
});

