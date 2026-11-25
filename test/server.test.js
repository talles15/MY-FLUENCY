import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";

/** Sobe o app numa porta livre e devolve a URL base. */
export async function listen(app) {
  const srv = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

test("GET /api/health informa quais serviços têm chave", async () => {
  const s = await listen(createApp({ speechConfigured: true, llmConfigured: false }));
  try {
    const r = await fetch(s.url + "/api/health").then((x) => x.json());
    assert.deepEqual(r.services, { speech: true, llm: false });
  } finally { await s.close(); }
});
