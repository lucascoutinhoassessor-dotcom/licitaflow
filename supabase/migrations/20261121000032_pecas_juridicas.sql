-- Peças jurídicas publicadas nos portais (aba Jurídico): impugnações, esclarecimentos, intenções de recurso,
-- recursos e contrarrazões. Fonte: Portal de Compras Públicas (API pública, sem captcha; ver docs/pecas-juridicas.md).
-- Índice pequeno: só os dados de cada peça (tipo, empresa, órgão, UF, data, lei, objeto e o link do arquivo).
-- O texto do PDF NÃO é guardado: a função /api/juridico lê o arquivo na hora em que o cliente abre a peça.
-- A coleta roda na Vercel (/api/juridico?acao=coletar). O banco só agenda um GET quando há dia pendente,
-- para não pesar na instância Nano.

create schema if not exists licitaflow_juridico;
revoke all on schema licitaflow_juridico from public, anon, authenticated;

-- Processos que têm ao menos uma peça.
create table public.pecas_processos (
  codigo integer primary key,               -- codigoLicitacao no portal
  portal text not null default 'pcp',
  orgao text not null,
  municipio text,
  uf text,
  modalidade text,
  numero text,
  objeto text not null default '',
  lei14133 boolean,
  sessao date not null,                      -- dia da sessão (início dos lances)
  url text,                                  -- página pública do processo
  atualizado_em timestamptz not null default now(),
  busca tsvector generated always as (
    to_tsvector('pg_catalog.portuguese', public.oportunidades_normalizar(orgao || ' ' || coalesce(municipio,'') || ' ' || coalesce(numero,'') || ' ' || objeto))
  ) stored
);
create index pecas_processos_busca on public.pecas_processos using gin (busca);
create index pecas_processos_sessao on public.pecas_processos (sessao);

create table public.pecas_juridicas (
  id bigint generated always as identity primary key,
  codigo integer not null references public.pecas_processos(codigo) on delete cascade,
  tipo text not null check (tipo in ('impugnacao','esclarecimento','intencao-recurso','recurso','contrarrazoes')),
  papel text not null default 'pedido' check (papel in ('pedido','resposta')),  -- pedido da empresa ou resposta/decisão do órgão
  titulo text not null,
  empresa text,
  item text,
  arquivo_url text,                          -- PDF/arquivo no portal (null nas intenções, que são texto do chat)
  trecho text,                               -- texto curto (intenção de recurso e decisão)
  data timestamptz,
  busca tsvector generated always as (
    to_tsvector('pg_catalog.portuguese', public.oportunidades_normalizar(titulo || ' ' || coalesce(empresa,'') || ' ' || coalesce(trecho,'')))
  ) stored
);
create index pecas_juridicas_codigo on public.pecas_juridicas (codigo);
create index pecas_juridicas_busca on public.pecas_juridicas using gin (busca);
create index pecas_juridicas_tipo_data on public.pecas_juridicas (tipo, data desc);

alter table public.pecas_processos enable row level security;
alter table public.pecas_juridicas enable row level security;
create policy pecas_processos_ler on public.pecas_processos for select to authenticated using (true);
create policy pecas_juridicas_ler on public.pecas_juridicas for select to authenticated using (true);
revoke all on public.pecas_processos, public.pecas_juridicas from public, anon, authenticated;
grant select on public.pecas_processos, public.pecas_juridicas to authenticated;

-- Fila de dias de sessão a varrer. Passada 1: sessão há 21+ dias (impugnações, esclarecimentos, intenções e a maior
-- parte dos recursos). Passada 2: sessão há 60+ dias (recursos e contrarrazões que chegam depois). Janela de 90 dias (~25 MB medidos); mais antigo é apagado.
create table licitaflow_juridico.dias (
  dia date not null,
  passada smallint not null check (passada in (1,2)),
  proxima_pagina integer not null default 1,
  paginas integer,
  processos integer not null default 0,
  com_pecas integer not null default 0,
  concluido_em timestamptz,
  tentado_em timestamptz,
  primary key (dia, passada)
);

create table licitaflow_juridico.config (
  id boolean primary key default true check (id),
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  url text not null default 'https://licitaflow-prod.vercel.app/api/juridico?acao=coletar',
  ativo boolean not null default true,
  janela_dias integer not null default 90,
  ultima_coleta timestamptz
);
insert into licitaflow_juridico.config default values;

-- Garante os dias da janela e devolve o próximo trabalho (ou null).
create function licitaflow_juridico.proximo() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c licitaflow_juridico.config; r licitaflow_juridico.dias;
begin
  select * into c from licitaflow_juridico.config where id;
  insert into licitaflow_juridico.dias(dia, passada)
    select d::date, 1 from generate_series(current_date - c.janela_dias, current_date - 21, interval '1 day') d
    union all
    select d::date, 2 from generate_series(current_date - c.janela_dias, current_date - 60, interval '1 day') d
  on conflict do nothing;
  delete from licitaflow_juridico.dias where dia < current_date - c.janela_dias - 5;
  -- Primeiro o que é mais recente na passada 1 (é o que o cliente mais procura); pedido falho espera 10 min.
  select * into r from licitaflow_juridico.dias
   where concluido_em is null and (tentado_em is null or tentado_em < now() - interval '10 minutes')
   order by passada, dia desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('dia', r.dia, 'passada', r.passada, 'pagina', r.proxima_pagina);
