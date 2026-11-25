/**
 * Onde ficam os áudios das respostas.
 * - local: pasta no disco (AUDIO_DIR);
 * - supabase: bucket privado "audio" do Supabase Storage. O navegador envia direto para o bucket
 *   com uma URL assinada (as funções da Vercel têm limite de tamanho de requisição).
 * Caminhos sempre começam com o id do usuário: "<userId>/...".
 */
import fs from "node:fs";
import path from "node:path";

export function createFsAudioStore(dir) {
  const full = (p) => {
    const f = path.resolve(dir, p);
    if (!f.startsWith(path.resolve(dir) + path.sep)) throw Object.assign(new Error("Caminho de áudio inválido."), { status: 400 });
    return f;
  };
  return {
    kind: "fs",
    async put(p, bytes) { fs.mkdirSync(path.dirname(full(p)), { recursive: true }); fs.writeFileSync(full(p), bytes); },
    async get(p) { return fs.readFileSync(full(p)); },
    async remove(paths) { for (const p of paths) fs.rmSync(full(p), { force: true }); },
    async exists(p) { return fs.existsSync(full(p)); },
    signedUpload: null,
  };
}

export function createSupabaseAudioStore(sb, bucket = "audio") {
  const st = () => sb.storage.from(bucket);
  const fail = (what, error) => Object.assign(new Error(`Supabase Storage (${what}): ${error.message}`), { status: 502 });
  return {
    kind: "supabase",
    async put(p, bytes, contentType = "audio/wav") {
      const { error } = await st().upload(p, bytes, { contentType, upsert: true });
      if (error) throw fail("enviar", error);
    },
    async get(p) {
      const { data, error } = await st().download(p);
      if (error) throw Object.assign(fail("baixar", error), { status: 404 });
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(paths) {
      if (!paths.length) return;
      const { error } = await st().remove(paths);
      if (error) throw fail("apagar", error);
    },
    /** URL assinada para o navegador enviar o arquivo direto ao bucket. */
    async signedUpload(p) {
      const { data, error } = await st().createSignedUploadUrl(p);
      if (error) throw fail("URL de envio", error);
      return { path: data.path, token: data.token };
    },
  };
}
