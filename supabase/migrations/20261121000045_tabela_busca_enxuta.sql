-- LicitaFlow · Busca de oportunidades lendo uma tabela enxuta.
-- Em 21/11/2026 a busca ainda passava do limite de 8 s (erro 57014) em "Todo o período" e com palavra-chave.
-- Causa medida: o banco Nano (~408 MB de RAM) está em swap (memory commitment 1,24 GB), e cada busca
-- percorria as 11.373 páginas de oportunidades_indice. A linha tem ~1,3 KB (busca 461 B, compra 445 B,
-- objeto 262 B), mas a busca só filtra ~150 B dela. O seq scan de 37 mil abertas levou 6,3 s com tudo
-- "shared hit" (as páginas do cache estavam no swap).
-- Agora a busca filtra, ordena e conta em oportunidades_busca (só as colunas de filtro, ~1/12 das páginas)
-- e só lê a tabela grande para as 20 linhas da página e para a palavra-chave (pelos índices GIN).
-- dia_util e tipo_objeto já ficam calculados na linha (antes eram calculados a cada busca, linha a linha).
-- Gatilhos por comando (com tabelas de transição) mantêm a cópia: um por comando do coletor, não por linha.

create table if not exists public.oportunidades_busca (
 controle text primary key,
 encerramento timestamptz,
 publicacao timestamptz,
 modalidade integer not null,
 portal_id text not null,
 uf text not null,
 situacao integer,
 srp boolean,
 modo_disputa smallint,
 valor numeric,
 orgao_cnpj text not null,
 orgao_nome text not null,
 itens_completos boolean not null,
 quantidade_itens integer,
 tipo_itens text,
 tipo_objeto text,
 dia_util boolean
);
create index if not exists oportunidades_busca_encerramento on public.oportunidades_busca(encerramento);
create index if not exists oportunidades_busca_publicacao on public.oportunidades_busca(publicacao desc);
alter table public.oportunidades_busca enable row level security;
drop policy if exists oportunidades_busca_ler on public.oportunidades_busca;
create policy oportunidades_busca_ler on public.oportunidades_busca for select to authenticated using((select auth.uid()) is not null);
revoke all on public.oportunidades_busca from public,anon,authenticated;
grant select on public.oportunidades_busca to authenticated;

create or replace function licitaflow_coleta.busca_gravar() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.oportunidades_busca as b(controle,encerramento,publicacao,modalidade,portal_id,uf,situacao,srp,modo_disputa,valor,orgao_cnpj,orgao_nome,itens_completos,quantidade_itens,tipo_itens,tipo_objeto,dia_util)
 select n.controle,n.encerramento,n.publicacao,n.modalidade,n.portal_id,n.uf,n.situacao,n.srp,n.modo_disputa,n.valor,n.orgao_cnpj,n.orgao_nome,n.itens_completos,n.quantidade_itens,n.tipo_itens,
  public.oportunidades_tipo_objeto(n.objeto),public.oportunidades_dia_util(n.encerramento)
 from novos n
 on conflict (controle) do update set encerramento=excluded.encerramento,publicacao=excluded.publicacao,modalidade=excluded.modalidade,portal_id=excluded.portal_id,uf=excluded.uf,
  situacao=excluded.situacao,srp=excluded.srp,modo_disputa=excluded.modo_disputa,valor=excluded.valor,orgao_cnpj=excluded.orgao_cnpj,orgao_nome=excluded.orgao_nome,
  itens_completos=excluded.itens_completos,quantidade_itens=excluded.quantidade_itens,tipo_itens=excluded.tipo_itens,tipo_objeto=excluded.tipo_objeto,dia_util=excluded.dia_util
 -- Atualizações que não mexem nas colunas de filtro (ex.: coletado_em) não regravam a linha.
 where (b.encerramento,b.publicacao,b.modalidade,b.portal_id,b.uf,b.situacao,b.srp,b.modo_disputa,b.valor,b.orgao_cnpj,b.orgao_nome,b.itens_completos,b.quantidade_itens,b.tipo_itens,b.tipo_objeto,b.dia_util)
  is distinct from (excluded.encerramento,excluded.publicacao,excluded.modalidade,excluded.portal_id,excluded.uf,excluded.situacao,excluded.srp,excluded.modo_disputa,excluded.valor,excluded.orgao_cnpj,excluded.orgao_nome,excluded.itens_completos,excluded.quantidade_itens,excluded.tipo_itens,excluded.tipo_objeto,excluded.dia_util);
 return null;
end;$$;

create or replace function licitaflow_coleta.busca_apagar() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from public.oportunidades_busca b using velhos v where b.controle=v.controle;
 return null;
end;$$;
revoke all on function licitaflow_coleta.busca_gravar() from public,anon,authenticated;
revoke all on function licitaflow_coleta.busca_apagar() from public,anon,authenticated;

drop trigger if exists oportunidades_busca_inserir on public.oportunidades_indice;
drop trigger if exists oportunidades_busca_atualizar on public.oportunidades_indice;
drop trigger if exists oportunidades_busca_apagar on public.oportunidades_indice;
create trigger oportunidades_busca_inserir after insert on public.oportunidades_indice
 referencing new table as novos for each statement execute function licitaflow_coleta.busca_gravar();
