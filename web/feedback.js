// Renderização do resultado de cada resposta, do teste de nível e da leitura.
import { el, listenButton } from "./ui.js";
import { LEVELS } from "../src/cefr-engine.js";

const fmtNum = (v, d = 0) => (v == null ? "—" : Number(v).toFixed(d).replace(".", ","));

export const DIMENSIONS = [
  ["pronunciation", "Pronúncia"],
  ["fluency", "Fluência"],
  ["grammar", "Gramática"],
  ["vocabulary", "Vocabulário"],
];
const DIM_POSSESSIVE = { pronunciation: "sua pronúncia", fluency: "sua fluência", grammar: "sua gramática", vocabulary: "seu vocabulário" };

/** Explicação de cada aviso do motor, em português. */
export const FLAG_TEXT = {
  amostra_curta: ["Resposta curta", "A resposta teve menos de 40 palavras. Ela recebe notas, mas não conta para o nível oficial, porque amostras curtas enganam. Tente falar por cerca de um minuto."],
  fora_do_tema: ["Fora do tema", "A resposta não pareceu responder à pergunta feita. Releia a pergunta e responda diretamente a ela."],
  possivel_leitura: ["Possível leitura", "Fala muito rápida, sem nenhuma hesitação e fora do tema: parece um texto lido ou decorado. Respostas assim não contam para o nível."],
  pronuncia_estimada: ["Pronúncia não medida", "O serviço de pronúncia não avaliou esta resposta (resposta digitada ou falha no serviço). A nota de pronúncia ficou de fora e o nível foi calculado só com as outras dimensões."],
  sem_tempos_de_fala: ["Fluência não medida", "Não houve tempos por palavra (resposta digitada ou sem o serviço de pronúncia), então velocidade e pausas não foram medidas."],
};

const ERROR_TYPES = {
  verb_tense: "tempo verbal", agreement: "concordância", article: "artigo", preposition: "preposição", word_order: "ordem das palavras",
  missing_subject: "sujeito faltando", plural: "plural", pronoun: "pronome", auxiliary: "verbo auxiliar", other: "gramática",
  wrong_word: "palavra errada", collocation: "combinação de palavras", word_formation: "formação da palavra", false_cognate: "falso cognato", portuguese: "palavra em português",
};

function bar(v) {
  const b = el("div", "bar"), i = el("i");
  i.style.width = Math.max(0, Math.min(100, v || 0)) + "%";
  b.append(i);
  b.setAttribute("role", "img");
  b.setAttribute("aria-label", v == null ? "sem nota" : `${Math.round(v)} de 100`);
  return b;
}

export function flagList(flags) {
  const box = el("div");
  box.style.cssText = "display:flex;flex-direction:column;gap:6px";
  for (const f of flags) {
    const [title, text] = FLAG_TEXT[f] || [f, ""];
    const d = el("div", "flag");
    d.append(el("b", null, "⚠ " + title + ":"), el("span", null, text));
    box.append(d);
  }
  return box;
}

function section(label, ...children) {
  const d = el("div");
  d.style.cssText = "display:flex;flex-direction:column;gap:6px";
  d.append(el("div", "label", label), ...children);
  return d;
}

function dimensionGrid(dims, levels, details) {
  const grid = el("div", "dim-grid");
  const sub = {
    pronunciation: () => (details && details.pronunciation && details.pronunciation.score != null ? "precisão, acento, prosódia e clareza" : "não medida nesta resposta"),
    fluency: () => { const m = details && details.fluency && details.fluency.metrics; return m ? `${Math.round(m.wordsPerMinute)} palavras/min · ${fmtNum(m.longPausesPerMinute, 1)} pausas longas/min` : "não medida nesta resposta"; },
    grammar: () => { const m = details && details.grammar && details.grammar.metrics; return m ? `${fmtNum(m.grammarErrorsPer100, 1)} erros a cada 100 palavras` : ""; },
    vocabulary: () => { const m = details && details.vocabulary && details.vocabulary.metrics; return m && m.pctB2plus != null ? `${fmtNum(m.pctB2plus, 0)}% das palavras de B2 para cima` : ""; },
  };
  for (const [k, label] of DIMENSIONS) {
    const v = dims[k];
    const d = el("div", "meter dim");
    const head = el("div", "row");
    head.append(el("span", "label", label), el("span", "pill", v == null ? "—" : (levels && levels[k]) || "—"));
    d.append(head, el("span", "v", v == null ? "—" : String(Math.round(v))), bar(v));
    if (details) d.append(el("span", "small muted", sub[k]()));
    grid.append(d);
  }
  return grid;
}

