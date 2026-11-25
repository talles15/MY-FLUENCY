# CLAUDE.md — Voz Clara (prática de inglês falado com nível CEFR)

## O que é
App para brasileiros praticarem inglês falado. Cada resposta em áudio recebe notas 0–100 em pronúncia,
fluência, gramática e vocabulário, e a sessão gradua o aluno de A1 a C2.

## Regras que não podem ser quebradas
- **Quem dá a nota e o nível é `src/cefr-engine.js`, nunca o LLM.** O LLM só devolve o JSON de análise
  descrito em `prompts/analise-llm.md` (erros, expressões, estruturas, unidades T).
- Pesos das dimensões: 25% cada (decisão do dono do produto em 25/11/2026). Não mude sem pedir.
- Âncoras, faixas e regras ficam só nas constantes do topo de `cefr-engine.js` (`ANCHORS`, `BANDS`,
  `RULES`, `STRUCTURES`). Não espalhe números mágicos pelo código.
- Regras de graduação: teto pela dimensão mais fraca (+1 nível), resposta < 40 palavras não conta,
  nível oficial exige 3 respostas de tarefas diferentes e 150 palavras, B2+ exige tarefa `argument`,
  o nível do perfil só muda após 3 sessões seguidas.
- Textos da interface e feedback em português do Brasil; perguntas e exemplos em inglês.
- Chaves de API só em `.env` (nunca no front-end nem no git). Há um `.env.example`.

## Comandos
- `npm test` — testes do motor (node:test, sem rede). Têm de continuar passando.
- Os seis exemplos do documento de critérios estão em `fixtures/examples.js` e são testes de regressão:
  se uma mudança de âncora mudar o nível de algum deles, isso precisa ser intencional e explicado.

## Dados
- `data/cefrj-vocabulary-profile-1.5.csv` (CEFR-J, A1–B2) e `data/octanove-vocabulary-profile-c1c2-1.0.csv`
  (C1–C2). Uso comercial permitido com citação; a Octanove é CC BY-SA 4.0. Manter a atribuição em
  `data/ATRIBUICAO.md` e numa tela "Sobre" do app.

## Documento de referência
"Avaliação de vocabulário e níveis de fluência (CEFR)" — https://claude.ai/artifact/PNQ8B8vnbKFaQFfwA8UTCB
