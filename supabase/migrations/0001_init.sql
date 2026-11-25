-- Voz Clara: tabelas, segurança (RLS) e bucket de áudio.
-- Rode uma vez no SQL Editor do Supabase (ou com `supabase db push`).

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  level      text check (level in ('A1','A2','B1','B2','C1','C2')),   -- nível oficial (só muda pelo motor)
  history    jsonb not null default '[]'::jsonb,                      -- níveis das sessões oficiais
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('test','free')),
  status         text not null default 'open' check (status in ('open','done')),
  created_at     timestamptz not null default now(),
  finished_at    timestamptz,
  official       boolean,
  level          text,
  result         jsonb,          -- saída completa de assessSession()
  profile_before jsonb,
  profile_after  jsonb
);
create index if not exists sessions_user on public.sessions (user_id, id);

create table if not exists public.responses (
  id          bigint generated always as identity primary key,
  session_id  bigint not null references public.sessions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  position    integer not null,
  question    text not null,
  task_type   text not null,
  transcript  text not null,
  audio_path  text,               -- caminho no bucket "audio"
  assessment  jsonb not null,     -- JSON completo de assessResponse()
  analysis    jsonb,              -- saída validada do LLM
  extra       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists responses_session on public.responses (session_id, position);
create index if not exists responses_user on public.responses (user_id);

-- O servidor usa a chave secreta (ignora RLS) e filtra por user_id.
-- RLS ligado mesmo assim: com a chave pública, cada pessoa só LÊ os próprios dados e não escreve nada.
alter table public.profiles  enable row level security;
alter table public.sessions  enable row level security;
alter table public.responses enable row level security;

drop policy if exists "ler o próprio perfil" on public.profiles;
create policy "ler o próprio perfil" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "ler as próprias sessões" on public.sessions;
create policy "ler as próprias sessões" on public.sessions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "ler as próprias respostas" on public.responses;
create policy "ler as próprias respostas" on public.responses for select to authenticated using (user_id = (select auth.uid()));

-- Bucket privado para os áudios (WAV 16 kHz mono, até 10 MB cada).
-- O navegador envia com URL assinada gerada pelo servidor; não precisa de política de Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', false, 10485760, array['audio/wav'])
on conflict (id) do nothing;