end $$;

-- Chamado pelo pg_cron: só faz o GET na Vercel quando há trabalho e a coleta está ativa.
create function licitaflow_juridico.disparar() returns boolean
language plpgsql security definer set search_path = '' as $$
declare c licitaflow_juridico.config;
begin
  select * into c from licitaflow_juridico.config where id;
  if not c.ativo or licitaflow_juridico.proximo() is null or to_regnamespace('net') is null then return false; end if;
  perform net.http_get(url := c.url, headers := jsonb_build_object('x-coleta', c.token), timeout_milliseconds := 60000);
  return true;
end $$;

-- API da coleta (só a chave de serviço da Vercel chama; o token confere que o pedido veio do agendador).
create function public.pecas_coleta_proximo(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if p_token is null or p_token <> (select token from licitaflow_juridico.config where id) then raise exception 'Token inválido'; end if;
  v := licitaflow_juridico.proximo();
  if v is not null then
    update licitaflow_juridico.dias set tentado_em = now() where dia = (v->>'dia')::date and passada = (v->>'passada')::smallint;
  end if;
  return v;
end $$;

-- Grava uma página: substitui as peças de cada processo e avança a fila.
-- p_processos: [{codigo, orgao, municipio, uf, modalidade, numero, objeto, lei14133, sessao, url,
--                pecas:[{tipo, papel, titulo, empresa, item, arquivo_url, trecho, data}]}]
create function public.pecas_coleta_gravar(p_token text, p_dia date, p_passada smallint, p_pagina integer, p_paginas integer, p_lidos integer, p_processos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p jsonb; n integer := 0; total integer := 0;
begin
  if p_token is null or p_token <> (select token from licitaflow_juridico.config where id) then raise exception 'Token inválido'; end if;
  if jsonb_typeof(coalesce(p_processos, '[]')) <> 'array' or jsonb_array_length(coalesce(p_processos, '[]')) > 200 then raise exception 'Lote inválido'; end if;
  for p in select * from jsonb_array_elements(coalesce(p_processos, '[]')) loop
    delete from public.pecas_juridicas where codigo = (p->>'codigo')::integer;
    if jsonb_array_length(coalesce(p->'pecas', '[]')) = 0 then
      delete from public.pecas_processos where codigo = (p->>'codigo')::integer;
      continue;
    end if;
    insert into public.pecas_processos(codigo, orgao, municipio, uf, modalidade, numero, objeto, lei14133, sessao, url, atualizado_em)
    values ((p->>'codigo')::integer, left(coalesce(p->>'orgao',''), 200), left(p->>'municipio', 120), left(p->>'uf', 2), left(p->>'modalidade', 80),
            left(p->>'numero', 60), left(coalesce(p->>'objeto',''), 400), (p->>'lei14133')::boolean, (p->>'sessao')::date, left(p->>'url', 300), now())
    on conflict (codigo) do update set orgao = excluded.orgao, municipio = excluded.municipio, uf = excluded.uf, modalidade = excluded.modalidade,
      numero = excluded.numero, objeto = excluded.objeto, lei14133 = excluded.lei14133, sessao = excluded.sessao, url = excluded.url, atualizado_em = now();
    insert into public.pecas_juridicas(codigo, tipo, papel, titulo, empresa, item, arquivo_url, trecho, data)
    select (p->>'codigo')::integer, x->>'tipo', coalesce(x->>'papel', 'pedido'), left(coalesce(x->>'titulo', ''), 200), left(x->>'empresa', 160), left(x->>'item', 40),
           left(x->>'arquivo_url', 300), left(x->>'trecho', 1200), (x->>'data')::timestamptz
      from jsonb_array_elements(p->'pecas') x
     where x->>'tipo' in ('impugnacao','esclarecimento','intencao-recurso','recurso','contrarrazoes')
     limit 60;
    get diagnostics total = row_count;
    n := n + total;
    total := 0;
  end loop;
  update licitaflow_juridico.dias set
    proxima_pagina = p_pagina + 1, paginas = p_paginas, tentado_em = null,
    processos = case when p_pagina = 1 then 0 else processos end + coalesce(p_lidos, 0),
    com_pecas = case when p_pagina = 1 then 0 else com_pecas end + jsonb_array_length(coalesce(p_processos, '[]')),
    concluido_em = case when p_pagina >= coalesce(p_paginas, 0) then now() end
  where dia = p_dia and passada = p_passada;
  update licitaflow_juridico.config set ultima_coleta = now() where id;
  delete from public.pecas_processos where sessao < current_date - (select janela_dias from licitaflow_juridico.config where id) - 5;
  return jsonb_build_object('pecas', n);
end $$;

revoke all on all functions in schema licitaflow_juridico from public, anon, authenticated;
revoke all on function public.pecas_coleta_proximo(text), public.pecas_coleta_gravar(text, date, smallint, integer, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.pecas_coleta_proximo(text), public.pecas_coleta_gravar(text, date, smallint, integer, integer, integer, jsonb) to service_role;

-- Pesquisa do cliente. Filtros: busca (termos separados por ";" = qualquer um), tipos, uf, orgao, novaLei.
create function public.buscar_pecas(p_filtros jsonb default '{}', p_pagina integer default 1)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare q tsquery; parte text; termo text := trim(coalesce(p_filtros->>'busca', '')); tipos text[]; v_uf text := upper(coalesce(p_filtros->>'uf', ''));
  org text := public.oportunidades_normalizar(trim(coalesce(p_filtros->>'orgao', ''))); nova boolean := coalesce((p_filtros->>'novaLei')::boolean, false);
  tam constant integer := 20; res jsonb;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_pagina is null or p_pagina not between 1 and 500 or length(termo) > 300 or length(org) > 120 or v_uf !~ '^([A-Z]{2})?$' then raise exception 'Filtros inválidos'; end if;
  select array_agg(x) into tipos from jsonb_array_elements_text(coalesce(p_filtros->'tipos', '["impugnacao","esclarecimento","intencao-recurso","recurso","contrarrazoes"]')) x;
  if coalesce(array_length(tipos, 1), 0) = 0 then raise exception 'Selecione ao menos um tipo de peça'; end if;
  foreach parte in array string_to_array(termo, ';') loop
    if public.oportunidades_termos(parte) is not null then q := case when q is null then public.oportunidades_termos(parte) else q || public.oportunidades_termos(parte) end; end if;
  end loop;
  if termo <> '' and q is null then raise exception 'Informe uma palavra-chave para pesquisar'; end if;
  with achadas as materialized (
    select j.id, j.codigo, j.tipo, j.papel, j.titulo, j.empresa, j.item, j.arquivo_url, j.trecho, j.data
      from public.pecas_juridicas j join public.pecas_processos p on p.codigo = j.codigo
     where j.tipo = any(tipos)
       and (q is null or j.busca @@ q or p.busca @@ q)
       and (v_uf = '' or p.uf = v_uf)
       and (org = '' or public.oportunidades_normalizar(p.orgao || ' ' || coalesce(p.municipio, '')) like '%' || org || '%')
       and (not nova or p.lei14133)
  ), pagina as (
    select * from achadas order by data desc nulls last, id desc offset (p_pagina - 1) * tam limit tam
  )
  select jsonb_build_object(
    'total', (select count(*) from achadas),
    'porTipo', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) n from achadas group by tipo) t), '{}'),
    'data', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'tipo', g.tipo, 'papel', g.papel, 'titulo', g.titulo, 'empresa', g.empresa, 'item', g.item,
        'arquivoUrl', g.arquivo_url, 'trecho', g.trecho, 'data', g.data,
        'processo', jsonb_build_object('codigo', p.codigo, 'orgao', p.orgao, 'municipio', p.municipio, 'uf', p.uf, 'modalidade', p.modalidade,
          'numero', p.numero, 'objeto', p.objeto, 'lei14133', p.lei14133, 'sessao', p.sessao, 'url', p.url))
        order by g.data desc nulls last, g.id desc)
      from pagina g join public.pecas_processos p on p.codigo = g.codigo), '[]')
  ) into res;
  return res;
end $$;

-- Cobertura para a tela: quantas peças, desde quando, última coleta e o andamento da carga.
create function public.pecas_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'pecas', (select count(*) from public.pecas_juridicas),
    'processos', (select count(*) from public.pecas_processos),
    'desde', (select min(sessao) from public.pecas_processos),
    'ate', (select max(sessao) from public.pecas_processos),
    'ultimaColeta', (select ultima_coleta from licitaflow_juridico.config where id),
    'diasPendentes', (select count(*) from licitaflow_juridico.dias where concluido_em is null),
    'diasConcluidos', (select count(*) from licitaflow_juridico.dias where concluido_em is not null)
  ) where auth.uid() is not null;
$$;

revoke all on function public.buscar_pecas(jsonb, integer), public.pecas_status() from public, anon;
grant execute on function public.buscar_pecas(jsonb, integer), public.pecas_status() to authenticated;

-- Agenda (só onde o pg_cron existe; em testes locais é ignorado). A cada 5 min, e só chama a Vercel se houver dia pendente.
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'licitaflow-pecas-juridicas';
    perform cron.schedule('licitaflow-pecas-juridicas', '*/5 * * * *', 'select licitaflow_juridico.disparar()');
  end if;
end $$;
