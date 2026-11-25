import express from "express";

/**
 * Cria o app Express. As dependências externas (Azure, Anthropic, banco) entram por parâmetro
 * para que os testes possam trocar por versões falsas, sem rede.
 */
export function createApp(deps = {}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      services: {
        speech: !!deps.speechConfigured,
        llm: !!deps.llmConfigured,
      },
    });
  });

  app.use("/api", (_req, res) => res.status(404).json({ error: "Rota não encontrada." }));
  return app;
}
