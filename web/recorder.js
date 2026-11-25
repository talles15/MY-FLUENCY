// Gravação com MediaRecorder. Em paralelo, se o navegador tiver reconhecimento de fala
// (Chrome/Edge), guarda uma transcrição de reserva para o caso de o serviço de pronúncia falhar.

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

export function createRecorder({ onTick } = {}) {
  let stream = null, rec = null, chunks = [], t0 = 0, timer = null, sr = null, backup = "";

  function startBackupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      sr = new SR();
      sr.lang = "en-US";
      sr.continuous = true;
      sr.interimResults = false;
      sr.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) backup += e.results[i][0].transcript + " ";
      };
      sr.onerror = () => {};
      sr.start();
    } catch { sr = null; }
  }

  return {
    get active() { return !!rec && rec.state === "recording"; },

    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
      rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks = [];
      backup = "";
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.start(250);
      t0 = performance.now();
      timer = setInterval(() => onTick && onTick((performance.now() - t0) / 1000), 250);
      startBackupRecognition();
    },

    /** Para e devolve { blob, seconds, fallbackTranscript }. */
    stop() {
      return new Promise((resolve) => {
        if (!rec) return resolve(null);
        clearInterval(timer);
        const seconds = (performance.now() - t0) / 1000;
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          rec = null;
          // dá um instante para o reconhecimento de reserva entregar o último trecho
          setTimeout(() => resolve({ blob, seconds, fallbackTranscript: backup.trim() }), sr ? 400 : 0);
          if (sr) { try { sr.stop(); } catch { /* já parado */ } sr = null; }
        };
        rec.stop();
      });
    },

    cancel() {
      clearInterval(timer);
      try { if (rec && rec.state !== "inactive") rec.stop(); } catch { /* ok */ }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (sr) { try { sr.abort(); } catch { /* ok */ } sr = null; }
      rec = null;
    },
  };
}

export const extFor = (blob) => (/mp4/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : "webm");
