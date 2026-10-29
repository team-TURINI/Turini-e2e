"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { splitDisclaimer, type ChatMessage } from "../rag-contract";

type Conversation = { id: string; title: string };
/** 화면에서만 쓰는 보낸 시각. 서버에 저장된 지난 대화에는 시각이 없어요. */
type UiMessage = ChatMessage & { at?: number };
type ChatPanelProps = { open: boolean; onClose: () => void };

const TIME_FORMAT = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });

/** 모든 화면 오른쪽 아래에 떠 있는 채팅 열기 버튼 */
export function ChatLauncher({ onOpen }: { onOpen: () => void }) {
  return <button type="button" className="rag-chat-launcher" onClick={onOpen} aria-label="AI 투리니에게 금융 개념 질문하기">
    <span className="rag-chat-launcher-art" aria-hidden="true" />
    <b>AI 투리니</b>
  </button>;
}

export default function ChatPanel({ open, onClose }: ChatPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [id, setId] = useState<string>();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [degraded, setDegraded] = useState(false);
  const messageList = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  async function loadList() {
    const response = await fetch("/api/chat", { cache: "no-store" });
    if (!response.ok) throw new Error("대화 목록을 불러오지 못했어요.");
    const data = await response.json();
    setConversations(data.conversations);
  }
  // 대화 목록은 채팅을 처음 열 때 한 번만 불러와요.
  useEffect(() => {
    if (!open || listLoaded) return;
    const controller = new AbortController();
    fetch("/api/chat", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("대화 목록을 불러오지 못했어요.");
        return response.json();
      })
      .then((data) => { setConversations(data.conversations); setListLoaded(true); })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [open, listLoaded]);
  useEffect(() => {
    const element = messageList.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, busy, open]);
  // 부모가 매번 새 onClose 를 넘겨도 열릴 때 한 번만 포커스·스크롤 잠금을 걸도록 ref 로 받아요.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);

  async function openConversation(value: string) {
    if (busy) return;
    setHistoryOpen(false);
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
    setMessages((previous) => [...previous, { role: "user", content: submitted, at: Date.now() }]);
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
      setMessages((previous) => [...previous, { ...assistant, at: Date.now() }]);
      setDegraded(data.degraded);
      await loadList().catch(() => undefined);
    } catch (e) { setError(e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  // Enter 로 보내고 Shift+Enter 로 줄을 바꿔요. 한글 조합 중에는 보내지 않아요.
  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return <section id="rag-chat" className="rag-chat" role="dialog" aria-labelledby="rag-chat-title" hidden={!open}>
    <header className="rag-chat-header">
      <button type="button" className="rag-chat-icon-button" onClick={onClose} aria-label="채팅 닫기">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></svg>
      </button>
      <div className="rag-chat-title"><h2 id="rag-chat-title">금융 질의응답</h2><span>AI 학습 도우미</span></div>
      <button type="button" className="rag-chat-icon-button" onClick={() => setHistoryOpen((value) => !value)}
        aria-expanded={historyOpen} aria-controls="rag-chat-history" aria-label="지난 대화 목록">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" /></svg>
      </button>
    </header>
    {historyOpen && <nav id="rag-chat-history" className="rag-chat-history" aria-label="지난 대화">
      <button type="button" className="rag-chat-new" disabled={busy} onClick={() => void openConversation("")}>+ 새 대화</button>
      {conversations.map((c) => <button type="button" key={c.id} disabled={busy} aria-current={c.id === id ? "true" : undefined}
        onClick={() => void openConversation(c.id)}>{c.title}</button>)}
      {!conversations.length && <p>아직 지난 대화가 없어요.</p>}
    </nav>}
    <section ref={messageList} className="rag-chat-messages" aria-label="대화 내용" aria-live="polite">
      {!messages.length && <div className="rag-chat-empty">
        <span className="rag-chat-avatar rag-chat-avatar--large" aria-hidden="true" />
        <h3>궁금한 금융 개념을 물어보세요</h3>
        <p>“주식과 채권은 뭐가 달라?”처럼 한 가지씩 물어보면 더 정확하게 설명해 드려요.</p>
      </div>}
      {messages.map((m, i) => {
        const time = m.at ? <time className="rag-chat-time" dateTime={new Date(m.at).toISOString()}>{TIME_FORMAT.format(m.at)}</time> : null;
        if (m.role === "user") {
          return <div className="rag-chat-row user" key={i}>
            <article className="rag-chat-message user"><span className="rag-chat-sr">나</span><p>{m.content}</p></article>{time}
          </div>;
        }
        const { body, note } = splitDisclaimer(m.content);
        return <div className="rag-chat-row assistant" key={i}>
          <span className="rag-chat-avatar" aria-hidden="true" />
          <div className="rag-chat-bubble">
            <article className="rag-chat-message assistant"><span className="rag-chat-sr">투리니</span><p>{body}</p>
              {note && <small className="rag-chat-disclaimer">{note}</small>}</article>{time}
          </div>
        </div>;
      })}
      {busy && <div className="rag-chat-row assistant">
        <span className="rag-chat-avatar" aria-hidden="true" />
        <article className="rag-chat-message assistant rag-chat-typing" role="status" aria-label="투리니가 답변을 작성하고 있어요">
          <div className="rag-chat-typing-dots" aria-hidden="true"><i /><i /><i /></div>
        </article>
      </div>}
    </section>
    {degraded && <p className="rag-chat-notice">일부 검색 기능이 일시적으로 제한되어 답변을 확인하며 이용해 주세요.</p>}
    {error && <p role="alert" className="rag-chat-error">{error}</p>}
    <form onSubmit={submit} className="rag-chat-input">
      <label htmlFor="rag-question" className="rag-chat-sr">질문</label>
      <textarea ref={input} id="rag-question" value={question} maxLength={2000} rows={1}
        onChange={(e) => setQuestion(e.target.value)} onKeyDown={sendOnEnter} placeholder="궁금한 금융 개념을 물어보세요" />
      <button type="submit" className="rag-chat-send" disabled={busy || !question.trim()} aria-label="보내기">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 10 14" /><path d="m21 3-7 18-4-7-7-4z" /></svg>
      </button>
    </form>
  </section>;
}
