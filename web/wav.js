// Converte a gravação do navegador (webm/mp4) em WAV 16 kHz mono antes de enviar.
// Assim o servidor (Vercel) não precisa de ffmpeg, e o Azure recebe o formato que espera.
import { encodeWav, TARGET_RATE } from "../src/wav.js";

export async function blobToWav16k(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.ceil(decoded.duration * TARGET_RATE);
    const off = new OfflineAudioContext(1, length, TARGET_RATE); // 1 canal: o navegador mistura para mono
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const out = await off.startRendering();
    return new Blob([encodeWav(out.getChannelData(0), TARGET_RATE)], { type: "audio/wav" });
  } finally {
    ctx.close().catch(() => {});
  }
}
