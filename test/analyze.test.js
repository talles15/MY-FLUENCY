import { test } from "node:test";
import assert from "node:assert/strict";
import { createAnalyzer, loadPromptTemplate, fillPrompt, extractJson } from "../server/analyze.js";
import { EXAMPLES } from "../fixtures/examples.js";

const good = { ...EXAMPLES[2].analysis, corrected_version: "Last year I travelled...", feedback_pt: "Bom trabalho." };

/** Cliente falso da Anthropic: devolve os textos da lista, um por chamada, e guarda os pedidos. */
function fakeClient(texts) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (params) => {
      calls.push(structuredClone(params));
      const text = texts[Math.min(calls.length - 1, texts.length - 1)];
      return { stop_reason: "end_turn", content: [{ type: "text", text }] };
    } } },
  };
}

test("o prompt vem de prompts/analise-llm.md e recebe pergunta, transcrição e tipo de tarefa", () => {
  const tpl = loadPromptTemplate();
  assert.match(tpl, /certified CEFR speaking examiner/);
  assert.match(tpl, /Do NOT give scores or a level/);
  const p = fillPrompt(tpl, { question: "Q1?", transcript: 'I said """hi"""', taskType: "narrate" });
  assert.ok(p.includes("Question asked: Q1?"));
  assert.ok(p.includes("Task type: narrate"));
  assert.ok(p.includes('Transcript: """I said "hi""""'), "aspas triplas do aluno não fecham o bloco");
  assert.ok(!/\{\{/.test(p));
});

test("extrai JSON mesmo com cercas de código e texto em volta", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":{"b":2}} thanks'), { a: { b: 2 } });
  assert.throws(() => extractJson("nada"));
});

test("análise válida: valida com zod, descarta nível/nota inventados e ids de estrutura desconhecidos", async () => {
  const client = fakeClient([JSON.stringify({ ...good, cefr: "C2", score: 99, structures: [...good.structures, "made_up_structure"] })]);
  const analyze = createAnalyzer({ client, model: "claude-sonnet-5-5" });
  const r = await analyze({ question: "Q", transcript: "T", taskType: "narrate" });
  assert.equal(client.calls.length, 1);
  assert.equal(r.cefr, undefined);
  assert.equal(r.score, undefined);
  assert.ok(!r.structures.includes("made_up_structure"));
  assert.equal(r.t_units, 7);
  const p = client.calls[0];
  assert.equal(p.model, "claude-sonnet-5-5");
  assert.match(p.system, /Task type: narrate/);
  assert.equal(p.fallbacks, "default");
});

test("JSON inválido: tenta de novo uma vez mostrando o erro ao modelo", async () => {
  const client = fakeClient(['{"on_topic": true, "grammar_errors": "none"}', JSON.stringify(good)]);
  const analyze = createAnalyzer({ client });
  const r = await analyze({ question: "Q", transcript: "T", taskType: "narrate" });
  assert.equal(client.calls.length, 2);
  const retryMsg = client.calls[1].messages.at(-1).content;
  assert.match(retryMsg, /grammar_errors/);
  assert.equal(client.calls[1].messages[1].role, "assistant");
  assert.equal(r.on_topic, true);
});

test("inválido duas vezes: erro 502 legível", async () => {
  const analyze = createAnalyzer({ client: fakeClient(["isso não é JSON"]) });
  await assert.rejects(analyze({ question: "Q", transcript: "T", taskType: "narrate" }), (e) => e.status === 502 && /formato inválido duas vezes/.test(e.message));
});

test("recusa do modelo vira erro 502 legível", async () => {
  const client = { beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } } };
  await assert.rejects(createAnalyzer({ client })({ question: "Q", transcript: "T", taskType: "narrate" }), (e) => e.status === 502);
});

test("sem chave nem cliente, não há analisador", () => {
  assert.equal(createAnalyzer({ apiKey: "" , template: "x" }), null);
});
