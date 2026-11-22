-- LicitaFlow · Atalhos de Oportunidades e controle de cada botão pelo master.
-- 1) Recursos (botões/ações dentro das telas) entram em plataforma_modulos com id "recurso-...", com os mesmos
--    estados dos módulos (liberado, teste, em_breve, oculto). Os já existentes continuam liberados.
-- 2) localizar_edital: acha um edital do catálogo pelo número da compra (com ou sem ano), UASG, código do Compras.gov,
--    CNPJ do órgão ou número de controle do PNCP.
-- 3) buscar_desertas ganha o filtro "portal" (id de portais.ts; '' = todos).
BEGIN;

insert into public.plataforma_modulos(id, estado) values
  ('recurso-localizar-edital','liberado'), ('recurso-sem-vencedor','liberado'), ('recurso-sem-vencedor-portal','liberado'),
  ('recurso-importar-oportunidade','liberado'), ('recurso-codigo-comprasnet','liberado'), ('recurso-inverter-ordem','liberado'),
  ('recurso-exportar-csv','liberado')
on conflict (id) do nothing;

-- Índices das chaves de busca por número.
create index if not exists oportunidades_numero_compra on public.oportunidades_indice
  ((ltrim(regexp_replace(split_part(coalesce(compra->>'numeroCompra',''),'/',1),'\D','','g'),'0')));
create index if not exists oportunidades_codigo_origem on public.oportunidades_indice
  ((substring(compra->>'linkSistemaOrigem' from 'compra=(\d{17})')));
create index if not exists oportunidades_uasg on public.oportunidades_indice
  ((substring(compra->>'linkSistemaOrigem' from 'compra=(\d{6})\d{11}')));

create or replace function public.localizar_edital(p_termo text, p_uf text default '')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare t text:=trim(coalesce(p_termo,''));v_uf text:=coalesce(p_uf,'');d text;num text;ano integer;res jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária';end if;
 if length(t) not between 1 and 200 or v_uf !~ '^([A-Z]{2})?$' then raise exception 'Filtros inválidos';end if;
 d:=regexp_replace(t,'\D','','g');
 if d='' then raise exception 'Informe um número';end if;
 -- "90012/2026" ou "Pregão 12/2026": número e ano. Sem barra: só o número.
 if t ~ '/\s*\d{4}\s*$' then
  ano:=substring(t from '/\s*(\d{4})\s*$')::integer;
  num:=ltrim(regexp_replace(regexp_replace(t,'/\s*\d{4}\s*$',''),'\D','','g'),'0');
 else num:=ltrim(d,'0');end if;
 with achados as (
  select o.controle from public.oportunidades_indice o where o.controle=t
  union select o.controle from public.oportunidades_indice o
   where num<>'' and ltrim(regexp_replace(split_part(coalesce(o.compra->>'numeroCompra',''),'/',1),'\D','','g'),'0')=num
     and (ano is null or (o.compra->>'anoCompra')=ano::text)
  union select o.controle from public.oportunidades_indice o
   where length(d)=17 and substring(o.compra->>'linkSistemaOrigem' from 'compra=(\d{17})')=d
  union select o.controle from public.oportunidades_indice o
   where length(d)=6 and substring(o.compra->>'linkSistemaOrigem' from 'compra=(\d{6})\d{11}')=d
  union select o.controle from public.oportunidades_indice o where length(d)=14 and o.orgao_cnpj=d
 ), filtrados as materialized (
  select o.controle,o.encerramento,o.compra from achados a join public.oportunidades_indice o using(controle)
   where v_uf='' or o.uf=v_uf
 ), pagina as (select * from filtrados order by encerramento desc nulls last,controle limit 50)
 select jsonb_build_object('data',coalesce((select jsonb_agg(compra order by encerramento desc nulls last,controle) from pagina),'[]'::jsonb),
  'total',(select count(*) from filtrados)) into res;
 return res;
end;$$;
revoke all on function public.localizar_edital(text,text) from public,anon;
grant execute on function public.localizar_edital(text,text) to authenticated;

