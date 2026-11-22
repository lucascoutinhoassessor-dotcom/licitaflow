-- LicitaFlow · Agente Leitor de editais (Claude API).
-- A leitura de um edital público é a mesma para qualquer cliente: fica guardada uma vez por número de
-- controle do PNCP e é reaproveitada sem novo custo. Só o servidor (chave de serviço) grava e lê essa tabela.
-- O consumo de IA fica por organização: os membros veem o da própria org; o master vê tudo.
BEGIN;

create table public.ia_leituras_edital (
  controle        text primary key check (controle ~ '^\d{14}-1-\d{1,9}/\d{4}$'),
  objeto          text,
  resultado       jsonb not null,
  documentos      jsonb not null default '[]',
  modelo          text not null,
  tokens_entrada  integer not null default 0,
  tokens_saida    integer not null default 0,
  custo_usd       numeric(10,4) not null default 0,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table public.ia_leituras_edital enable row level security;
-- Sem políticas: acesso só pelo servidor.

create table public.ia_uso (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete set null,
  agente          text not null check (agente ~ '^[a-z0-9-]{2,40}$'),
  referencia      text,
  nova            boolean not null default true,  -- false = leitura reaproveitada, sem custo de IA
  tokens_entrada  integer not null default 0,
  tokens_saida    integer not null default 0,
  custo_usd       numeric(10,4) not null default 0,
  created_at      timestamptz not null default now()
);
create index ia_uso_org_data on public.ia_uso (org_id, created_at desc);
alter table public.ia_uso enable row level security;
create policy ia_uso_ler on public.ia_uso for select to authenticated
  using (public.is_member(org_id) or public.is_platform_admin());
-- Sem política de escrita: só o servidor registra o consumo.

COMMIT;
