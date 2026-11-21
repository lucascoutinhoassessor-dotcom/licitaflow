-- Peças jurídicas: peça sem data conhecida (anexos de impugnação e esclarecimento quase nunca têm) fica com data nula
-- e é ordenada pela data da sessão. Antes, a coleta gravava a data da sessão como se fosse a da peça.

-- Desfaz o preenchimento antigo (meio-dia do dia da sessão, horário de Brasília).
update public.pecas_juridicas j set data = null
  from public.pecas_processos p
 where p.codigo = j.codigo and j.data = (p.sessao::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo';

-- Relê os dias já coletados para gravar os títulos com o nome do arquivo.
update licitaflow_juridico.dias set concluido_em = null, proxima_pagina = 1, tentado_em = null where proxima_pagina > 1;

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
       and (q is null or j.busca @@ q or p.busca @@ q)
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
