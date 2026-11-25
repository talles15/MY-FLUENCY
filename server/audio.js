import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import ffmpegPath from "ffmpeg-static";

/**
 * Converte qualquer áudio do navegador (webm/opus, mp4/aac, ogg...) em WAV PCM 16 kHz mono 16 bits.
 * Usa arquivo temporário em vez de pipe porque MP4 do Safari precisa de busca no arquivo.
 */
export async function toWav16kMono(input) {
  const tmp = path.join(os.tmpdir(), `vozclara-${crypto.randomUUID()}`);
  await fs.writeFile(tmp, input);
  try {
    return await new Promise((resolve, reject) => {
      const args = ["-hide_banner", "-loglevel", "error", "-i", tmp, "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le", "-f", "wav", "pipe:1"];
      const p = spawn(ffmpegPath, args);
      const out = [], err = [];
      p.stdout.on("data", (d) => out.push(d));
      p.stderr.on("data", (d) => err.push(d));
      p.on("error", reject);
      p.on("close", (code) => {
        const wav = Buffer.concat(out);
        if (code !== 0 || wav.length <= 44) reject(new Error("Não consegui ler o áudio enviado. " + Buffer.concat(err).toString().trim()));
        else resolve(wav);
      });
    });
  } finally {
    fs.rm(tmp, { force: true }).catch(() => {});
  }
}

/** Separa o PCM do cabeçalho WAV (procura o bloco "data"). */
export function pcmFromWav(wav) {
  let i = 12;
  while (i + 8 <= wav.length) {
    const id = wav.toString("ascii", i, i + 4);
    const size = wav.readUInt32LE(i + 4);
    if (id === "data") return wav.subarray(i + 8, Math.min(wav.length, i + 8 + size));
    i += 8 + size + (size % 2);
  }
  throw new Error("WAV sem bloco de dados.");
}

/** Duração em segundos de um WAV PCM 16 kHz mono 16 bits. */
export const wavSeconds = (wav) => pcmFromWav(wav).length / (16000 * 2);
