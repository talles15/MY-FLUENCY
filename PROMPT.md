# Prompt para colar no Claude Code

## Antes de colar

1. Crie uma pasta para o projeto (ex.: `voz-clara`) e copie para dentro dela **todo o conteúdo desta pasta**
   (`CLAUDE.md`, `PROMPT.md`, `package.json`, `src/`, `prompts/`, `data/`, `fixtures/`, `test/`).
2. O protótipo atual já vem em `legacy/voz-clara.html`.
3. Tenha em mãos: uma chave da API da Anthropic e uma chave do Azure Speech (região + chave). Se preferir
   outro serviço de pronúncia, troque o nome no passo 2 do prompt.
4. Abra o terminal na pasta, rode `claude` e cole o texto abaixo.

---

```
Leia CLAUDE.md, src/cefr-engine.js, prompts/analise-llm.md, fixtures/examples.js e legacy/voz-clara.html
antes de começar. Rode `npm test` e confirme que tudo passa.

Objetivo: transformar o protótipo legacy/voz-clara.html num app web local que grava a fala do aluno,
mede pronúncia e fluência a partir do áudio, analisa gramática e vocabulário com o Claude e calcula
a nota e o nível CEFR exclusivamente com src/cefr-engine.js.

Trabalhe em fases. Ao fim de cada fase: rode os testes, faça um commit e me mostre um resumo curto
do que mudou e do que eu preciso testar no navegador. Não avance de fase com teste quebrado.

FASE 1 — Estrutura
- Node 20+, ES modules. Front-end com Vite (JavaScript puro, sem framework) reaproveitando o visual
  e as três abas do protótipo (Conversa, Pronúncia, Progresso). Back-end Express em server/.
- .env.example com ANTHROPIC_API_KEY, ANTHROPIC_MODEL (padrão claude-sonnet-5-5), AZURE_SPEECH_KEY,
  AZURE_SPEECH_REGION. Nenhuma chave no front-end.
- Scripts: `npm run dev` (front + back), `npm test`.

FASE 2 — Áudio, pronúncia e tempos por palavra
- No navegador, gravar com MediaRecorder e enviar o áudio para POST /api/assess junto com
  { question, taskType }.
- No servidor, converter para WAV PCM 16 kHz mono (ffmpeg-static) e chamar o Azure Speech com
  Pronunciation Assessment em modo sem roteiro (sem texto de referência), granularidade de fonema,
  prosódia ativada e tempos por palavra.
- Escrever server/normalize-azure.js que transforma a resposta do Azure em
    words: [{ word, start, end }]            (segundos, com a pontuação do texto exibido)
    pronunciation: { accuracy, stress, prosody, unintelligiblePer100 }
  (stress: média das palavras sem erro de acento, se o Azure não der uma nota direta; unintelligiblePer100:
  palavras com accuracy < 40 por 100 palavras). Testar com um JSON do Azure salvo em fixtures/, sem rede.
- Se o serviço de pronúncia falhar, seguir com pronunciation = null e a flag "pronuncia_estimada".

FASE 3 — Análise com o Claude
- server/analyze.js: chama a API da Anthropic com o prompt de prompts/analise-llm.md, preenchendo
  {{QUESTION}}, {{TRANSCRIPT}} e {{TASK_TYPE}}. Validar a saída com zod; se o JSON vier inválido,
  tentar uma vez de novo mostrando o erro; se falhar de novo, devolver erro 502 legível.
- POST /api/assess monta { transcript, words, pronunciation, analysis, wordlist, taskType } e chama
  assessResponse() do motor. A lista de palavras é carregada uma vez na subida do servidor
  (mergeWordlists das duas CSVs de data/).
- O nível nunca vem do LLM. Remova do protótipo qualquer pedido de "cefr" ou nota ao modelo.

FASE 4 — Sessões e nível oficial
- Um "teste de nível" com 3 perguntas de tipos diferentes: describe, narrate e argument (nessa ordem,
  com perguntas que sobem de dificuldade). Ao fim, assessSession() e updateProfileLevel().
- Na conversa livre, cada resposta mostra só o nível indicativo; o nível do perfil só muda pelas regras
  do motor.
- Persistência local em SQLite (better-sqlite3): tabelas users, sessions, responses (guardar o JSON
  completo de assessResponse e o áudio em disco, com caminho na tabela).

FASE 5 — Feedback na tela
- Para cada resposta: as quatro notas com barra 0–100 e nível de cada dimensão; aviso quando o teto
  foi aplicado ("seu vocabulário limitou o nível a B1"); palavras usadas agrupadas por nível CEFR com
  destaque para B2+; erros de gramática e vocabulário com correção e explicação em português;
  2–3 palavras sugeridas de nível acima; a versão corrigida com botão de ouvir (speechSynthesis).
- Aba Progresso: evolução das quatro dimensões por sessão (gráfico de linhas simples em SVG) e o
  histórico de níveis oficiais.
- Explique cada flag (amostra_curta, fora_do_tema, possivel_leitura, pronuncia_estimada) em português.

FASE 6 — Calibração
- scripts/calibrate.js: lê data/calibracao/*.json, cada um com { audioFile, question, taskType,
  teacherLevel }, roda o pipeline completo e imprime: concordância exata com o professor, concordância
  com ±1 nível, matriz de confusão e, para cada métrica de ANCHORS, a mediana observada por nível
  do professor ao lado da âncora atual.
- Não altere ANCHORS automaticamente: gere data/calibracao/sugestao-ancoras.json e me mostre as
  diferenças maiores que 15% para eu decidir.

Restrições
- Não mude pesos, faixas nem regras de src/cefr-engine.js sem me perguntar. Se precisar mudar o motor,
  mantenha a API pública e adicione testes.
- Os seis exemplos de fixtures/examples.js continuam classificados no nível esperado.
- Interface em português do Brasil, acessível (rótulos nos botões, foco visível, contraste AA) e
  funcionando no celular.
- Ao terminar cada fase, liste qualquer suposição que você fez.
```

---

## O que cada arquivo faz

| Arquivo | Para que serve |
| --- | --- |
| `CLAUDE.md` | Regras permanentes do projeto; o Claude Code lê sozinho a cada sessão. |
| `src/cefr-engine.js` | Motor de pontuação: âncoras, notas por dimensão, teto, nível, sessão, histerese. Sem dependências. |
| `prompts/analise-llm.md` | Prompt que faz o Claude devolver erros, expressões e estruturas em JSON (sem nota). |
| `data/*.csv` | Listas de palavras por nível CEFR (CEFR-J e Octanove), com atribuição em `data/ATRIBUICAO.md`. |
| `fixtures/examples.js` | As seis respostas de exemplo do documento, com análise e áudio sintético. |
| `test/cefr-engine.test.js` | 15 testes (`npm test`), todos passando. |
