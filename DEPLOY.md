# Publicar o Voz Clara (Supabase + Vercel)

O app publicado é privado: só entra quem estiver em `ALLOWED_EMAILS` **e** cadastrado no Supabase.
As chaves secretas ficam só na Vercel; o navegador recebe apenas a URL e a chave pública do Supabase.

## 1. Supabase

1. Crie um projeto em supabase.com (região **South America (São Paulo)**).
2. **SQL Editor → New query**: cole o conteúdo de `supabase/migrations/0001_init.sql` e clique em **Run**.
   Isso cria as tabelas `profiles`, `sessions` e `responses` (com RLS) e o bucket privado `audio`.
3. **Authentication → Sign In / Providers**: deixe **Email** ligado e **desligue "Allow new users to sign up"**.
4. **Authentication → Users → Add user → Create new user**: cadastre o seu e-mail
   (marque "Auto Confirm User").
5. **Authentication → URL Configuration**:
   - Site URL: o endereço da Vercel (ex.: `https://voz-clara.vercel.app`) — volte aqui depois do passo 2.3;
   - Redirect URLs: adicione o mesmo endereço e `http://localhost:5173` (para testar local).
6. **Project Settings → API Keys**: anote a URL do projeto, a chave **publishable** (ou "anon") e a
   chave **secret** (ou "service_role"). A secreta nunca vai para o navegador nem para o git.

## 2. Vercel

1. **Add New → Project** e importe o repositório do GitHub. A Vercel lê o `vercel.json`
   (build `npm run build`, saída `dist/`, API em `api/index.js`).
2. **Settings → Environment Variables** (Production e Preview):

   | Variável | Valor |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | sua chave da Anthropic |
   | `ANTHROPIC_MODEL_FREE` | `claude-haiku-5-5` (conversa livre) |
   | `ANTHROPIC_MODEL_TEST` | `claude-sonnet-5-5` (teste de nível) |
   | `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | chave e região do Azure Speech |
   | `SUPABASE_URL` | URL do projeto |
   | `SUPABASE_PUBLISHABLE_KEY` | chave publishable/anon |
   | `SUPABASE_SECRET_KEY` | chave secret/service_role |
   | `ALLOWED_EMAILS` | o seu e-mail |

3. **Deploy**. Copie o endereço gerado e coloque no Supabase (passo 1.5).
4. Abra o app, digite o seu e-mail e entre pelo link que chegar.

A Vercel publica em produção o branch principal do repositório. Outros branches viram
"Preview Deployments" (também com login).

## Como os pedaços conversam

```
navegador ── grava, converte para WAV 16 kHz ──► Supabase Storage (bucket "audio", URL assinada)
    │
    └── POST /api/assess { audioPath } ──► função da Vercel (api/index.js)
                                              ├─ confere o login no Supabase + ALLOWED_EMAILS
                                              ├─ baixa o WAV do Storage
                                              ├─ Azure Speech: transcrição, pronúncia, tempos
                                              ├─ Claude: Haiku (conversa) ou Sonnet (teste)
                                              ├─ cefr-engine.js: notas e nível
                                              └─ grava em profiles / sessions / responses
```

## Rodar local

- **Sem Supabase** (deixe `SUPABASE_*` vazios): SQLite em `data/voz-clara.db`, áudios em `data/audio/`, sem login.
- **Com Supabase** (preencha `SUPABASE_*` e `ALLOWED_EMAILS` no `.env`): igual à Vercel, com login.

`npm run dev` e abra http://localhost:5173.

## Custos (estimativa por resposta)

- Claude Haiku 5.5 (conversa livre): ~US$ 0,001. Claude Sonnet 5.5 (teste de nível): ~US$ 0,02.
- Azure Speech: cobrado por hora de áudio — confira o preço da sua região.
- Supabase e Vercel: os planos gratuitos costumam bastar para um usuário.

Para comparar a análise do Haiku com a do Sonnet nas suas amostras:
`npm run calibrate -- --model claude-haiku-5-5` e depois `npm run calibrate -- --model claude-sonnet-5-5`.
