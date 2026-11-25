import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:" + (process.env.PORT || 3001) },
    fs: { allow: [".."] }, // o front importa src/cefr-engine.js e src/questions.js
  },
  build: { outDir: "../dist", emptyOutDir: true },
});
