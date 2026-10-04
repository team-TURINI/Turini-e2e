/** 브라우저 입력은 질문과 대화 id뿐. 사용자·state·portfolio는 서버가 결정한다. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseChatInput(value: unknown) {
  if (!isRecord(value) || typeof value.question !== "string") return null;
  const question = value.question.trim();
  if (!question || question.length > 2000) return null;
  const id = value.conversation_id;
  if (id !== undefined && (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) return null;
  return { question, conversationId: id as string | undefined };
}

export function portfolioForRag(progress: Record<string, unknown>, saved: Record<string, unknown>) {
  const labels: Record<string, string> = {
    domestic: "국내주식", overseas: "해외주식", bond: "채권",
    equityFund: "주식형 ETF·펀드", cash: "현금성자산", gold: "금",
  };
  if (!isRecord(saved.allocation)) return null;
  const allocation: Record<string, number> = {};
  let total = 0;
  for (const [key, label] of Object.entries(labels)) {
    const weight = saved.allocation[key];
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1) return null;
    allocation[label] = weight;
    total += weight;
  }
  if (Math.abs(total - 1) > 0.000001) return null;
  return {
    diagnosis: {
      risk_type: progress.tendency ?? "진단 전",
      level_type: progress.financeLevel ?? "진단 전",
      weak_tags: Array.isArray(progress.weakTags) ? progress.weakTags.filter((v) => typeof v === "string") : [],
    },
    portfolio: {
      input_mode: saved.inputMode === "practice" ? "가상 연습" : "실제",
      allocation,
      ...(typeof saved.horizon === "string" ? { horizon: saved.horizon } : {}),
      ...(typeof saved.goal === "string" && saved.goal.trim() ? { goal: saved.goal.trim().slice(0, 200) } : {}),
      ...(typeof saved.amount === "number" && Number.isFinite(saved.amount) && saved.amount >= 0
        ? { amount_krw: saved.amount }
        : {}),
    },
  };
}

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type RagReply = {
  answer: string;
  state: Record<string, unknown>;
  messages: ChatMessage[];
  status: string;
  degraded: boolean;
};

export function parseRagReply(value: unknown): RagReply {
  if (!isRecord(value) || typeof value.answer !== "string" || !value.answer.trim()
    || !isRecord(value.state) || value.state.version !== 1 || !Array.isArray(value.state.messages)
    || typeof value.state.conversation_summary !== "string"
    || !Array.isArray(value.messages) || value.messages.length !== 2
    || typeof value.status !== "string" || typeof value.degraded !== "boolean") {
    throw new Error("RAG_RESPONSE_INVALID");
  }
  const messages = value.messages;
  if (!isRecord(messages[0]) || !isRecord(messages[1]) || messages[0].role !== "user"
    || messages[1].role !== "assistant" || typeof messages[0].content !== "string"
    || typeof messages[1].content !== "string" || messages[1].content !== value.answer) {
    throw new Error("RAG_RESPONSE_INVALID");
  }
  return {
    answer: value.answer, state: value.state, status: value.status, degraded: value.degraded,
    messages: messages.map((m) => ({ role: m.role as ChatMessage["role"], content: m.content as string })),
  };
}

