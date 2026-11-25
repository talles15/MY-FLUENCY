import { $, el, LEVEL_NAMES, MIC_SVG, store, say, listenButton } from "./ui.js";
import { api } from "./api.js";
import { LEVELS } from "../src/cefr-engine.js";
import { TOPICS, bandOf } from "../src/questions.js";

const state = {
  trainingLevel: store.get("level", "B1"),
  profileLevel: null,
  topic: store.get("topic", Object.keys(TOPICS)[0]),
  question: null, // { q, taskType }
};

/* ---------- escada de níveis ---------- */
function renderLadder() {
  const lad = $("ladder");
  lad.replaceChildren();
  for (const l of LEVELS) {
    const b = el("button", "rung");
    b.type = "button";
    b.setAttribute("aria-pressed", String(l === state.trainingLevel));
    b.setAttribute("aria-label", `Treinar no nível ${l}, ${LEVEL_NAMES[l]}` + (l === state.profileLevel ? " (seu nível oficial)" : ""));
    if (l === state.profileLevel) b.classList.add("est");
    b.append(el("b", null, l), el("span", null, LEVEL_NAMES[l]));
    b.onclick = () => { state.trainingLevel = l; store.set("level", l); renderLadder(); nextQuestion(); };
    lad.append(b);
  }
}

/* ---------- abas (com setas do teclado) ---------- */
const tabs = [["tab-talk", "p-talk"], ["tab-read", "p-read"], ["tab-prog", "p-prog"]];
function selectTab(t) {
  for (const [t2, p2] of tabs) {
    const on = t2 === t;
    $(t2).setAttribute("aria-selected", String(on));
    $(t2).tabIndex = on ? 0 : -1;
    $(p2).hidden = !on;
  }
}
tabs.forEach(([t], i) => {
  $(t).onclick = () => selectTab(t);
  $(t).onkeydown = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const j = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    selectTab(tabs[j][0]);
    $(tabs[j][0]).focus();
  };
});

/* ---------- conversa ---------- */
function addMsg(role, text) {
  const m = el("div", "msg " + (role === "assistant" ? "bot" : "me"));
  const who = el("div", "who", role === "assistant" ? "Tutor" : "Você");
  if (role === "assistant") who.append(listenButton(text, "▶ ouvir", state.trainingLevel < "B1" ? 0.85 : 1));
  const body = el("div", null, text);
  if (role === "assistant") body.lang = "en";
  m.append(who, body);
  $("chat").append(m);
  $("chat").scrollTop = $("chat").scrollHeight;
  return m;
}

function nextQuestion() {
  const list = TOPICS[state.topic][bandOf(state.trainingLevel)];
  const pool = list.filter((x) => !state.question || x.q !== state.question.q);
  state.question = pool[Math.floor(Math.random() * pool.length)] || list[0];
  addMsg("assistant", state.question.q);
}

const topicSel = $("topic");
for (const t of Object.keys(TOPICS)) topicSel.append(new Option(t, t));
topicSel.value = state.topic;
topicSel.onchange = () => { state.topic = topicSel.value; store.set("topic", state.topic); $("chat").replaceChildren(); nextQuestion(); };
$("restart").onclick = nextQuestion;

/* ---------- serviços ---------- */
async function checkServices() {
  try {
    const h = await api.health();
    const missing = [];
    if (!h.services.speech) missing.push("o serviço de pronúncia (Azure Speech)");
    if (!h.services.llm) missing.push("a análise por IA (Anthropic)");
    if (missing.length) {
      $("svc-banner").textContent = `O servidor está sem chave para ${missing.join(" e ")}. Preencha o arquivo .env e reinicie o servidor.`;
      $("svc-banner").hidden = false;
    }
  } catch {
    $("svc-banner").textContent = "Não consegui falar com o servidor. Ele está rodando? Use npm run dev.";
    $("svc-banner").hidden = false;
  }
}

/* ---------- início ---------- */
$("mic-talk").innerHTML = MIC_SVG;
$("mic-read").innerHTML = MIC_SVG;
$("live-talk").replaceChildren(el("span", "muted small", "A gravação chega na próxima fase."));
$("open-about").onclick = () => $("about").showModal();
$("open-flags").onclick = () => $("flags-dialog").showModal();
renderLadder();
nextQuestion();
checkServices();
void say;
