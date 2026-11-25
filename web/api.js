// Chamadas ao back-end. Toda chave de API fica no servidor.
async function handle(res) {
  let body = null;
  try { body = await res.json(); } catch { /* resposta sem JSON */ }
  if (!res.ok) {
    const err = new Error((body && body.error) || `Erro ${res.status} no servidor.`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  health: () => fetch("/api/health").then(handle),
};
