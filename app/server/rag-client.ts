import "server-only";
import { GoogleAuth } from "google-auth-library";
import { parseRagReply } from "../rag-contract";

let auth: GoogleAuth | undefined;

export function requireRagConfig() {
  const configured = process.env.RAG_API_URL;
  const apiKey = process.env.RAG_API_KEY;
  if (!configured || !apiKey || !process.env.GCP_SA_KEY) throw new Error("RAG_NOT_CONFIGURED");
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
  if (!auth) {
    let credentials;
    try { credentials = JSON.parse(process.env.GCP_SA_KEY!); }
    catch { throw new Error("RAG_NOT_CONFIGURED"); }
    if (credentials.type !== "service_account" || !credentials.client_email || !credentials.private_key) {
      throw new Error("RAG_NOT_CONFIGURED");
    }
    auth = new GoogleAuth({ credentials });
  }
  const client = await auth.getIdTokenClient(url);
  // ID-token client caches and refreshes tokens. Only the server receives these headers.
  const headers = await client.getRequestHeaders(url);
  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { Authorization: headers.get("authorization")!, "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`RAG_HTTP_${response.status}`);
  return parseRagReply(await response.json());
}
