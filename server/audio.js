import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { wavInfo, isWav16kMono, TARGET_RATE } from "../src/wav.js";

/**
 * Garante WAV PCM 16 kHz mono 16 bits.
 * - O navegador já envia nesse formato (web/wav.js): o arquivo passa direto, sem ffmpeg.
 * - Outros formatos (ex.: áudios da calibração) são convertidos com ffmpeg-static, que só é
 *   carregado aqui e fica de fora do pacote da Vercel.
 */
export async function toWav16kMono(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (isWav16kMono(bytes)) return bytes;

  let ffmpegPath;
  try { ({ default: ffmpegPath } = await import("ffmpeg-static")); } catch { ffmpegPath = null; }
  if (!ffmpegPath) {
    throw Object.assign(new Error("O áudio precisa chegar em WAV 16 kHz mono (o navegador faz essa conversão). Atualize a página e grave de novo."), { status: 400 });
  }
  const tmp = path.join(os.tmpdir(), `vozclara-${crypto.randomUUID()}`);
  await fs.writeFile(tmp, bytes);
  try {
    return await new Promise((resolve, reject) => {
      const args = ["-hide_banner", "-loglevel", "error", "-i", tmp, "-ac", "1", "-ar", String(TARGET_RATE), "-acodec", "pcm_s16le", "-f", "wav", "pipe:1"];
      const p = spawn(ffmpegPath, args);
      const out = [], err = [];
      p.stdout.on("data", (d) => out.push(d));
      p.stderr.on("data", (d) => err.push(d));
      p.on("error", reject);
      p.on("close", (code) => {
        const wav = Buffer.concat(out);
        if (code !== 0 || wav.length <= 44) reject(Object.assign(new Error("Não consegui ler o áudio enviado. " + Buffer.concat(err).toString().trim()), { status: 400 }));
        else resolve(wav);
      });
    });
  } finally {
    fs.rm(tmp, { force: true }).catch(() => {});
  }
}

/** Separa o PCM do cabeçalho WAV. */
export function pcmFromWav(wav) {
  const w = wavInfo(wav);
  if (!w) throw new Error("WAV sem bloco de dados.");
  return wav.subarray(w.dataOffset, w.dataOffset + w.dataLength);
}

/** Duração em segundos de um WAV PCM 16 kHz mono 16 bits. */
export const wavSeconds = (wav) => pcmFromWav(wav).length / (TARGET_RATE * 2);
