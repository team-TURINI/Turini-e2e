import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import * as contract from "../app/rag-contract.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const filename = fileURLToPath(new URL("../app/server/rag-client.ts", import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const clientModule = new Module(filename);
clientModule.require = (name) => {
  if (name === "server-only") return {};
  if (name === "../rag-contract") return contract;
  throw new Error(`Unexpected dependency: ${name}`);
};
clientModule._compile(compiled, filename);
const { requireRagConfig, askRag } = clientModule.exports;

test("RAG uses server-only API key without service-account credentials and fails closed", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://test-service.run.app/chat");
    assert.equal(options.headers["X-API-Key"], "test-only-not-a-real-key");
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.cache, "no-store");
    assert.equal(JSON.parse(options.body).question, "ETF가 뭐야?");
    return { ok: true, json: async () => ({
      answer: "테스트 답변", status: "generated", degraded: false,
      state: { version: 1, messages: [], conversation_summary: "" },
      messages: [{ role: "user", content: "ETF가 뭐야?" }, { role: "assistant", content: "테스트 답변" }],
    }) };
  });
  const names = ["RAG_API_URL", "RAG_API_KEY", "GCP_SA_KEY"];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.RAG_API_URL = "https://test-service.run.app";
    process.env.RAG_API_KEY = "test-only-not-a-real-key";
    delete process.env.GCP_SA_KEY;
    assert.equal(requireRagConfig().url, "https://test-service.run.app");
    assert.equal((await askRag({ user_id: "test", question: "ETF가 뭐야?", conversation_id: "test", state: null, portfolio: null })).answer, "테스트 답변");
    process.env.RAG_API_KEY = " ";
    assert.throws(() => requireRagConfig(), /NOT_CONFIGURED/);
    process.env.RAG_API_KEY = "test-only-not-a-real-key";
    process.env.RAG_API_URL = "https://untrusted.example";
    assert.throws(() => requireRagConfig(), /NOT_CONFIGURED/);
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});
