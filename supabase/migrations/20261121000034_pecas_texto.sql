-- Peças jurídicas: a palavra-chave passa a procurar também no começo do texto de cada PDF.
-- Só fica no banco o índice de busca (tsvector sem posições) dos primeiros config.texto_chars caracteres; o texto não.
-- Medido em 21/11/2026 com 41 PDFs reais: ~1,4 KB por peça com 2.000 caracteres (≈25 MB + ~10 MB de GIN em 90 dias).
-- Para economizar espaço, baixe texto_chars (0 desliga) ou janela_dias em licitaflow_juridico.config.

alter table public.pecas_juridicas add column if not exists conteudo tsvector;
create index if not exists pecas_juridicas_conteudo on public.pecas_juridicas using gin (conteudo);
alter table licitaflow_juridico.config add column if not exists texto_chars integer not null default 2000 check (texto_chars between 0 and 10000);

-- Relê tudo o que já foi coletado, agora com o texto.
update licitaflow_juridico.dias set concluido_em = null, proxima_pagina = 1, tentado_em = null where proxima_pagina > 1 or concluido_em is not null;

create or replace function public.pecas_coleta_gravar(p_token text, p_dia date, p_passada smallint, p_pagina integer, p_paginas integer, p_lidos integer, p_processos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p jsonb; n integer := 0; total integer := 0; com integer := 0; chars integer;
begin
  if p_token is null or p_token <> (select token from licitaflow_juridico.config where id) then raise exception 'Token inválido'; end if;
  if jsonb_typeof(coalesce(p_processos, '[]')) <> 'array' or jsonb_array_length(coalesce(p_processos, '[]')) > 200 then raise exception 'Lote inválido'; end if;
  select texto_chars into chars from licitaflow_juridico.config where id;
  for p in select * from jsonb_array_elements(coalesce(p_processos, '[]')) loop
    delete from public.pecas_juridicas where codigo = (p->>'codigo')::integer;
    if jsonb_array_length(coalesce(p->'pecas', '[]')) = 0 then
      delete from public.pecas_processos where codigo = (p->>'codigo')::integer;
      continue;
    end if;
    com := com + 1;
    insert into public.pecas_processos(codigo, orgao, municipio, uf, modalidade, numero, objeto, lei14133, sessao, url, atualizado_em)
    values ((p->>'codigo')::integer, left(coalesce(p->>'orgao',''), 200), left(p->>'municipio', 120), left(p->>'uf', 2), left(p->>'modalidade', 80),
            left(p->>'numero', 60), left(coalesce(p->>'objeto',''), 400), (p->>'lei14133')::boolean, (p->>'sessao')::date, left(p->>'url', 300), now())
    on conflict (codigo) do update set orgao = excluded.orgao, municipio = excluded.municipio, uf = excluded.uf, modalidade = excluded.modalidade,
      numero = excluded.numero, objeto = excluded.objeto, lei14133 = excluded.lei14133, sessao = excluded.sessao, url = excluded.url, atualizado_em = now();
    insert into public.pecas_juridicas(codigo, tipo, papel, titulo, empresa, item, arquivo_url, trecho, data, conteudo)
    select (p->>'codigo')::integer, x->>'tipo', coalesce(x->>'papel', 'pedido'), left(coalesce(x->>'titulo', ''), 200), left(x->>'empresa', 160), left(x->>'item', 40),
           left(x->>'arquivo_url', 300), left(x->>'trecho', 1200), (x->>'data')::timestamptz,
           case when chars > 0 and coalesce(x->>'texto', '') <> ''
                then strip(to_tsvector('pg_catalog.portuguese', public.oportunidades_normalizar(left(x->>'texto', chars)))) end
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
    com_pecas = case when p_pagina = 1 then 0 else com_pecas end + com,
    concluido_em = case when p_pagina >= coalesce(p_paginas, 0) then now() end
  where dia = p_dia and passada = p_passada;
  update licitaflow_juridico.config set ultima_coleta = now() where id;
  delete from public.pecas_processos where sessao < current_date - (select janela_dias from licitaflow_juridico.config where id) - 5;
  return jsonb_build_object('pecas', n);
end $$;
revoke all on function public.pecas_coleta_gravar(text, date, smallint, integer, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.pecas_coleta_gravar(text, date, smallint, integer, integer, integer, jsonb) to service_role;

create or replace function public.buscar_pecas(p_filtros jsonb default '{}', p_pagina integer default 1)
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
    select j.id, j.codigo, j.tipo, j.papel, j.titulo, j.empresa, j.item, j.arquivo_url, j.trecho, j.data,
           coalesce(j.data, p.sessao::timestamp at time zone 'America/Sao_Paulo') ordem
      from public.pecas_juridicas j join public.pecas_processos p on p.codigo = j.codigo
     where j.tipo = any(tipos)
       and (q is null or j.busca @@ q or j.conteudo @@ q or p.busca @@ q)
       and (v_uf = '' or p.uf = v_uf)
       and (org = '' or public.oportunidades_normalizar(p.orgao || ' ' || coalesce(p.municipio, '')) like '%' || org || '%')
       and (not nova or p.lei14133)
  ), pagina as (
    select * from achadas order by ordem desc, id desc offset (p_pagina - 1) * tam limit tam
  )
  select jsonb_build_object(
    'total', (select count(*) from achadas),
    'porTipo', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) n from achadas group by tipo) t), '{}'),
    'data', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'tipo', g.tipo, 'papel', g.papel, 'titulo', g.titulo, 'empresa', g.empresa, 'item', g.item,
        'arquivoUrl', g.arquivo_url, 'trecho', g.trecho, 'data', g.data,
        'processo', jsonb_build_object('codigo', p.codigo, 'orgao', p.orgao, 'municipio', p.municipio, 'uf', p.uf, 'modalidade', p.modalidade,
          'numero', p.numero, 'objeto', p.objeto, 'lei14133', p.lei14133, 'sessao', p.sessao, 'url', p.url))
        order by g.ordem desc, g.id desc)
      from pagina g join public.pecas_processos p on p.codigo = g.codigo), '[]')
  ) into res;
  return res;
end $$;
revoke all on function public.buscar_pecas(jsonb, integer) from public, anon;
grant execute on function public.buscar_pecas(jsonb, integer) to authenticated;

create or replace function public.pecas_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'pecas', (select count(*) from public.pecas_juridicas),
    'comTexto', (select count(*) from public.pecas_juridicas where conteudo is not null),
    'processos', (select count(*) from public.pecas_processos),
    'desde', (select min(sessao) from public.pecas_processos),
    'ate', (select max(sessao) from public.pecas_processos),
    'ultimaColeta', (select ultima_coleta from licitaflow_juridico.config where id),
    'diasPendentes', (select count(*) from licitaflow_juridico.dias where concluido_em is null),
    'diasConcluidos', (select count(*) from licitaflow_juridico.dias where concluido_em is not null)
  ) where auth.uid() is not null;
$$;
revoke all on function public.pecas_status() from public, anon;
grant execute on function public.pecas_status() to authenticated;