function capNotice(r) {
  if (!r.capped || !r.cappedBy) return null;
  return el("p", "banner", `Teto aplicado: ${DIM_POSSESSIVE[r.cappedBy]} limitou o nível a ${r.level}. A média das notas daria mais, mas o nível final fica no máximo um acima da dimensão mais fraca.`);
}

function wordsByLevel(profile) {
  const wrap = el("div", "levels");
  for (const l of LEVELS) {
    const words = profile.byLevel[l] || [];
    const hi = LEVELS.indexOf(l) >= LEVELS.indexOf("B2");
    if (!words.length && !hi) continue;
    const box = el("div");
    box.append(el("span", "pill" + (hi ? " good" : ""), `${l} · ${words.length}`));
    const chips = el("div", "chips");
    if (!words.length) chips.append(el("span", "small muted", "nenhuma nesta resposta"));
    for (const w of words.slice(0, 30)) { const c = el("span", "chip" + (hi ? " hi" : ""), w); c.lang = "en"; chips.append(c); }
    if (words.length > 30) chips.append(el("span", "small muted", `+${words.length - 30}`));
    box.append(chips);
    wrap.append(box);
  }
  return wrap;
}

function errorList(analysis) {
  const errs = [...(analysis.grammar_errors || []), ...(analysis.lexical_errors || [])];
  if (!errs.length) return el("p", "small", "Nenhum erro de gramática ou vocabulário encontrado. 👏");
  const list = el("div");
  for (const e of errs) {
    const d = el("div", "err");
    const line = el("div", "row");
    const wrong = el("span", "pill bad", e.text); wrong.lang = "en";
    const right = el("span", "pill good", e.correction); right.lang = "en";
    line.append(wrong, el("span", null, "→"), right, el("span", "small muted", ERROR_TYPES[e.type] || ""));
    d.append(line);
    if (e.explanation_pt) d.append(el("span", "small", e.explanation_pt));
    list.append(d);
  }
  return list;
}

