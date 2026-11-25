// Chamadas ao back-end. Toda chave de API fica no servidor.
import { extFor } from "./recorder.js";

async function handle(res) {
  let body = null;
  try { body = await res.json(); } catch { /* resposta sem JSON */ }
  if (!res.ok) {
    const err = new Error((body && body.error) || `Erro ${res.status} no servidor.`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function formOf(fields, blob) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null && v !== "") f.append(k, v);
  if (blob) f.append("audio", blob, "resposta." + extFor(blob));
  return f;
}

const post = (url, body) => fetch(url, { method: "POST", body }).then(handle);
const json = (method, url, data) => fetch(url, { method, headers: { "content-type": "application/json" }, body: data ? JSON.stringify(data) : undefined }).then(handle);

export const api = {
  health: () => fetch("/api/health").then(handle),
  /** fields: { question, taskType, text?, fallbackTranscript?, sessionId? } */
  assess: (fields, blob) => post("/api/assess", formOf(fields, blob)),
  read: (referenceText, blob) => post("/api/read", formOf({ referenceText }, blob)),
  json,
};
