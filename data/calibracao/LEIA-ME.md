# Amostras de calibração

Coloque aqui um `.json` por amostra e o áudio correspondente (de preferência numa subpasta `audio/`,
que fica fora do git):

```json
{
  "audioFile": "audio/aluno-07-viagem.webm",
  "question": "Tell me about a memorable trip or experience you had.",
  "taskType": "narrate",
  "teacherLevel": "B1"
}
```

- `taskType`: `describe`, `narrate`, `opinion` ou `argument`.
- `teacherLevel`: `A1`, `A2`, `B1`, `B2`, `C1` ou `C2` (nível dado pelo professor a essa resposta).
- Use respostas de pelo menos 40 palavras; as mais curtas são marcadas pelo motor.

Rode `npm run calibrate`. Os resultados do Azure e do Claude ficam em cache em `.cache/` (cada amostra
só é paga uma vez); `--offline` usa só o cache e `--no-cache` refaz tudo. O script grava
`sugestao-ancoras.json` e mostra as diferenças maiores que 15% — ele nunca altera `ANCHORS`.