-- Pesquisa das desertas e fracassadas, agora com o filtro de portal.
create or replace function public.buscar_desertas(p_filtros jsonb default '{}',p_pagina integer default 1,p_tamanho integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare termo text:=trim(coalesce(p_filtros->>'busca',''));q tsquery;parte text;v_uf text:=coalesce(p_filtros->>'uf','');
 dias integer:=coalesce(nullif(p_filtros->>'dias','')::integer,30);v_tipo text:=coalesce(p_filtros->>'tipo','');
 v_portal text:=coalesce(p_filtros->>'portal','');
 inverter boolean:=coalesce((p_filtros->>'inverter')::boolean,false);mods integer[];res jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária';end if;
 if p_pagina is null or p_tamanho is null or p_pagina not between 1 and 100000 or p_tamanho not between 1 and 50 or length(termo)>300
  or dias not between 1 and 30 or v_tipo not in ('','4','5') or v_uf !~ '^([A-Z]{2})?$' or v_portal !~ '^[a-z0-9-]{0,20}$' then raise exception 'Filtros inválidos';end if;
 select array_agg(x::integer) into mods from jsonb_array_elements_text(coalesce(p_filtros->'modalidades','["2","4","5","6","7","8"]')) x;
 if coalesce(array_length(mods,1),0)=0 then raise exception 'Selecione ao menos uma modalidade';end if;
 foreach parte in array string_to_array(termo,';') loop
  if public.oportunidades_termos(parte) is not null then q:=case when q is null then public.oportunidades_termos(parte) else q||public.oportunidades_termos(parte) end;end if;
 end loop;
 if termo<>'' and q is null then raise exception 'Informe uma palavra-chave para pesquisar';end if;
 with por_edital as materialized (
  select d.controle,count(*) filter (where d.situacao=4) desertos,count(*) filter (where d.situacao=5) fracassados,
   coalesce(bool_or(d.busca @@ q),false) item_casa
   from public.oportunidades_desertos d where v_tipo='' or d.situacao=v_tipo::smallint group by d.controle
 ), base as materialized (
  select o.controle,o.encerramento,p.desertos,p.fracassados from por_edital p join public.oportunidades_indice o using(controle)
   where o.encerramento>=now()-make_interval(days=>dias) and o.encerramento<now() and o.modalidade=any(mods) and (v_uf='' or o.uf=v_uf)
     and (v_portal='' or o.portal_id=v_portal)
     and (q is null or p.item_casa or o.busca @@ q)
 ), ordem as materialized (
  select b.* from base b order by case when not inverter then b.encerramento end desc nulls last,case when inverter then b.encerramento end asc nulls last,b.controle
   limit p_tamanho offset (p_pagina-1)*p_tamanho
 ), pagina as (
  select p.controle,p.encerramento,o.compra||jsonb_build_object('desertos',p.desertos,'fracassados',p.fracassados,
   'itensDesertos',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('numeroItem',x.numero,'situacao',x.situacao,'descricao',x.descricao,'quantidade',x.quantidade,
     'unidadeMedida',x.unidade,'valorUnitarioEstimado',x.valor_unitario,'orcamentoSigiloso',x.sigiloso,'tipoBeneficio',x.beneficio)) order by x.numero),'[]'::jsonb)
     from (select * from public.oportunidades_desertos x where x.controle=p.controle and (v_tipo='' or x.situacao=v_tipo::smallint) order by x.numero limit 30) x),
   'valorDesertos',(select sum(round(x.valor_unitario*x.quantidade,2)) from public.oportunidades_desertos x where x.controle=p.controle and (v_tipo='' or x.situacao=v_tipo::smallint))) compra
   from ordem p join public.oportunidades_indice o using(controle)
 ), total as (select count(*) n from base)
 select jsonb_build_object(
  'data',coalesce((select jsonb_agg(compra order by case when not inverter then encerramento end desc nulls last,case when inverter then encerramento end asc nulls last,controle) from pagina),'[]'::jsonb),
  'totalRegistros',(select n from total),'totalPaginas',ceil((select n from total)::numeric/p_tamanho),
  'catalogo',(select to_jsonb(s)-'id' from public.oportunidades_catalogo_status s where id)) into res;
 return res;
end;$$;
revoke all on function public.buscar_desertas(jsonb,integer,integer) from public,anon;
grant execute on function public.buscar_desertas(jsonb,integer,integer) to authenticated;

COMMIT;
