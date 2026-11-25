// Renderização do resultado de cada resposta e da leitura.
import { el, listenButton } from "./ui.js";

const fmtNum = (v, d = 0) => (v == null ? "—" : Number(v).toFixed(d));

/** Fase 2: mostra transcrição e pronúncia medidas a partir do áudio. */
export function renderFeedback(box, r) {
  const fb = el("div", "fb");
  fb.append(el("h3", null, "Sua resposta — nível indicativo " + (r.result.indicativeLevel || "—")));
  const d = r.result.dimensions;
  fb.append(el("p", "small", `Pronúncia ${fmtNum(d.pronunciation)} · Fluência ${fmtNum(d.fluency)} · Gramática ${fmtNum(d.grammar)} · Vocabulário ${fmtNum(d.vocabulary)}`));
  const t = el("p", null, r.transcript);
  t.lang = "en";
  fb.append(t);
  const p = r.pronunciation;
  fb.append(el("p", "small muted", p
    ? `Precisão ${fmtNum(p.accuracy)} · Acento ${fmtNum(p.stress)} · Prosódia ${fmtNum(p.prosody)} · Ininteligíveis ${fmtNum(p.unintelligiblePer100, 1)}/100 palavras`
    : "Sem medida de pronúncia nesta resposta."));
  box.replaceChildren(fb);
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
    m.append(el("span", "label", label), el("span", "v", fmtNum(v)));
    const bar = el("div", "bar"), i = el("i");
    i.style.width = Math.max(0, Math.min(100, v || 0)) + "%";
    bar.append(i);
    m.append(bar);
    ms.append(m);
  }
  fb.append(ms);
  if (missed.length) {
    const c = el("div", "chips");
    for (const m of [...new Set(missed)].filter(Boolean)) c.append(listenButton(m, "▶ " + m, rate));
    const d = el("div");
    d.append(el("div", "label", "Palavras para treinar (toque para ouvir)"), c);
    fb.append(d);
  }
  box.replaceChildren(fb);
}

/** Resultado do teste de nível (fase 4: resumo simples). */
export function renderOutcome(box, o) {
  const fb = el("div", "fb");
  fb.append(el("h3", null, o.official ? `Resultado do teste: ${o.sessionLevel}` : "Teste concluído, mas não oficial"));
  if (!o.official) fb.append(el("p", null, "Motivos: " + o.reasons.join("; ") + "."));
  else if (o.changed) fb.append(el("p", null, `Seu nível oficial agora é ${o.profileAfter}.`));
  else if (!o.profileAfter) fb.append(el("p", null, `Faltam ${o.sessionsToDefine} teste(s) para definir seu nível oficial.`));
  else fb.append(el("p", null, `Seu nível oficial continua ${o.profileAfter}. Ele só muda depois de 3 testes seguidos acima ou abaixo.`));
  box.append(fb);
}
