-- LicitaFlow · Análise de empresas: resumo por fornecedor dos contratos publicados no PNCP.
--
-- Guarda só UMA linha por empresa (CNPJ): contratos, valor total, maior contrato, período, UFs dos órgãos
-- contratantes e o último órgão. Os contratos em si não são guardados (o detalhe fica no PNCP), para caber
-- no plano gratuito (500 MB). Estimativa: ~170 bytes por empresa; 180 dias ≈ 250–300 mil empresas ≈ 40–50 MB.
--
-- Fonte: https://pncp.gov.br/api/consulta/v1/contratos (filtro pela data de publicação no PNCP),
-- ~9.400 contratos por dia útil, páginas de 500 (~870 KB, ~10 s cada).
-- Só pessoa jurídica (CPF de pessoa física não é guardado) e só despesa (receita=false).
--
-- Contagem sem duplicidade: cada página de um dia é processada uma única vez, porque o job da página é
-- concluído na mesma transação que soma os contratos ao resumo.

create table public.fornecedores_resumo (
  cnpj text primary key check (cnpj ~ '^[0-9]{14}$'),
  nome text not null,
  contratos integer not null default 0,
  valor_total numeric not null default 0,
  maior_valor numeric not null default 0,
  primeiro date,
  ultimo date,
  ufs integer not null default 0,      -- um bit por UF do órgão contratante (ordem de licitaflow_coleta.ufs())
  orgao_ultimo text,
  atualizado_em timestamptz not null default now()
);
create index fornecedores_nome_busca on public.fornecedores_resumo
  using gin (to_tsvector('pg_catalog.portuguese', public.oportunidades_normalizar(nome)));
alter table public.fornecedores_resumo enable row level security;
create policy fornecedores_ler on public.fornecedores_resumo for select to authenticated using ((select auth.uid()) is not null);
revoke all on public.fornecedores_resumo from public, anon, authenticated;
grant select on public.fornecedores_resumo to authenticated;

-- ============ Coletor de contratos (separado do coletor de editais) ============
create table licitaflow_coleta.contratos_estado (
  id boolean primary key default true check (id),
  ativo boolean not null default true,
  desde_dias integer not null default 180 check (desde_dias between 1 and 730),
  planejado_em timestamptz,
  ultima_coleta_em timestamptz
);
insert into licitaflow_coleta.contratos_estado(id) values (true);

create table licitaflow_coleta.contratos_jobs (
  dia date not null,
  pagina integer not null,
  request_id bigint,
  agendada_em timestamptz,
  concluido boolean not null default false,
  concluida_em timestamptz,
  tentativas integer not null default 0,
  erro text,
  registros integer,
  total_paginas integer,
  proxima_em timestamptz not null default now(),
  primary key (dia, pagina)
);
create index contratos_jobs_fila on licitaflow_coleta.contratos_jobs(dia desc, pagina) where not concluido;
alter table licitaflow_coleta.contratos_estado enable row level security;
alter table licitaflow_coleta.contratos_jobs enable row level security;

create function licitaflow_coleta.ufs() returns text[]
language sql immutable set search_path='' as $$
 select '{AC,AL,AP,AM,BA,CE,DF,ES,GO,MA,MT,MS,MG,PA,PB,PR,PE,PI,RJ,RN,RS,RO,RR,SC,SP,SE,TO}'::text[]
$$;

-- Data AAAA-MM-DD da fonte; devolve null para valores inválidos ou fora de 1990..amanhã.
create function licitaflow_coleta.data_segura(p text) returns date
language plpgsql stable set search_path='' as $$
declare d date;
begin
 if p is null or p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then return null; end if;
 d := left(p, 10)::date;
 if d < date '1990-01-01' or d > current_date + 1 then return null; end if;
 return d;
exception when others then return null;
end;$$;

