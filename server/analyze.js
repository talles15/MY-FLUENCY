import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { ROOT } from "./config.js";
import { AnalysisSchema } from "./analysis-schema.js";

/** Lê o prompt de prompts/analise-llm.md (o primeiro bloco ``` depois da linha ---). */
export function loadPromptTemplate(file = path.join(ROOT, "prompts", "analise-llm.md")) {
  const md = fs.readFileSync(file, "utf8");
  const m = md.split(/^---$/m)[1].match(/```\n([\s\S]*?)\n```/);
  if (!m) throw new Error("Não achei o bloco do prompt em " + file);
  return m[1];
}

export function fillPrompt(template, { question, transcript, taskType }) {
  const clean = (s) => String(s || "").replace(/"""/g, '"').trim();
  return template
    .replaceAll("{{QUESTION}}", clean(question))
    .replaceAll("{{TASK_TYPE}}", clean(taskType))
    .replaceAll("{{TRANSCRIPT}}", clean(transcript));
}

/** Tira o JSON do texto do modelo (tolera cercas ``` e texto em volta). */
export function extractJson(text) {
  const t = String(text).replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("a resposta não contém um objeto JSON");
  return JSON.parse(t.slice(a, b + 1));
}

export class AnalysisError extends Error {
  constructor(message, cause) {
    super(message);
    this.status = 502;
    this.cause = cause;
  }
}

// Modelos que aceitam o fallback do lado do servidor quando o classificador de segurança recusa.
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-fable-5-2"]);

const describeZod = (err) => err.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`).join("; ");

/**
 * Cria a função de análise. `client` pode ser trocado nos testes.
 * Valida com zod; se vier inválido, tenta UMA vez de novo mostrando o erro ao modelo.
 */
export function createAnalyzer({ apiKey, model = "claude-sonnet-5-5", client, template = loadPromptTemplate(), effort = "medium" } = {}) {
  if (!client && !apiKey) return null;
  const anthropic = client || new Anthropic({ apiKey });

  async function call(system, messages) {
    const params = {
      model,
      max_tokens: 16000,
      system,
      messages,
      output_config: { effort },
    };
    if (FALLBACK_MODELS.has(model)) {
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }
    let res;
    try {
      res = await anthropic.beta.messages.create(params);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new AnalysisError("A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY no .env.", err);
      if (err instanceof Anthropic.RateLimitError) throw new AnalysisError("Muitas análises seguidas na API da Anthropic. Espere alguns segundos e envie de novo.", err);
      if (err instanceof Anthropic.NotFoundError) throw new AnalysisError(`O modelo "${model}" não foi encontrado. Confira ANTHROPIC_MODEL no .env.`, err);
      if (err instanceof Anthropic.APIError) throw new AnalysisError(`A API da Anthropic respondeu com erro ${err.status ?? ""}. Tente de novo.`, err);
      throw new AnalysisError("Não consegui falar com a API da Anthropic. Verifique a conexão.", err);
    }
    if (res.stop_reason === "refusal") throw new AnalysisError("O modelo recusou analisar esta resposta. Tente reformular.");
    if (res.stop_reason === "max_tokens") throw new AnalysisError("A análise ficou longa demais e foi cortada. Tente uma resposta mais curta.");
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { res, text };
  }

  function parse(text) {
    let obj;
    try { obj = extractJson(text); } catch (e) { return { error: "JSON inválido: " + e.message }; }
    const r = AnalysisSchema.safeParse(obj);
    return r.success ? { data: r.data } : { error: "O JSON não segue o esquema: " + describeZod(r.error) };
  }

  return async function analyze({ question, transcript, taskType }) {
    const system = fillPrompt(template, { question, transcript, taskType });
    const first = [{ role: "user", content: "Analyse the transcript and return only the JSON object." }];
    const a = await call(system, first);
    const p1 = parse(a.text);
    if (p1.data) return p1.data;

    const retry = [
      ...first,
      { role: "assistant", content: a.res.content },
      { role: "user", content: `Your previous output could not be used. ${p1.error}\nReturn ONLY the corrected JSON object that matches the schema, with no text before or after it.` },
    ];
    const b = await call(system, retry);
    const p2 = parse(b.text);
    if (p2.data) return p2.data;
    throw new AnalysisError("A análise de gramática e vocabulário veio num formato inválido duas vezes. Tente enviar de novo. Detalhe: " + p2.error);
  };
}
