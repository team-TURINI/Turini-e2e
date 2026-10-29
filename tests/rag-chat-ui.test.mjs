import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const panelSource = await readFile(new URL("../app/chat/chat-panel.tsx", import.meta.url), "utf8");
const chatCss = await readFile(new URL("../app/chat/chat.css", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const chatRouteSource = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");

test("a submitted question is rendered before the RAG request finishes", () => {
  const optimisticUpdate = panelSource.indexOf('setMessages((previous) => [...previous, { role: "user", content: submitted, at: Date.now() }]');
  const request = panelSource.indexOf('const response = await fetch("/api/chat"', optimisticUpdate);
  assert.ok(optimisticUpdate >= 0 && request > optimisticUpdate);
  assert.match(panelSource, /setMessages\(\(previous\) => \[\.\.\.previous, \{ \.\.\.assistant, at: Date\.now\(\) \}\]\)/);
  assert.doesNotMatch(panelSource, /\.\.\.data\.messages/);
});

test("RAG waiting state uses an accessible animated three-dot assistant bubble", () => {
  assert.match(panelSource, /rag-chat-typing[^>]+role="status"[^>]+aria-label="투리니가 답변을 작성하고 있어요"/);
  assert.match(panelSource, /<i \/><i \/><i \/>/);
  assert.match(chatCss, /@keyframes rag-chat-dot/);
  assert.match(chatCss, /prefers-reduced-motion: reduce/);
});

test("the chat opens from a floating button on every tab, not inside a single screen", () => {
  const firstView = pageSource.indexOf('{view === "home"');
  const nav = pageSource.indexOf('<nav className="mobile-nav"');
  const chat = pageSource.indexOf("<ChatPanel");
  const launcher = pageSource.indexOf("<ChatLauncher");
  // 탭별 화면 블록이 끝난 뒤, 하단 탭 바로 앞에 한 번만 둔다
  assert.ok(firstView >= 0 && launcher > firstView && chat > launcher && nav > chat);
  assert.equal(pageSource.indexOf("<ChatPanel", chat + 1), -1);
  assert.match(pageSource, /\{!chatOpen && <ChatLauncher onOpen=\{\(\) => setChatOpen\(true\)\} \/>\}/);
  assert.match(pageSource, /onClick=\{\(\) => \{ setChatOpen\(false\); navigate\(item\); \}\}/);
  assert.match(chatCss, /\.rag-chat-launcher \{[^}]*position: fixed/);
  assert.match(panelSource, /<b>투리니<\/b>/);
});

test("the chat screen keeps its title, badge, input and send button", () => {
  assert.match(panelSource, /id="rag-chat"/);
  assert.match(panelSource, /<h2 id="rag-chat-title">금융 질의응답<\/h2><span>AI 학습 도우미<\/span>/);
  assert.match(panelSource, /id="rag-question"/);
  assert.match(panelSource, /placeholder="궁금한 금융 개념을 물어보세요"/);
  assert.match(panelSource, /className="rag-chat-send"[^>]+aria-label="보내기"/);
  assert.match(panelSource, /aria-label="채팅 닫기"/);
});

test("concept RAG and personal portfolio coaching are separated at the gateway", () => {
  assert.match(chatRouteSource, /portfolio: null/);
  assert.doesNotMatch(chatRouteSource, /portfolioForRag/);
});

