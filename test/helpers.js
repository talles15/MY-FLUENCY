import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/** Sobe o app numa porta livre e devolve a URL base. */
export async function listen(app) {
  const srv = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

/** Gera alguns segundos de áudio WebM/Opus (um tom), como o MediaRecorder do Chrome. */
export function makeWebm(seconds = 2) {
  const r = spawnSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}:sample_rate=48000`, "-c:a", "libopus", "-f", "webm", "pipe:1"], { maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(String(r.stderr));
  return r.stdout;
}

export function form(fields, audio) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  if (audio) f.append("audio", new Blob([audio], { type: "audio/webm" }), "resposta.webm");
  return f;
}
