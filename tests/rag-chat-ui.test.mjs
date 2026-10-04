import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const panelSource = await readFile(new URL("../app/chat/chat-panel.tsx", import.meta.url), "utf8");
const chatCss = await readFile(new URL("../app/chat/chat.css", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

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

test("concept RAG lives on home while the portfolio screen keeps its own AI coach", () => {
  const home = pageSource.indexOf('{view === "home"');
  const portfolio = pageSource.indexOf('{view === "portfolio"');
  const chat = pageSource.indexOf("<ChatPanel", home);
  assert.ok(home >= 0 && chat > home && chat < portfolio);
  assert.equal(pageSource.indexOf("<ChatPanel", chat + 1), -1);
  assert.match(pageSource, />AI 코치<\/button>/);
});

