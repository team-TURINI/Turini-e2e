import "server-only";
import { parseRagReply } from "../rag-contract";

export function requireRagConfig() {
  const configured = process.env.RAG_API_URL;
  const apiKey = process.env.RAG_API_KEY;
  if (!configured || !apiKey?.trim()) throw new Error("RAG_NOT_CONFIGURED");
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || !url.hostname.endsWith(".run.app") || !["", "/"].includes(url.pathname)) {
    throw new Error("RAG_NOT_CONFIGURED");
  }
  return { url: url.origin, apiKey };
}

export async function askRag(payload: {
  user_id: string; question: string; conversation_id: string;
  state: Record<string, unknown> | null; portfolio: unknown;
}) {
  const { url, apiKey } = requireRagConfig();
  // Shared secret is sent only from the server; Cloud Run /chat verifies it.
  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`RAG_HTTP_${response.status}`);
  return parseRagReply(await response.json());
}
