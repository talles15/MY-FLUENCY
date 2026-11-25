import { $, el, LEVEL_NAMES, MIC_SVG, STOP_SVG, store, say, listenButton } from "./ui.js";
import { api } from "./api.js";
import { createRecorder, canRecord } from "./recorder.js";
import { renderFeedback, renderReading } from "./feedback.js";
import { LEVELS } from "../src/cefr-engine.js";
import { TOPICS, SENTENCES, bandOf } from "../src/questions.js";

const state = {
  trainingLevel: store.get("level", "B1"),
  profileLevel: null,
  topic: store.get("topic", Object.keys(TOPICS)[0]),
  question: null, // { q, taskType }
  typing: !canRecord(),
  take: null, // última gravação { blob, seconds, fallbackTranscript }
  busy: false,
  sentence: "",
};
const ttsRate = () => (state.trainingLevel < "B1" ? 0.85 : 1);

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
    b.onclick = () => { state.trainingLevel = l; store.set("level", l); renderLadder(); nextQuestion(); newSentence(); };
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
  if (role === "assistant") who.append(listenButton(text, "▶ ouvir", ttsRate()));
  const body = el("div", null, text);
  body.lang = "en";
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

/* ---------- gravação ---------- */
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function setMic(btn, on, idleLabel) {
  btn.classList.toggle("on", on);
  btn.innerHTML = on ? STOP_SVG : MIC_SVG;
  btn.setAttribute("aria-label", on ? "Parar de gravar" : idleLabel);
}
function liveMsg(id, text, cls = "muted small") { $(id).replaceChildren(el("span", cls, text)); }

const talkRec = createRecorder({ onTick: (s) => liveMsg("live-talk", `● Gravando ${fmt(s)} — fale em inglês. Toque no botão de novo para parar.`, "rec-status on") });
const readRec = createRecorder({ onTick: (s) => liveMsg("live-read", `● Gravando ${fmt(s)} — leia a frase.`, "rec-status on") });

function micError(id, e) {
  const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
  liveMsg(id, denied ? "Sem permissão para o microfone. Libere o acesso no navegador ou digite a resposta." : "Não consegui abrir o microfone: " + (e && e.message));
}

$("mic-talk").onclick = async () => {
  if (state.busy) return;
  if (talkRec.active) {
    const take = await talkRec.stop();
    setMic($("mic-talk"), false, "Começar a gravar a resposta");
    if (!take || take.seconds < 1.5) { liveMsg("live-talk", "Gravação curta demais. Tente de novo."); return; }
    state.take = take;
    liveMsg("live-talk", `Resposta gravada (${fmt(take.seconds)}). Envie para avaliar ou grave de novo.`, "small");
    $("send-talk").disabled = false;
    $("send-talk").focus();
    return;
  }
  try {
    state.take = null;
    $("send-talk").disabled = true;
    await talkRec.start();
    setMic($("mic-talk"), true, "");
  } catch (e) { micError("live-talk", e); }
};

function showTyping(on) {
  state.typing = on;
  $("type-talk").hidden = !on;
  $("live-talk").hidden = on;
  $("mic-talk").hidden = on;
  $("toggle-type").textContent = on ? "Falar em vez de digitar" : "Digitar em vez de falar";
  $("toggle-type").hidden = !canRecord();
  $("send-talk").disabled = on ? !$("type-talk").value.trim() : !state.take;
}
$("toggle-type").onclick = () => { if (talkRec.active) talkRec.cancel(); setMic($("mic-talk"), false, "Começar a gravar a resposta"); showTyping(!state.typing); };
$("type-talk").oninput = () => { $("send-talk").disabled = !$("type-talk").value.trim(); };

function clearTalk() {
  if (talkRec.active) talkRec.cancel();
  setMic($("mic-talk"), false, "Começar a gravar a resposta");
  state.take = null;
  $("type-talk").value = "";
  liveMsg("live-talk", "Toque no microfone e responda em inglês. Toque de novo para parar.");
  $("send-talk").disabled = true;
}
$("clear-talk").onclick = clearTalk;

async function sendTalk() {
  if (state.busy) return;
  const text = state.typing ? $("type-talk").value.trim() : "";
  const take = state.typing ? null : state.take;
  if (!text && !take) return;
  state.busy = true;
  $("send-talk").disabled = true;
  addMsg("user", text || "🎙️ resposta gravada");
  const wait = el("p", "small muted", "Avaliando sua resposta… (pode levar uns 15 segundos)");
  wait.setAttribute("role", "status");
  $("fb-talk").replaceChildren(wait);
  try {
    const r = await api.assess({
      question: state.question.q,
      taskType: state.question.taskType,
      text,
      fallbackTranscript: take ? take.fallbackTranscript : "",
    }, take && take.blob);
    const last = $("chat").lastElementChild;
    if (last && r.transcript) last.lastElementChild.textContent = r.transcript;
    renderFeedback($("fb-talk"), r, { rate: ttsRate() });
    clearTalk();
    nextQuestion();
  } catch (e) {
    $("fb-talk").replaceChildren(el("p", "banner bad", e.message));
    $("send-talk").disabled = false;
  } finally {
    state.busy = false;
  }
}
$("send-talk").onclick = sendTalk;

/* ---------- pronúncia ---------- */
function newSentence() {
  const list = SENTENCES[state.trainingLevel];
  const pool = list.filter((s) => s !== state.sentence);
  state.sentence = pool[Math.floor(Math.random() * pool.length)];
  $("target").textContent = state.sentence;
  $("fb-read").replaceChildren();
  liveMsg("live-read", "Ouça o modelo, depois toque no microfone e leia a frase.");
}
$("next-sent").onclick = newSentence;
$("listen-model").onclick = () => say(state.sentence, ttsRate());

$("mic-read").onclick = async () => {
  if (readRec.active) {
    const take = await readRec.stop();
    setMic($("mic-read"), false, "Começar a gravar a leitura");
    if (!take || take.seconds < 1) { liveMsg("live-read", "Gravação curta demais. Tente de novo."); return; }
    liveMsg("live-read", "Avaliando a leitura…");
    try {
      const r = await api.read(state.sentence, take.blob);
      liveMsg("live-read", "Pronto. Veja o resultado abaixo.", "small");
      renderReading($("fb-read"), $("target"), r, { rate: ttsRate() });
    } catch (e) {
      liveMsg("live-read", e.message, "small");
    }
    return;
  }
  try { await readRec.start(); setMic($("mic-read"), true, ""); } catch (e) { micError("live-read", e); }
};

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
setMic($("mic-talk"), false, "Começar a gravar a resposta");
setMic($("mic-read"), false, "Começar a gravar a leitura");
$("mic-read").disabled = !canRecord();
$("open-about").onclick = () => $("about").showModal();
$("open-flags").onclick = () => $("flags-dialog").showModal();
renderLadder();
nextQuestion();
newSentence();
clearTalk();
showTyping(state.typing);
checkServices();