-- Soma uma página de contratos ao resumo por fornecedor.
create function licitaflow_coleta.registrar_contratos(p_contratos jsonb) returns integer
language plpgsql set search_path='' as $$
declare v_linhas integer;
begin
 if jsonb_typeof(p_contratos) <> 'array' or jsonb_array_length(p_contratos) > 1000 then raise exception 'Página de contratos inválida'; end if;
 with c as (
  select x->>'niFornecedor' cnpj,
         left(coalesce(nullif(trim(x->>'nomeRazaoSocialFornecedor'), ''), x->>'niFornecedor'), 200) nome,
         case when v.valor between 0 and 1e11 then v.valor else 0 end valor,
         coalesce(licitaflow_coleta.data_segura(x->>'dataAssinatura'), licitaflow_coleta.data_segura(x->>'dataPublicacaoPncp')) dia,
         coalesce(1 << (array_position(licitaflow_coleta.ufs(), x#>>'{unidadeOrgao,ufSigla}') - 1), 0) bit,
         left(x#>>'{orgaoEntidade,razaoSocial}', 200) orgao
    from jsonb_array_elements(p_contratos) x
    cross join lateral (select case
       when jsonb_typeof(x->'valorGlobal') = 'number' then (x->>'valorGlobal')::numeric
       when jsonb_typeof(x->'valorInicial') = 'number' then (x->>'valorInicial')::numeric
       else 0 end valor) v
   where x->>'tipoPessoa' = 'PJ'
     and x->>'niFornecedor' ~ '^[0-9]{14}$'
     and coalesce(x->>'receita', 'false') <> 'true'
 ), g as (
  select cnpj, (array_agg(nome order by dia desc nulls last))[1] nome, count(*)::integer n, sum(valor) total, max(valor) maior,
         min(dia) pri, max(dia) ult, bit_or(bit) ufs, (array_agg(orgao order by dia desc nulls last))[1] orgao
    from c group by cnpj
 )
 insert into public.fornecedores_resumo as f (cnpj, nome, contratos, valor_total, maior_valor, primeiro, ultimo, ufs, orgao_ultimo)
 select cnpj, nome, n, total, maior, pri, ult, ufs, orgao from g
 on conflict (cnpj) do update set
   contratos = f.contratos + excluded.contratos,
   valor_total = f.valor_total + excluded.valor_total,
   maior_valor = greatest(f.maior_valor, excluded.maior_valor),
   primeiro = least(f.primeiro, excluded.primeiro),
   ultimo = greatest(f.ultimo, excluded.ultimo),
   ufs = f.ufs | excluded.ufs,
   nome = case when excluded.ultimo >= coalesce(f.ultimo, excluded.ultimo) then excluded.nome else f.nome end,
   orgao_ultimo = case when excluded.ultimo >= coalesce(f.ultimo, excluded.ultimo) then coalesce(excluded.orgao_ultimo, f.orgao_ultimo) else f.orgao_ultimo end,
   atualizado_em = now();
 get diagnostics v_linhas = row_count;
 return v_linhas;
end;$$;

-- Executado pelo pg_cron a cada 30 s: um pedido de 500 contratos por vez.
create function licitaflow_coleta.tick_contratos() returns jsonb
language plpgsql set search_path='' as $$
declare j record; r record; d jsonb; est record; ontem date := (now() at time zone 'America/Sao_Paulo')::date - 1;
 ate timestamptz; novo bigint; processados integer := 0; enviados integer := 0; desistir boolean;
begin
 if not pg_try_advisory_xact_lock(73481042) then return '{"ocupado":true}'::jsonb; end if;
 select * into est from licitaflow_coleta.contratos_estado where id for update;
 if not est.ativo then return '{"ativo":false}'::jsonb; end if;

 -- 1. Respostas dos pedidos em voo.
 for j in select * from licitaflow_coleta.contratos_jobs where request_id is not null and not concluido loop
  desistir := j.tentativas >= 12;
  select * into r from net._http_response where id = j.request_id order by created desc limit 1;
  if not found then
   if j.agendada_em < now() - interval '3 minutes' then
    delete from net.http_request_queue where id = j.request_id;
    update licitaflow_coleta.contratos_jobs set request_id = null, proxima_em = now() + interval '2 minutes', erro = 'Tempo de resposta excedido',
      concluido = desistir, concluida_em = case when desistir then now() end where dia = j.dia and pagina = j.pagina;
   end if;
   continue;
  end if;
  begin
   if r.status_code = 429 then
    ate := licitaflow_coleta.esperar_fonte(coalesce(r.headers->>'retry-after', r.headers->>'Retry-After'));
    update licitaflow_coleta.estado set pausa_ate = greatest(pausa_ate, ate) where id;
    update licitaflow_coleta.contratos_jobs set request_id = null, proxima_em = ate, erro = 'Limite temporário da fonte' where dia = j.dia and pagina = j.pagina;
   elsif r.status_code = 404 then
    update licitaflow_coleta.contratos_jobs set request_id = null, concluido = true, concluida_em = now(), erro = 'Página não encontrada na fonte' where dia = j.dia and pagina = j.pagina;
   elsif r.status_code in (200, 204) and not coalesce(r.timed_out, false) and r.error_msg is null then
    d := case when r.status_code = 204 then '{"data":[],"totalPaginas":0}'::jsonb else r.content::jsonb end;
    if jsonb_typeof(d->'data') <> 'array' or (d->>'totalPaginas')::integer is null then raise exception 'Resposta de contratos inválida'; end if;
    if (d->>'totalPaginas')::integer > 1000 then raise exception 'Fonte excedeu limite de paginação'; end if;
    perform licitaflow_coleta.registrar_contratos(d->'data');
    if j.pagina = 1 then
     insert into licitaflow_coleta.contratos_jobs(dia, pagina) select j.dia, p from generate_series(2, (d->>'totalPaginas')::integer) p on conflict do nothing;
    end if;
    update licitaflow_coleta.contratos_jobs set request_id = null, concluido = true, concluida_em = now(), erro = null,
      registros = jsonb_array_length(d->'data'), total_paginas = (d->>'totalPaginas')::integer where dia = j.dia and pagina = j.pagina;
    update licitaflow_coleta.contratos_estado set ultima_coleta_em = now() where id;
    processados := processados + 1;
   else
    update licitaflow_coleta.contratos_jobs set request_id = null, erro = 'Falha temporária na fonte',
      proxima_em = now() + make_interval(secs => least(900, 30 * power(2, least(j.tentativas, 5)))::integer),
      concluido = desistir, concluida_em = case when desistir then now() end where dia = j.dia and pagina = j.pagina;
   end if;
  exception when others then
   update licitaflow_coleta.contratos_jobs set request_id = null, proxima_em = now() + interval '15 minutes', erro = 'Resposta incompatível ou incompleta da fonte',
     concluido = desistir, concluida_em = case when desistir then now() end where dia = j.dia and pagina = j.pagina;
  end;
  delete from net._http_response where id = j.request_id;
 end loop;

 -- 2. Planejamento (de hora em hora): página 1 de cada dia da janela; descarta jobs fora dela.
 if est.planejado_em is null or est.planejado_em < now() - interval '1 hour' then
  insert into licitaflow_coleta.contratos_jobs(dia, pagina)
  select g::date, 1 from generate_series(ontem - est.desde_dias + 1, ontem, interval '1 day') g on conflict do nothing;
  delete from licitaflow_coleta.contratos_jobs where dia < ontem - est.desde_dias + 1 and request_id is null;
  update licitaflow_coleta.contratos_estado set planejado_em = now() where id;
 end if;

 -- 3. Envio: um pedido por vez, respeitando a pausa pedida pela fonte (compartilhada com o coletor de editais).
 if coalesce((select pausa_ate from licitaflow_coleta.estado where id), '-infinity') > now() then
  return jsonb_build_object('processados', processados, 'pausado', true);
 end if;
 if not exists (select 1 from licitaflow_coleta.contratos_jobs where request_id is not null and not concluido) then
  select * into j from licitaflow_coleta.contratos_jobs where not concluido and request_id is null and proxima_em <= now()
   order by dia desc, pagina limit 1 for update skip locked;
  if found then
   novo := net.http_get(url := 'https://pncp.gov.br/api/consulta/v1/contratos',
     params := jsonb_build_object('dataInicial', to_char(j.dia, 'YYYYMMDD'), 'dataFinal', to_char(j.dia, 'YYYYMMDD'), 'pagina', j.pagina, 'tamanhoPagina', 500),
     timeout_milliseconds := 60000);
   update licitaflow_coleta.contratos_jobs set request_id = novo, agendada_em = now(), tentativas = tentativas + 1 where dia = j.dia and pagina = j.pagina;
   -- Conta no mesmo limite de pedidos por minuto do coletor de editais.
   insert into licitaflow_coleta.envios(request_id) values (novo) on conflict do nothing;
   enviados := 1;
  end if;
 end if;
 return jsonb_build_object('processados', processados, 'enviados', enviados);
end;$$;

-- ============ Consulta para a tela ============
create function public.fornecedores_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'dias_planejados', e.desde_dias,
  'dias_coletados', (select count(*) from (select dia from licitaflow_coleta.contratos_jobs group by dia
       having bool_and(concluido) and max(total_paginas) filter (where pagina = 1) is not null) x),
  'paginas_pendentes', (select count(*) from licitaflow_coleta.contratos_jobs where not concluido),
  'ultima_coleta_em', e.ultima_coleta_em)
 from licitaflow_coleta.contratos_estado e where e.id and auth.uid() is not null;
$$;

create function public.buscar_fornecedores(p_termo text default '', p_uf text default '', p_pagina integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_ufs text[] := '{AC,AL,AP,AM,BA,CE,DF,ES,GO,MA,MT,MS,MG,PA,PB,PR,PE,PI,RJ,RN,RS,RO,RR,SC,SP,SE,TO}'::text[]; termo text := trim(coalesce(p_termo, '')); digitos text; q tsquery; v_bit integer := 0; res jsonb; tam integer := 20;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
 if p_pagina is null or p_pagina not between 1 and 500 or length(termo) > 128 then raise exception 'Filtros inválidos'; end if;
 if coalesce(p_uf, '') <> '' then
  if array_position(v_ufs, p_uf) is null then raise exception 'UF inválida'; end if;
  v_bit := 1 << (array_position(v_ufs, p_uf) - 1);
 end if;
 digitos := regexp_replace(termo, '[^0-9]', '', 'g');
 if termo !~ '[A-Za-zÀ-ÿ]' and length(digitos) = 14 then
  termo := '';
 else
  digitos := null;
  q := public.oportunidades_termos(termo);
  if termo <> '' and q is null then raise exception 'Informe um nome ou CNPJ para pesquisar'; end if;
 end if;
 with filtrados as materialized (
  select f.* from public.fornecedores_resumo f
   where (digitos is null or f.cnpj = digitos)
     and (q is null or to_tsvector('pg_catalog.portuguese', public.oportunidades_normalizar(f.nome)) @@ q)
     and (v_bit = 0 or f.ufs & v_bit <> 0)
 ), pagina as (
  select * from filtrados order by valor_total desc, cnpj limit tam offset (p_pagina - 1) * tam
 )
 select jsonb_build_object(
  'data', coalesce((select jsonb_agg(jsonb_build_object(
      'cnpj', p.cnpj, 'nome', p.nome, 'contratos', p.contratos, 'valor_total', p.valor_total, 'maior_valor', p.maior_valor,
      'primeiro', p.primeiro, 'ultimo', p.ultimo, 'orgao_ultimo', p.orgao_ultimo,
      'ufs', (select coalesce(jsonb_agg(u order by u), '[]'::jsonb) from unnest(v_ufs) with ordinality t(u, i) where p.ufs & (1 << (i::integer - 1)) <> 0))
      order by p.valor_total desc, p.cnpj) from pagina p), '[]'::jsonb),
  'totalRegistros', (select count(*) from filtrados),
  'totalPaginas', ceil((select count(*) from filtrados)::numeric / tam),
  'status', public.fornecedores_status()) into res;
 return res;
end;$$;

revoke all on function licitaflow_coleta.ufs(), licitaflow_coleta.data_segura(text), licitaflow_coleta.registrar_contratos(jsonb), licitaflow_coleta.tick_contratos() from public, anon, authenticated;
revoke all on function public.fornecedores_status(), public.buscar_fornecedores(text, text, integer) from public, anon;
grant execute on function public.fornecedores_status(), public.buscar_fornecedores(text, text, integer) to authenticated;

-- Agenda o coletor (só onde o pg_cron existe; em testes locais é ignorado).
do $$
begin
 if to_regclass('cron.job') is not null then
  perform cron.unschedule(jobid) from cron.job where jobname = 'licitaflow-coleta-contratos';
  perform cron.schedule('licitaflow-coleta-contratos', '30 seconds', 'select licitaflow_coleta.tick_contratos()');
 end if;
end;$$;
