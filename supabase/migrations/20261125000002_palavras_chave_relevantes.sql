-- Palavras-chave relacionadas ao objeto e aos itens compatíveis com os filtros.
begin;
alter table public.oportunidades_itens_indice add column if not exists tipo text check (tipo in ('M','S'));
-- Só há como recuperar o tipo antigo com segurança quando o edital tem um único tipo.
update public.oportunidades_itens_indice i set tipo=o.tipo_itens from public.oportunidades_indice o
 where o.controle=i.controle and o.tipo_itens in ('M','S') and i.tipo is null;
-- Recupera tipos individuais dos editais mistos próximos, sem duplicar trabalhos ativos.
insert into licitaflow_coleta.jobs(tipo,ciclo,controle,proxima_em)
select 'itens',o.controle||'/tipos-individuais-20261125',o.controle,now()
 from public.oportunidades_indice o
 where o.tipo_itens='MS' and o.encerramento>=now() and o.encerramento<now()+interval '30 days'
   and exists(select 1 from public.oportunidades_itens_indice i where i.controle=o.controle and i.tipo is null)
   and not exists(select 1 from licitaflow_coleta.jobs j where j.tipo='itens' and j.controle=o.controle and not j.concluido)
on conflict do nothing;
create or replace function licitaflow_coleta.registrar_itens(p_controle text,p_itens jsonb,p_pagina integer,p_final boolean) returns void
language plpgsql set search_path='' as $$
declare i jsonb;sigilo boolean;tem_m boolean;tem_s boolean;
begin
 if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)>500 then raise exception 'Página de itens inválida';end if;
 if p_pagina=1 then
  update public.oportunidades_indice set itens_completos=false,quantidade_itens=null,busca_itens=null,tipo_itens=null where controle=p_controle;
  delete from public.oportunidades_itens_indice where controle=p_controle;
 end if;
 for i in select value from jsonb_array_elements(p_itens) loop
  sigilo:=coalesce((i->>'orcamentoSigiloso')::boolean,false);
  if (i->>'numeroItem')::integer is null then raise exception 'Item sem identificação';end if;
  if p_pagina>1 and exists(select 1 from public.oportunidades_itens_indice where controle=p_controle and numero=(i->>'numeroItem')::integer) then raise exception 'A fonte repetiu a página de itens';end if;
  insert into public.oportunidades_itens_indice(controle,numero,descricao,valor_unitario,beneficio,sigiloso,quantidade,unidade,valor_total,criterio,situacao,grupo,lote,tipo)
  values(p_controle,(i->>'numeroItem')::integer,left(coalesce(i->>'descricao',''),160),
   case when sigilo then null else (i->>'valorUnitarioEstimado')::numeric end,(i->>'tipoBeneficio')::smallint,sigilo,
   (i->>'quantidade')::numeric,left(i->>'unidadeMedida',20),case when sigilo then null else (i->>'valorTotal')::numeric end,
   licitaflow_coleta.codigo_item(i->>'criterioJulgamentoId',i->>'criterioJulgamentoNome','criterio'),
   licitaflow_coleta.codigo_item(i->>'situacaoCompraItem',i->>'situacaoCompraItemNome','situacao'),
   left(nullif(coalesce(i->>'numeroGrupo',i->>'grupo'),''),12),left(nullif(coalesce(i->>'numeroLote',i->>'lote'),''),12),case when i->>'materialOuServico' in ('M','S') then i->>'materialOuServico' end);
 end loop;
 -- Material (M) e/ou serviço (S), somando as páginas já recebidas.
 select coalesce(bool_or(x->>'materialOuServico'='M'),false),coalesce(bool_or(x->>'materialOuServico'='S'),false) into tem_m,tem_s from jsonb_array_elements(p_itens) x;
 update public.oportunidades_indice set busca_itens=licitaflow_coleta.vetor_itens(p_controle),
  tipo_itens=nullif(concat(case when tem_m or position('M' in coalesce(tipo_itens,''))>0 then 'M' end,case when tem_s or position('S' in coalesce(tipo_itens,''))>0 then 'S' end),'')
  where controle=p_controle;
 if p_final then update public.oportunidades_indice set itens_completos=true,quantidade_itens=(select count(*) from public.oportunidades_itens_indice where controle=p_controle) where controle=p_controle;end if;
