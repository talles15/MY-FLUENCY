// Função da Vercel: todas as rotas /api/* caem aqui (veja vercel.json).
import { createApp } from "../server/app.js";
import { buildDeps } from "../server/services.js";

const app = createApp(await buildDeps());
export default app;