/** Cartão completo de uma resposta. */
export function renderFeedback(box, r, { rate = 1 } = {}) {
  const res = r.result, a = r.analysis || {};
  const fb = el("div", "fb");

  const head = el("div", "row");
  head.style.justifyContent = "space-between";
  head.append(el("h3", null, "Avaliação da sua resposta"));
  const lvl = el("span", "pill", "Nível indicativo: " + (res.indicativeLevel || "—"));
  lvl.title = "Uma resposta sozinha dá só um nível indicativo. O nível oficial vem do teste de nível.";
  head.append(lvl);
  fb.append(head);
  fb.append(el("p", "small muted", `${res.words} palavras · O nível de uma resposta é só indicativo; o oficial vem do teste de nível.`));

  if (res.flags.length) fb.append(flagList(res.flags));
  const cap = capNotice(res);
  if (cap) fb.append(cap);

  fb.append(dimensionGrid(res.dimensions, res.dimensionLevels, res.details));

  if (a.feedback_pt) fb.append(el("p", null, a.feedback_pt));

  fb.append(section("O que você disse", Object.assign(el("p", null, r.transcript), { lang: "en" })));

  fb.append(section("Erros e correções", errorList(a)));

  if (a.corrected_version) {
    const c = el("div", "corr");
    const t = el("p", null, a.corrected_version);
    t.lang = "en";
    c.append(t, listenButton(a.corrected_version, "▶ ouvir a versão corrigida", rate));
    fb.append(section("Versão corrigida", c));
  }

  const sugg = (a.suggested_words || []).slice(0, 3);
  if (sugg.length) {
    const c = el("div", "chips");
    for (const s of sugg) {
      const chip = el("span", "chip");
      chip.append(Object.assign(el("b", null, s.word), { lang: "en" }), ` ${s.cefr ? "(" + s.cefr + ")" : ""}${s.instead_of ? " em vez de “" + s.instead_of + "”" : ""} `, listenButton(s.word, "▶", rate));
      c.append(chip);
    }
    fb.append(section("Palavras para subir de nível", c));
  }

  const profile = res.details && res.details.vocabulary && res.details.vocabulary.profile;
  if (profile && profile.contentLemmas) {
    fb.append(section("Palavras que você usou, por nível CEFR (destaque para B2 ou acima)", wordsByLevel(profile)));
  }

  const hard = (r.wordScores || []).filter((w) => Number.isFinite(w.accuracy) && w.accuracy < 60);
  if (hard.length) {
    const c = el("div", "chips");
    for (const w of [...new Map(hard.map((x) => [x.word.toLowerCase().replace(/[^\w'’-]/g, ""), x])).values()].slice(0, 10)) {
      const clean = w.word.replace(/[^\w'’-]/g, "");
      c.append(listenButton(clean, `▶ ${clean} (${Math.round(w.accuracy)})`, rate));
    }
    fb.append(section("Palavras com pronúncia pouco clara (toque para ouvir)", c));
  }

  if (r.speechError) fb.append(el("p", "small muted", "Serviço de pronúncia: " + r.speechError));
  box.replaceChildren(fb);
}

/** Resultado do teste de nível. */
export function renderOutcome(box, o) {
  const fb = el("div", "fb");
  fb.setAttribute("role", "status");
  const head = el("div", "row");
  head.style.justifyContent = "space-between";
  head.append(el("h3", null, o.official ? "Resultado do teste de nível" : "Teste concluído, mas não oficial"));
  if (o.official) head.append(el("span", "pill good", "Nível do teste: " + o.sessionLevel));
  fb.append(head);

  if (!o.official) {
    fb.append(el("p", null, "Este teste não pode ser usado para o nível oficial: " + o.reasons.join("; ") + ". Faça o teste de novo com respostas de cerca de um minuto."));
  } else {
    if (o.changed && o.profileBefore) fb.append(el("p", "banner info", `Seu nível oficial mudou de ${o.profileBefore} para ${o.profileAfter}.`));
    else if (o.changed) fb.append(el("p", "banner info", `Seu nível oficial foi definido: ${o.profileAfter}.`));
    else if (!o.profileAfter) fb.append(el("p", null, `Falta${o.sessionsToDefine === 1 ? "" : "m"} ${o.sessionsToDefine} ${o.sessionsToDefine === 1 ? "teste oficial" : "testes oficiais"} para definir seu nível (o nível oficial usa a mediana de 3 testes).`));
    else fb.append(el("p", null, `Seu nível oficial continua ${o.profileAfter}. Ele só muda depois de 3 testes oficiais seguidos acima ou abaixo dele.`));
    if (o.gatedByTask) fb.append(el("p", "banner", "B2 ou acima exige uma resposta argumentativa válida, então o resultado ficou em B1."));
    const cap = capNotice(o);
    if (cap) fb.append(cap);
  }
  if (o.dimensions) fb.append(dimensionGrid(o.dimensions, o.dimensionLevels, null));
  fb.append(el("p", "small muted", "Abaixo, o feedback da última resposta do teste."));
  box.prepend(fb);
}

/** Leitura em voz alta: pinta cada palavra da frase pela nota do Azure. */
export function renderReading(box, target, r, { rate = 1 } = {}) {
  target.replaceChildren();
  const missed = [];
  r.wordScores.forEach((w, i) => {
    const cls = w.errorType === "Omission" ? "miss" : w.accuracy >= 80 ? "ok" : w.accuracy >= 60 ? "extra" : "miss";
    if (cls !== "ok") missed.push(w.word.replace(/[^\w'’-]/g, ""));
    const s = el("span", "w " + cls, w.word);
    s.title = w.errorType === "Omission" ? "palavra pulada" : `nota ${fmtNum(w.accuracy)}`;
    if (i) target.append(" ");
    target.append(s);
  });
  const p = r.pronunciation || {};
  const fb = el("div", "fb");
  const head = el("div", "row");
  head.style.justifyContent = "space-between";
  const acc = p.accuracy ?? 0;
  head.append(el("h3", null, "Resultado da leitura"), el("span", "pill " + (acc >= 85 ? "good" : acc >= 70 ? "warn" : "bad"), acc >= 85 ? "Muito claro" : acc >= 70 ? "Quase lá" : "Treine de novo"));
  fb.append(head);
  const ms = el("div", "meters");
  for (const [label, v] of [["Precisão", p.accuracy], ["Acento", p.stress], ["Prosódia", p.prosody]]) {
    const m = el("div", "meter");
    m.append(el("span", "label", label), el("span", "v", fmtNum(v)), bar(v));
    ms.append(m);
  }
  fb.append(ms);
  if (missed.length) {
    const c = el("div", "chips");
    for (const m of [...new Set(missed)].filter(Boolean)) c.append(listenButton(m, "▶ " + m, rate));
    fb.append(section("Palavras para treinar (toque para ouvir)", c));
  }
  box.replaceChildren(fb);
}
