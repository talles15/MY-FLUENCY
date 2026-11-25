// Utilidades de DOM e fala, sem framework.
export const $ = (id) => document.getElementById(id);

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export const LEVEL_NAMES = { A1: "Iniciante", A2: "Básico", B1: "Intermediário", B2: "Interm. alto", C1: "Avançado", C2: "Proficiente" };

export const MIC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>';
export const STOP_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

export const store = {
  get(k, d) { try { const v = localStorage.getItem("vozclara:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("vozclara:" + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
};

/** Lê um texto em inglês com a voz do navegador (speechSynthesis). */
export function say(text, rate = 1) {
  try {
    if (!("speechSynthesis" in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate;
    const v = speechSynthesis.getVoices().find((x) => /^en(-|_)US/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* sem síntese de voz */ }
}

export function listenButton(text, label = "▶ ouvir", rate = 1) {
  const b = el("button", "speak", label);
  b.type = "button";
  b.setAttribute("aria-label", "Ouvir em inglês: " + text);
  b.onclick = () => say(text, rate);
  return b;
}
