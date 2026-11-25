/**
 * WAV PCM 16 bits mono — usado no navegador (para gerar o arquivo) e no servidor (para reconhecê-lo).
 * Sem dependências.
 */
export const TARGET_RATE = 16000;

/** Float32 [-1, 1] -> WAV PCM 16 bits mono (ArrayBuffer). */
export function encodeWav(samples, sampleRate = TARGET_RATE) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

/** Lê o cabeçalho de um WAV (Uint8Array/Buffer). Devolve null se não for WAV PCM. */
export function wavInfo(bytes) {
  if (!bytes || bytes.length < 44) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let i = 12, fmt = null;
  while (i + 8 <= bytes.length) {
    const id = tag(i), size = v.getUint32(i + 4, true);
    if (id === "fmt ") fmt = { format: v.getUint16(i + 8, true), channels: v.getUint16(i + 10, true), sampleRate: v.getUint32(i + 12, true), bits: v.getUint16(i + 22, true) };
    if (id === "data") return fmt && { ...fmt, dataOffset: i + 8, dataLength: Math.min(size, bytes.length - i - 8) };
    i += 8 + size + (size % 2);
  }
  return null;
}

export const isWav16kMono = (bytes) => {
  const w = wavInfo(bytes);
  return !!w && w.format === 1 && w.channels === 1 && w.sampleRate === TARGET_RATE && w.bits === 16;
};