create trigger oportunidades_busca_atualizar after update on public.oportunidades_indice
 referencing new table as novos for each statement execute function licitaflow_coleta.busca_gravar();
create trigger oportunidades_busca_apagar after delete on public.oportunidades_indice
 referencing old table as velhos for each statement execute function licitaflow_coleta.busca_apagar();

-- Carga inicial (no mesmo comando dos gatilhos, para não perder gravações do coletor no meio).
insert into public.oportunidades_busca(controle,encerramento,publicacao,modalidade,portal_id,uf,situacao,srp,modo_disputa,valor,orgao_cnpj,orgao_nome,itens_completos,quantidade_itens,tipo_itens,tipo_objeto,dia_util)
select controle,encerramento,publicacao,modalidade,portal_id,uf,situacao,srp,modo_disputa,valor,orgao_cnpj,orgao_nome,itens_completos,quantidade_itens,tipo_itens,
 public.oportunidades_tipo_objeto(objeto),public.oportunidades_dia_util(encerramento)
from public.oportunidades_indice
on conflict (controle) do nothing;
analyze public.oportunidades_busca;

create or replace function public.buscar_oportunidades(p_filtros jsonb default '{}',p_pagina integer default 1,p_tamanho integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' set work_mem='8MB' as $$
declare inverter boolean:=coalesce((p_filtros->>'inverter')::boolean,false);q tsquery;termo text:=trim(coalesce(p_filtros->>'busca',''));mods integer[];portais text[];v_uf text:=coalesce(p_filtros->>'uf','');org text:=nullif(p_filtros->>'orgao','');modo text:=coalesce(p_filtros->>'situacao','abertas');
 de date;ate date;v_min numeric:=nullif(p_filtros->>'minimo','')::numeric;v_max numeric:=nullif(p_filtros->>'maximo','')::numeric;i_min numeric:=nullif(p_filtros->>'itemMinimo','')::numeric;i_max numeric:=nullif(p_filtros->>'itemMaximo','')::numeric;
 max_itens integer:=nullif(p_filtros->>'maxItens','')::integer;excluir text:=trim(coalesce(p_filtros->>'excluir',''));q_ex tsquery;v_tipo text:=coalesce(p_filtros->>'tipoItem','');modos integer[];parte text;ab_de date:=nullif(p_filtros->>'aberturaDe','')::date;ab_ate date:=nullif(p_filtros->>'aberturaAte','')::date;so_uteis boolean:=coalesce((p_filtros->>'diasUteis')::boolean,false);exclusivo boolean:=coalesce((p_filtros->>'exclusivo')::boolean,false);sem_valor boolean:=coalesce((p_filtros->>'naoDivulgado')::boolean,false);sem_srp boolean:=coalesce((p_filtros->>'excluirSrp')::boolean,false);por_item boolean;res jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária';end if;
 if p_pagina is null or p_tamanho is null or p_pagina not between 1 and 100000 or p_tamanho not between 1 and 50 or length(termo)>300 or length(excluir)>300 or v_tipo not in ('','M','S') or modo not in ('abertas','publicacoes') then raise exception 'Filtros inválidos';end if;
 select array_agg(x::integer) into mods from jsonb_array_elements_text(coalesce(p_filtros->'modalidades','[1,2,3,4,5,6,7,8,9,10,11,12,13]')) x;
 select array_agg(x) into portais from jsonb_array_elements_text(coalesce(p_filtros->'portais','["comprasnet","pcp","licitacoes-e","caixa","banrisul","rs","bahia","amazonas","goias","rj","recife","licitanet","bll","elic","procergs","mg","banpara","pe","bnc","outros"]')) x;
 if coalesce(array_length(mods,1),0)=0 or coalesce(array_length(portais,1),0)=0 then raise exception 'Selecione modalidade e portal';end if;
 if modo='publicacoes' then de:=(p_filtros->>'inicio')::date;ate:=(p_filtros->>'fim')::date;if de is null or ate is null or de>ate then raise exception 'Período inválido';end if;end if;
 if ab_de>ab_ate then raise exception 'Período de abertura inválido';end if;
 if v_min<0 or v_max<0 or i_min<0 or i_max<0 or v_min>v_max or i_min>i_max or max_itens<1 then raise exception 'Valores inválidos';end if;
 -- Vários termos separados por ";" valem como "qualquer um deles".
 foreach parte in array string_to_array(termo,';') loop
  if public.oportunidades_termos(parte) is not null then q:=case when q is null then public.oportunidades_termos(parte) else q||public.oportunidades_termos(parte) end;end if;
 end loop;
 if termo<>'' and q is null then raise exception 'Informe uma palavra-chave para pesquisar';end if;
 foreach parte in array string_to_array(excluir,';') loop
  if public.oportunidades_termos(parte) is not null then q_ex:=case when q_ex is null then public.oportunidades_termos(parte) else q_ex||public.oportunidades_termos(parte) end;end if;
 end loop;
 select array_agg(x::integer) into modos from jsonb_array_elements_text(coalesce(p_filtros->'modosDisputa','[]')) x;
 por_item:=i_min is not null or i_max is not null or max_itens is not null or exclusivo;
 with candidatos as materialized (
  -- Palavra-chave e exclusões usam os índices GIN da tabela grande; o resto só lê a tabela enxuta.
  select controle from public.oportunidades_indice where busca @@ q
  union select controle from public.oportunidades_indice where busca_itens @@ q
 ), excluidos as materialized (
  select controle from public.oportunidades_indice where q_ex is not null and busca @@ q_ex
 ), base as materialized (
  select o.controle,o.publicacao,o.encerramento,o.orgao_cnpj,o.orgao_nome,o.itens_completos,o.quantidade_itens,o.tipo_itens,o.tipo_objeto from public.oportunidades_busca o
  where (q is null or o.controle in (select controle from candidatos))
   and o.modalidade=any(mods) and o.portal_id=any(portais) and (v_uf='' or o.uf=v_uf) and (org is null or o.orgao_cnpj=org)
   and (case when modo='abertas' then o.encerramento>=greatest(now(),coalesce(ab_de::timestamp at time zone 'America/Sao_Paulo','-infinity'::timestamptz))
     and (ab_ate is null or o.encerramento<((ab_ate+1)::timestamp at time zone 'America/Sao_Paulo')) and coalesce(o.situacao,1)=1
     and (not so_uteis or o.dia_util) else o.publicacao >= (de::timestamp at time zone 'America/Sao_Paulo') and o.publicacao < ((ate+1)::timestamp at time zone 'America/Sao_Paulo') end)
   and (not sem_srp or o.srp=false)
   and (q_ex is null or not exists(select 1 from excluidos e where e.controle=o.controle))
   and (coalesce(array_length(modos,1),0)=0 or o.modo_disputa=any(modos))
   and (case when sem_valor then coalesce(o.valor,0)=0 else (v_min is null or o.valor>0 and o.valor>=v_min) and (v_max is null or o.valor>0 and o.valor<=v_max) end)
 ), filtrados as materialized (
  select b.controle,b.publicacao,b.encerramento from base b where (v_tipo='' or position(v_tipo in coalesce(b.tipo_itens,'')||coalesce(b.tipo_objeto,''))>0) and (not por_item or (
   b.itens_completos and (max_itens is null or b.quantidade_itens<=max_itens) and
   ((i_min is null and i_max is null and not exclusivo) or exists(select 1 from public.oportunidades_itens_indice i where i.controle=b.controle
    and (not exclusivo or i.beneficio=1) and ((i_min is null and i_max is null) or not i.sigiloso and i.valor_unitario>0 and (i_min is null or i.valor_unitario>=i_min) and (i_max is null or i.valor_unitario<=i_max))))
  ))
 ), ordem as materialized (
  -- Ordena e corta a página antes de ler o conteúdo completo dos editais.
  select f.controle,f.publicacao,f.encerramento from filtrados f
  order by case when modo='abertas' and not inverter then f.encerramento end asc nulls last,case when modo='abertas' and inverter then f.encerramento end desc nulls last,case when inverter then f.publicacao end asc nulls last,case when not inverter then f.publicacao end desc nulls last,f.controle limit p_tamanho offset (p_pagina-1)*p_tamanho
 ), pagina as (
  select o.compra||jsonb_strip_nulls(jsonb_build_object('modoDisputaId',o.modo_disputa,'materialOuServico',coalesce(o.tipo_itens,b.tipo_objeto),'tipoEstimado',case when o.tipo_itens is null and b.tipo_objeto is not null then true end)) compra,p.publicacao,p.encerramento,p.controle
  from ordem p join public.oportunidades_indice o using(controle) join public.oportunidades_busca b using(controle)
 ), total as (select count(*) n from filtrados)
 select jsonb_build_object('data',coalesce((select jsonb_agg(compra order by case when modo='abertas' and not inverter then encerramento end asc nulls last,case when modo='abertas' and inverter then encerramento end desc nulls last,case when inverter then publicacao end asc nulls last,case when not inverter then publicacao end desc nulls last,controle) from pagina),'[]'::jsonb),'totalRegistros',(select n from total),
 'totalPaginas',ceil((select n from total)::numeric/p_tamanho),'orgaos',coalesce((select jsonb_agg(x) from (select orgao_cnpj cnpj,min(orgao_nome) "razaoSocial" from base group by orgao_cnpj order by min(orgao_nome) limit 200) x),'[]'::jsonb),
 'catalogo',(select to_jsonb(s)-'id' from public.oportunidades_catalogo_status s where id),
 'detalhesPendentes',case when por_item then (select count(*) from base where not itens_completos) else 0 end) into res;
 return res;
end;$$;
revoke all on function public.buscar_oportunidades(jsonb,integer,integer) from public,anon;
grant execute on function public.buscar_oportunidades(jsonb,integer,integer) to authenticated;
