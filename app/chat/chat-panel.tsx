"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "../rag-contract";

type Conversation = { id: string; title: string };

export default function ChatPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [id, setId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [degraded, setDegraded] = useState(false);
  const messageList = useRef<HTMLElement>(null);

  async function loadList() {
    const response = await fetch("/api/chat", { cache: "no-store" });
    if (!response.ok) throw new Error("대화 목록을 불러오지 못했어요.");
    const data = await response.json();
    setConversations(data.conversations);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/chat", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("대화 목록을 불러오지 못했어요.");
        return response.json();
      })
      .then((data) => setConversations(data.conversations))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const element = messageList.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, busy]);

  async function openConversation(value: string) {
    if (busy) return;
    if (!value) { setId(undefined); setMessages([]); setError(""); setDegraded(false); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/chat?conversation_id=${encodeURIComponent(value)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setId(data.id); setMessages(data.messages); setDegraded(false);
    } catch (e) { setError(e instanceof Error ? e.message : "대화를 불러오지 못했어요."); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !question.trim()) return;
    const submitted = question.trim();
    setBusy(true); setError(""); setDegraded(false);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: submitted, ...(id ? { conversation_id: id } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.conversation_id) setId(data.conversation_id);
        throw new Error(data.error || "답변을 가져오지 못했어요.");
      }
      setId(data.conversation_id); setMessages((previous) => [...previous, ...data.messages]);
      setQuestion(""); setDegraded(data.degraded);
      await loadList().catch(() => undefined);
    } catch (e) { setError(e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  return <section className="rag-chat card-block" aria-label="투리니 금융 채팅">
    <header className="rag-chat-header"><h2>투리니에게 질문</h2>
      <button disabled={busy} onClick={() => void openConversation("")}>새 대화</button></header>
    <label className="rag-chat-history">지난 대화
      <select value={id ?? ""} disabled={busy} onChange={(e) => void openConversation(e.target.value)}>
        <option value="">새로운 대화</option>
        {conversations.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select></label>
    <section ref={messageList} className="rag-chat-messages" aria-label="대화 내용" aria-live="polite">
      {!messages.length && <div className="rag-chat-empty"><h2>궁금한 금융 개념을 물어보세요</h2>
        <p>“ETF가 뭐야?”부터 시작해 “그럼 채권 ETF는?”처럼 이어서 질문할 수 있어요.</p></div>}
      {messages.map((m, i) => <article className={`rag-chat-message ${m.role}`} key={i}>
        <span>{m.role === "user" ? "나" : "투리니"}</span><p>{m.content}</p></article>)}
      {busy && <p role="status">투리니가 준비하고 있어요…</p>}
    </section>
    {degraded && <p className="rag-chat-notice">일부 검색 기능이 일시적으로 제한되어 답변을 확인하며 이용해 주세요.</p>}
    {error && <p role="alert" className="rag-chat-error">{error}</p>}
    <form onSubmit={submit} className="rag-chat-input">
      <label htmlFor="rag-question" className="rag-chat-input-label">질문</label>
      <textarea id="rag-question" value={question} maxLength={2000} rows={2} disabled={busy}
        onChange={(e) => setQuestion(e.target.value)} placeholder="궁금한 내용을 입력하세요" />
      <button type="submit" disabled={busy || !question.trim()}>보내기</button>
    </form>
    <p className="rag-chat-footnote">금융 학습을 위한 정보이며 투자 권유가 아니에요. 포트폴리오 질문에는 저장된 비중을 사용해요.</p>
  </section>;
}
