-- LicitaForce · Agente Termômetro de Pagamento: nota CAPAG (Capacidade de Pagamento) do Tesouro Nacional para
-- estados e municípios, ligada a cada edital pelo órgão comprador.
-- - Fonte: conjuntos abertos do Tesouro Transparente (CKAN). Municípios em XLSX, estados em CSV.
-- - A CAPAG mede a saúde financeira do ente (endividamento, poupança corrente e liquidez), não a pontualidade de
--   cada pagamento: a tela diz isso. Governo federal não tem CAPAG.
-- - Atualização: o pg_cron chama a Vercel toda segunda às 6h (Brasília); o servidor só baixa quando o Tesouro
--   publicou arquivo novo.
-- - Não usa IA. Limite do plano (chave "termometro"): sem limite em todos os planos, exceto Cancelado (0).
BEGIN;

create schema if not exists licitaflow_termometro;
revoke all on schema licitaflow_termometro from public, anon, authenticated;

create table licitaflow_termometro.config (
  id boolean primary key default true check (id),
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  url text not null default 'https://licitaforce-app.vercel.app/api/agentes?agente=termometro&acao=atualizar',
  ativo boolean not null default true,
  recursos jsonb not null default '{}'   -- {municipios: id do arquivo já carregado, estados: id}
);
insert into licitaflow_termometro.config default values;
alter table licitaflow_termometro.config enable row level security;

-- Uma linha por ente: chave 'M:<IBGE 7 dígitos>' (município) ou 'E:<UF>' (estado).
create table public.capag (
  chave         text primary key check (chave ~ '^(M:\d{7}|E:[A-Z]{2})$'),
  esfera        text not null check (esfera in ('M', 'E')),
  ibge          text,
  uf            text not null check (uf ~ '^[A-Z]{2}$'),
  nome          text not null,
  nome_busca    text not null,                 -- nome sem acento, minúsculo (busca e ligação pelo nome)
  nota          text,                          -- A+, A, B+, B, C, D, n.d., n.e.
  indicador1    numeric, nota1 text,           -- endividamento
  indicador2    numeric, nota2 text,           -- poupança corrente
  indicador3    numeric, nota3 text,           -- liquidez
  icf           text,                          -- qualidade da informação contábil e fiscal
  observacao    text,
  posicao       text,                          -- ex.: "01/09/2026" (data da apuração do Tesouro)
  fonte         text,                          -- endereço do arquivo de origem
  atualizado_em timestamptz not null default now()
);
create index capag_busca on public.capag (uf, nome_busca);
alter table public.capag enable row level security;
-- Dado público do Tesouro: qualquer usuário logado lê.
create policy capag_ler on public.capag for select to authenticated using (true);
grant select on public.capag to authenticated;

-- O agente aparece explicitamente em todos os planos: sem limite, exceto Cancelado.
update public.plataforma_planos set limites_ia = limites_ia || jsonb_build_object('termometro',
  case id when 'cancelado' then to_jsonb(0) else 'null'::jsonb end);

-- Para o servidor: arquivos já carregados (para baixar só quando houver novidade).
create function public.termometro_estado(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null or p_token <> (select token from licitaflow_termometro.config where id) then raise exception 'Token inválido'; end if;
  return (select jsonb_build_object('ativo', ativo, 'recursos', recursos) from licitaflow_termometro.config where id);
end $$;

-- Para o servidor: grava um lote de entes e, no fim de um arquivo, o id do arquivo carregado.
-- p_linhas: [{chave, esfera, ibge, uf, nome, nota, indicador1..3, nota1..3, icf, observacao, posicao, fonte}]
create function public.termometro_gravar(p_token text, p_linhas jsonb, p_recurso jsonb default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_token is null or p_token <> (select token from licitaflow_termometro.config where id) then raise exception 'Token inválido'; end if;
  insert into public.capag (chave, esfera, ibge, uf, nome, nome_busca, nota, indicador1, nota1, indicador2, nota2, indicador3, nota3, icf, observacao, posicao, fonte, atualizado_em)
  select l->>'chave', l->>'esfera', l->>'ibge', l->>'uf', l->>'nome', public.oportunidades_normalizar(l->>'nome'), l->>'nota',
         (l->>'indicador1')::numeric, l->>'nota1', (l->>'indicador2')::numeric, l->>'nota2', (l->>'indicador3')::numeric, l->>'nota3',
         l->>'icf', left(l->>'observacao', 500), l->>'posicao', l->>'fonte', now()
  from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) l
  where (l->>'chave') ~ '^(M:\d{7}|E:[A-Z]{2})$'
  on conflict (chave) do update set nome = excluded.nome, nome_busca = excluded.nome_busca, nota = excluded.nota,
    indicador1 = excluded.indicador1, nota1 = excluded.nota1, indicador2 = excluded.indicador2, nota2 = excluded.nota2,
    indicador3 = excluded.indicador3, nota3 = excluded.nota3, icf = excluded.icf, observacao = excluded.observacao,
    posicao = excluded.posicao, fonte = excluded.fonte, atualizado_em = now();
  get diagnostics n = row_count;
  if p_recurso is not null then
    update licitaflow_termometro.config set recursos = recursos || p_recurso where id;
  end if;
  return n;
end $$;

create function licitaflow_termometro.disparar() returns boolean
language plpgsql security definer set search_path = '' as $$
declare c licitaflow_termometro.config;
begin
  select * into c from licitaflow_termometro.config where id;
  if not c.ativo or to_regnamespace('net') is null then return false; end if;
  perform net.http_get(url := c.url, headers := jsonb_build_object('x-coleta', c.token), timeout_milliseconds := 290000);
  return true;
end $$;

revoke execute on function public.termometro_estado(text), public.termometro_gravar(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.termometro_estado(text), public.termometro_gravar(text, jsonb, jsonb) to service_role;
revoke execute on all functions in schema licitaflow_termometro from public, anon, authenticated;

-- Agenda: toda segunda às 6h de Brasília (9h UTC).
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'licitaflow-termometro';
    perform cron.schedule('licitaflow-termometro', '0 9 * * 1', 'select licitaflow_termometro.disparar()');
  end if;
end $$;

COMMIT;
