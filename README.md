# Voz Clara

App web local para brasileiros praticarem inglês falado. Grava a resposta, mede pronúncia e fluência a
partir do áudio (Azure Speech), analisa gramática e vocabulário com o Claude e calcula nota e nível CEFR
(A1–C2) exclusivamente com `src/cefr-engine.js`.

## Rodar

```bash
npm install
cp .env.example .env   # preencha ANTHROPIC_API_KEY, AZURE_SPEECH_KEY e AZURE_SPEECH_REGION
npm run dev            # abra http://localhost:5173
```

Node 20.19 ou mais novo. O microfone exige `localhost` ou HTTPS.

- `npm test` — testes sem rede
- `npm run calibrate` — calibração contra níveis de professores (veja `data/calibracao/LEIA-ME.md`)
- `npm run build && npm start` — versão de produção em http://localhost:3001

Os dados ficam em `data/voz-clara.db` (SQLite) e os áudios em `data/audio/`, ambos fora do git.
Regras do projeto: `CLAUDE.md`.
