// Aba Progresso: evolução das quatro dimensões por sessão (SVG) e histórico de níveis oficiais.
import { el } from "./ui.js";
import { DIMENSIONS } from "./feedback.js";
import { BANDS, ANCHOR_SCORES, LEVELS } from "../src/cefr-engine.js";

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const COLORS = { pronunciation: "var(--s1)", fluency: "var(--s2)", grammar: "var(--s3)", vocabulary: "var(--s4)" };
const fmtDate = (s) => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");
const KIND = { test: "Teste de nível", free: "Conversa livre" };

export function lineChart(sessions) {
  const W = 640, H = 270, L = 40, R = 96, T = 12, B = 30;
  const iw = W - L - R, ih = H - T - B;
  const n = sessions.length;
  const x = (i) => L + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => T + ih - (v / 100) * ih;

  const wrap = el("div", "chart-wrap");
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": `Gráfico de linhas: notas de pronúncia, fluência, gramática e vocabulário em ${n} sessões. A tabela abaixo traz os mesmos números.` });

  // faixas de nível: linhas nos limites e rótulo no centro de cada faixa
  for (const b of BANDS.slice(1)) root.append(svg("line", { x1: L, x2: L + iw, y1: y(b.min), y2: y(b.min), class: "grid" }));
  root.append(svg("line", { x1: L, x2: L + iw, y1: y(0), y2: y(0), class: "grid" }));
  LEVELS.forEach((l, i) => { const t = svg("text", { x: L - 8, y: y(ANCHOR_SCORES[i]) + 4, "text-anchor": "end" }); t.textContent = l; root.append(t); });

  const step = Math.max(1, Math.ceil(n / 8));
  sessions.forEach((s, i) => {
    if (i % step && i !== n - 1) return;
    const t = svg("text", { x: x(i), y: H - 8, "text-anchor": "middle" });
    t.textContent = `${i + 1} · ${fmtDate(s.createdAt)}`;
    root.append(t);
  });

  // linhas (quebram onde a dimensão não foi medida) e marcadores com anel da cor da superfície
  const ends = [];
  for (const [k] of DIMENSIONS) {
    let d = "", pen = false;
    sessions.forEach((s, i) => {
      const v = s.dimensions[k];
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    if (d) root.append(svg("path", { d, fill: "none", stroke: COLORS[k], "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    sessions.forEach((s, i) => {
      const v = s.dimensions[k];
      if (v != null) root.append(svg("circle", { cx: x(i), cy: y(v), r: 4, fill: COLORS[k], stroke: "var(--surface)", "stroke-width": 2 }));
    });
    const lastIdx = sessions.map((s) => s.dimensions[k]).findLastIndex((v) => v != null);
    if (lastIdx >= 0) ends.push({ k, y: y(sessions[lastIdx].dimensions[k]) });
  }

  // rótulos diretos no fim das linhas, afastados para não colidir
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);
  const over = ends.length ? ends[ends.length - 1].y - (T + ih) : 0;
  if (over > 0) ends.forEach((e) => { e.y -= over; });
  for (const e of ends) {
    const t = svg("text", { x: L + iw + 10, y: e.y + 4 });
    t.textContent = DIMENSIONS.find(([k]) => k === e.k)[1];
    t.style.fill = "var(--fg)";
    root.append(t);
  }

  // camada de hover: mira vertical + dica com as quatro notas da sessão
  const cross = svg("line", { y1: T, y2: T + ih, stroke: "var(--muted)", "stroke-width": 1, "stroke-dasharray": "3 3", visibility: "hidden" });
  root.append(cross);
  const tip = el("div", "tip");
  tip.hidden = true;
  const colW = n === 1 ? iw : iw / (n - 1);
  sessions.forEach((s, i) => {
    const hit = svg("rect", { x: x(i) - colW / 2, y: T, width: colW, height: ih, fill: "transparent" });
    hit.addEventListener("pointerenter", () => {
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      tip.replaceChildren(el("b", null, `Sessão ${i + 1} · ${fmtDate(s.createdAt)} · ${KIND[s.kind]}${s.level ? " · " + s.level : ""}`));
      for (const [k, label] of DIMENSIONS) {
        const row = el("div", "k"), name = el("span"), sw = el("i");
        sw.style.background = COLORS[k];
        name.append(sw, label);
        row.append(name, el("span", null, s.dimensions[k] == null ? "—" : String(Math.round(s.dimensions[k]))));
        tip.append(row);
      }
      tip.hidden = false;
      const px = (x(i) / W) * wrap.clientWidth;
      tip.style.left = Math.min(Math.max(0, px + 12), wrap.clientWidth - 170) + "px";
      tip.style.top = "8px";
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); tip.hidden = true; });
    root.append(hit);
  });

  wrap.append(root, tip);
  return wrap;
}

function legend() {
  const lg = el("div", "legend");
  for (const [k, label] of DIMENSIONS) { const s = el("span"), i = el("i"); i.style.background = COLORS[k]; s.append(i, label); lg.append(s); }
  return lg;
}

function table(head, rows) {
  const wrap = el("div", "tablewrap"), t = el("table"), th = el("thead"), tr = el("tr");
  head.forEach(([h, num]) => { const c = el("th", num ? "num" : null, h); c.scope = "col"; tr.append(c); });
  th.append(tr);
  const tb = el("tbody");
  for (const r of rows) {
    const row = el("tr");
    r.forEach((v, i) => row.append(el("td", head[i][1] ? "num" : null, v == null ? "—" : String(v))));
    tb.append(row);
  }
  t.append(th, tb);
  wrap.append(t);
  return wrap;
}

export function renderProgress(box, data) {
  box.replaceChildren();
  const { sessions, officialHistory, profile } = data;
  if (!sessions.length) {
    box.append(el("p", "muted", "Ainda não há sessões. Responda algumas perguntas na aba Conversa ou faça o teste de nível."));
    return;
  }
  const ms = el("div", "meters");
  const m1 = el("div", "meter"); m1.append(el("span", "label", "Nível oficial"), el("span", "v", profile.level || "—")); ms.append(m1);
  const m2 = el("div", "meter"); m2.append(el("span", "label", "Testes oficiais"), el("span", "v", String(officialHistory.length))); ms.append(m2);
  const m3 = el("div", "meter"); m3.append(el("span", "label", "Sessões"), el("span", "v", String(sessions.length))); ms.append(m3);
  box.append(ms);

  box.append(el("h3", null, "Evolução por sessão (0–100)"));
  box.append(legend());
  box.append(lineChart(sessions));
  box.append(el("p", "note", "Cada ponto é a média das respostas válidas da sessão, ponderada pelo número de palavras. Sessões só com respostas curtas aparecem sem pontos. As faixas à esquerda mostram a que nível cada nota corresponde."));

  box.append(el("h3", null, "Histórico de níveis oficiais"));
  if (officialHistory.length) {
    box.append(table([["Data"], ["Nível do teste"], ["Nível do perfil depois"]],
      officialHistory.slice().reverse().map((h) => [fmtDate(h.date), h.sessionLevel, h.profileLevel || "ainda não definido"])));
  } else box.append(el("p", "small muted", "Nenhum teste oficial ainda."));

  const details = el("details");
  details.append(el("summary", null, "Ver os números de cada sessão (tabela)"));
  details.append(table([["Data"], ["Tipo"], ["Respostas", 1], ["Pronúncia", 1], ["Fluência", 1], ["Gramática", 1], ["Vocabulário", 1], ["Nível"]],
    sessions.slice().reverse().map((s) => [fmtDate(s.createdAt), KIND[s.kind], `${s.validResponses}/${s.responses}`,
      ...DIMENSIONS.map(([k]) => (s.dimensions[k] == null ? null : Math.round(s.dimensions[k]))), s.level || "—"])));
  box.append(details);
}