end;$$;


create or replace function public.oportunidades_controles_termos(p_q tsquery,p_itens boolean) returns setof text language sql stable security definer rows 500 set search_path='' as $
 select controle from public.oportunidades_indice where p_q is not null and (select auth.uid()) is not null and busca @@ p_q and ts_filter(busca,array['A','B']::"char"[]) @@ p_q
 union select controle from public.oportunidades_indice where p_itens and p_q is not null and (select auth.uid()) is not null and busca_itens @@ p_q
$;
create or replace function public.buscar_oportunidades(p_filtros jsonb default '{}',p_pagina integer default 1,p_tamanho integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' set work_mem='8MB' as $$
declare inverter boolean:=coalesce((p_filtros->>'inverter')::boolean,false);q tsquery;termo text:=trim(coalesce(p_filtros->>'busca',''));mods integer[];portais text[];v_ufs text[];org text:=nullif(p_filtros->>'orgao','');modo text:=coalesce(p_filtros->>'situacao','abertas');
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
 -- Vários estados de uma vez ("ufs"); buscas antigas mandam só "uf". Nenhum = Brasil inteiro.
 if jsonb_typeof(p_filtros->'ufs')='array' and jsonb_array_length(p_filtros->'ufs')>0 then
  select array_agg(distinct x) into v_ufs from jsonb_array_elements_text(p_filtros->'ufs') x;
 elsif coalesce(p_filtros->>'uf','')<>'' then v_ufs:=array[p_filtros->>'uf'];
 end if;
 if v_ufs is not null and (array_length(v_ufs,1)>27 or exists(select 1 from unnest(v_ufs) u where u!~'^[A-Z]{2}$')) then raise exception 'Filtros inválidos';end if;
 por_item:=i_min is not null or i_max is not null or max_itens is not null or exclusivo;
 with candidatos as materialized (
  -- Palavra-chave e exclusões usam os índices GIN da tabela grande; o resto só lê a tabela enxuta.
  select public.oportunidades_controles_termos(q,true) as controle
 ), excluidos as materialized (
  select public.oportunidades_controles_termos(q_ex,false) as controle
 ), base as materialized (
  select o.controle,o.publicacao,o.encerramento,o.orgao_cnpj,o.orgao_nome,o.itens_completos,o.quantidade_itens,o.tipo_itens,o.tipo_objeto from public.oportunidades_busca o
  where (q is null or o.controle in (select controle from candidatos))
   and o.modalidade=any(mods) and o.portal_id=any(portais) and (v_ufs is null or o.uf=any(v_ufs)) and (org is null or o.orgao_cnpj=org)
   and (case when modo='abertas' then o.encerramento>=greatest(now(),coalesce(ab_de::timestamp at time zone 'America/Sao_Paulo','-infinity'::timestamptz))
     and (ab_ate is null or o.encerramento<((ab_ate+1)::timestamp at time zone 'America/Sao_Paulo')) and coalesce(o.situacao,1)=1
     and (not so_uteis or o.dia_util) else o.publicacao >= (de::timestamp at time zone 'America/Sao_Paulo') and o.publicacao < ((ate+1)::timestamp at time zone 'America/Sao_Paulo') end)
   and (not sem_srp or o.srp=false)
   and (q_ex is null or not exists(select 1 from excluidos e where e.controle=o.controle))
   and (coalesce(array_length(modos,1),0)=0 or o.modo_disputa=any(modos))
   and (case when sem_valor then coalesce(o.valor,0)=0 else (v_min is null or o.valor>0 and o.valor>=v_min) and (v_max is null or o.valor>0 and o.valor<=v_max) end)
 ), filtrados as materialized (
  select b.controle,b.publicacao,b.encerramento from base b where (v_tipo='' or position(v_tipo in coalesce(nullif(b.tipo_itens,''),b.tipo_objeto,''))>0) and (not por_item or (
   b.itens_completos and (max_itens is null or b.quantidade_itens<=max_itens) and
   ((i_min is null and i_max is null and not exclusivo) or exists(select 1 from public.oportunidades_itens_indice i where i.controle=b.controle
    and (v_tipo='' or coalesce(i.tipo,case when b.tipo_itens in ('M','S') then b.tipo_itens when b.tipo_itens is null then b.tipo_objeto end)=v_tipo) and (not exclusivo or i.beneficio=1) and ((i_min is null and i_max is null) or not i.sigiloso and i.valor_unitario>0 and (i_min is null or i.valor_unitario>=i_min) and (i_max is null or i.valor_unitario<=i_max))))
  ))
 ), relevantes as materialized (
  select f.* from filtrados f join public.oportunidades_busca b using(controle)
  where q is null or (v_tipo='' and not por_item)
    or exists(select 1 from public.oportunidades_indice o where o.controle=f.controle and ts_filter(o.busca,array['A','B']::"char"[]) @@ q)
    or exists(select 1 from public.oportunidades_itens_indice i where i.controle=f.controle
      and to_tsvector('pg_catalog.portuguese',public.oportunidades_normalizar(i.descricao)) @@ q
      and (v_tipo='' or coalesce(i.tipo,case when b.tipo_itens in ('M','S') then b.tipo_itens when b.tipo_itens is null then b.tipo_objeto end)=v_tipo)
      and (not exclusivo or i.beneficio=1)
      and ((i_min is null and i_max is null) or not i.sigiloso and i.valor_unitario>0
        and (i_min is null or i.valor_unitario>=i_min) and (i_max is null or i.valor_unitario<=i_max)))
 ), ordem as materialized (
  -- Ordena e corta a página antes de ler o conteúdo completo dos editais.
  select f.controle,f.publicacao,f.encerramento from relevantes f
  order by case when modo='abertas' and not inverter then f.encerramento end asc nulls last,case when modo='abertas' and inverter then f.encerramento end desc nulls last,case when inverter then f.publicacao end asc nulls last,case when not inverter then f.publicacao end desc nulls last,f.controle limit p_tamanho offset (p_pagina-1)*p_tamanho
 ), pagina as (
  select o.compra||jsonb_strip_nulls(jsonb_build_object('modoDisputaId',o.modo_disputa,'materialOuServico',coalesce(o.tipo_itens,b.tipo_objeto),'tipoEstimado',case when o.tipo_itens is null and b.tipo_objeto is not null then true end)) compra,p.publicacao,p.encerramento,p.controle
  from ordem p join public.oportunidades_indice o using(controle) join public.oportunidades_busca b using(controle)
 ), total as (select count(*) n from relevantes)
 select jsonb_build_object('data',coalesce((select jsonb_agg(compra order by case when modo='abertas' and not inverter then encerramento end asc nulls last,case when modo='abertas' and inverter then encerramento end desc nulls last,case when inverter then publicacao end asc nulls last,case when not inverter then publicacao end desc nulls last,controle) from pagina),'[]'::jsonb),'totalRegistros',(select n from total),
 'totalPaginas',ceil((select n from total)::numeric/p_tamanho),'orgaos',coalesce((select jsonb_agg(x) from (select orgao_cnpj cnpj,min(orgao_nome) "razaoSocial" from base group by orgao_cnpj order by min(orgao_nome) limit 200) x),'[]'::jsonb),
 'catalogo',(select to_jsonb(s)-'id' from public.oportunidades_catalogo_status s where id),
 'detalhesPendentes',case when por_item then (select count(*) from base where not itens_completos) else 0 end) into res;
 return res;
end;$$;
revoke all on function public.buscar_oportunidades(jsonb,integer,integer) from public,anon;
grant execute on function public.buscar_oportunidades(jsonb,integer,integer) to authenticated;

commit;
