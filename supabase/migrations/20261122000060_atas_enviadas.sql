-- LicitaFlow · Atas enviadas pelos usuários para compras federais.
--
-- Os dados abertos do Compras.gov só trazem as empresas homologadas; perdedoras, desclassificadas e inabilitadas
-- ficam no termo de julgamento / ata da sessão, que o portal só entrega com captcha. O usuário baixa o PDF lá
-- e envia na página da compra; o servidor lê o arquivo e guarda aqui a leitura (não o PDF), por compra,
-- para todos os usuários verem. Escrita só pelo servidor (service role); leitura para quem está logado.
BEGIN;

create table if not exists public.atas_enviadas (
  id_compra   text not null check (id_compra ~ '^\d{15,20}$'),
  hash        text not null check (hash ~ '^[0-9a-f]{64}$'),
  arquivo     text not null check (length(arquivo) between 1 and 200),
  resultado   jsonb not null,
  enviado_por uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (id_compra, hash)
);

alter table public.atas_enviadas enable row level security;
drop policy if exists atas_enviadas_sel on public.atas_enviadas;
create policy atas_enviadas_sel on public.atas_enviadas for select to authenticated using (true);
grant select on public.atas_enviadas to authenticated;

COMMIT;
