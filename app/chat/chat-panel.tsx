"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "../rag-contract";

type Conversation = { id: string; title: string };
type ChatPanelProps = { onOpenPortfolio?: () => void };

export default function ChatPanel({ onOpenPortfolio }: ChatPanelProps) {
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
    setMessages((previous) => [...previous, { role: "user", content: submitted }]);
    setQuestion("");
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
      const assistant = Array.isArray(data.messages)
        ? data.messages.find((message: ChatMessage) => message.role === "assistant")
        : undefined;
      if (!assistant || typeof assistant.content !== "string") throw new Error("답변 형식을 확인하지 못했어요.");
      setId(data.conversation_id);
      setMessages((previous) => [...previous, assistant]);
      setDegraded(data.degraded);
      await loadList().catch(() => undefined);
    } catch (e) { setError(e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  return <section id="rag-chat" className="rag-chat card-block" aria-label="투리니 금융 채팅">
    <header className="rag-chat-header"><h2>투리니에게 질문</h2>
      <button disabled={busy} onClick={() => void openConversation("")}>새 대화</button></header>
    <label className="rag-chat-history">지난 대화
      <select value={id ?? ""} disabled={busy} onChange={(e) => void openConversation(e.target.value)}>
        <option value="">새로운 대화</option>
        {conversations.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select></label>
    <section ref={messageList} className="rag-chat-messages" aria-label="대화 내용" aria-live="polite">
      {!messages.length && <div className="rag-chat-empty"><h2>궁금한 금융 개념을 물어보세요</h2>
        <p>“주식과 채권은 뭐가 달라?”처럼 한 가지씩 물어보면 더 정확하게 설명해 드려요.</p></div>}
      {messages.map((m, i) => <article className={`rag-chat-message ${m.role}`} key={i}>
        <span>{m.role === "user" ? "나" : "투리니"}</span><p>{m.content}</p></article>)}
      {busy && <article className="rag-chat-message assistant rag-chat-typing" role="status" aria-label="투리니가 답변을 작성하고 있어요">
        <span>투리니</span><div className="rag-chat-typing-dots" aria-hidden="true"><i /><i /><i /></div>
      </article>}
    </section>
    {degraded && <p className="rag-chat-notice">일부 검색 기능이 일시적으로 제한되어 답변을 확인하며 이용해 주세요.</p>}
    {error && <p role="alert" className="rag-chat-error">{error}</p>}
    <form onSubmit={submit} className="rag-chat-input">
      <label htmlFor="rag-question" className="rag-chat-input-label">질문</label>
      <textarea id="rag-question" value={question} maxLength={2000} rows={2}
        onChange={(e) => setQuestion(e.target.value)} placeholder="예: 주식과 채권은 뭐가 달라?" />
      <button type="submit" disabled={busy || !question.trim()}>보내기</button>
    </form>
    <div className="rag-chat-footnote"><span>금융 개념 학습용 채팅이에요. 내 비중과 조정 질문은 포트폴리오 AI 코치를 이용해 주세요.</span>
      {onOpenPortfolio && <button type="button" className="rag-chat-portfolio-link" onClick={onOpenPortfolio}>포트폴리오로 이동 →</button>}
    </div>
  </section>;
}

