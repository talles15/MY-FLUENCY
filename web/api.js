// Chamadas ao back-end. Toda chave secreta fica no servidor.
import { token, config, supabase } from "./auth.js";
import { blobToWav16k } from "./wav.js";

async function handle(res) {
  let body = null;
  try { body = await res.json(); } catch { /* resposta sem JSON */ }
  if (!res.ok) {
    const err = new Error((body && body.error) || `Erro ${res.status} no servidor.`);
    err.status = res.status;
    err.body = body;
    if (res.status === 401) window.dispatchEvent(new CustomEvent("vozclara:logout"));
    throw err;
  }
  return body;
}

async function headers(extra = {}) {
  const t = await token();
  return t ? { ...extra, authorization: "Bearer " + t } : extra;
}

async function json(method, url, data) {
  return fetch(url, { method, headers: await headers(data ? { "content-type": "application/json" } : {}), body: data ? JSON.stringify(data) : undefined }).then(handle);
}

/**
 * Converte a gravação em WAV 16 kHz mono e entrega ao servidor:
 * - na Vercel: envia direto ao Supabase Storage (URL assinada) e manda só o caminho;
 * - local: envia o arquivo junto com o formulário.
 */
async function sendWithAudio(url, fields, blob) {
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null && v !== ""));
  if (!blob) return json("POST", url, clean);
  const wav = await blobToWav16k(blob);
  if (config().upload === "storage") {
    const up = await json("POST", "/api/upload-url", {});
    const { error } = await supabase().storage.from(config().bucket).uploadToSignedUrl(up.path, up.token, wav, { contentType: "audio/wav" });
    if (error) throw new Error("Não consegui enviar o áudio: " + error.message);
    return json("POST", url, { ...clean, audioPath: up.path });
  }
  const f = new FormData();
  for (const [k, v] of Object.entries(clean)) f.append(k, v);
  f.append("audio", wav, "resposta.wav");
  return fetch(url, { method: "POST", headers: await headers(), body: f }).then(handle);
}

export const api = {
  health: () => fetch("/api/health").then(handle),
  /** fields: { question, taskType, text?, fallbackTranscript?, sessionId? } */
  assess: (fields, blob) => sendWithAudio("/api/assess", fields, blob),
  read: (referenceText, blob) => sendWithAudio("/api/read", { referenceText }, blob),
  json,
};
