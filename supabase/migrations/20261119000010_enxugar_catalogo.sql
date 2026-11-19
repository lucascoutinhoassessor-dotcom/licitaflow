-- LicitaFlow · Enxuga o catálogo de oportunidades para caber no plano gratuito do Supabase (500 MB).
-- Medição em 19/11/2026: itens ocupavam 943 MB (JSON duplicado 381 MB, vetor de busca por item 165 MB,
-- índice GIN dos itens 170 MB). A busca por itens e os filtros continuam iguais para o cliente.
--
-- 1. A busca textual dos itens vira um único vetor (sem posições) por edital: busca_itens.
-- 2. A tabela de itens é recriada só com colunas simples (sem o JSON duplicado e sem vetor por item).
-- 3. Itens de editais encerrados há mais de 2 dias são descartados (o edital continua no catálogo;
--    os itens podem ser consultados sob demanda e voltam a ser coletados se alguém pedir).
set statement_timeout = '30min';
-- Bloqueia gravações do coletor enquanto a tabela é recriada (leituras continuam).
lock table public.oportunidades_itens_indice in exclusive mode;

-- ============ 1. Vetor de busca dos itens no edital ============
alter table public.oportunidades_indice add column if not exists busca_itens tsvector;

create function licitaflow_coleta.vetor_itens(p_controle text) returns tsvector
language sql stable set search_path='' as $$
 select pg_catalog.strip(pg_catalog.to_tsvector('pg_catalog.portuguese',
   public.oportunidades_normalizar(left(string_agg(descricao, ' ' order by numero), 400000))))
 from public.oportunidades_itens_indice where controle = p_controle;
$$;

-- ============ 2. Tabela de itens compacta ============
create table public.oportunidades_itens_compacto as
select i.controle, i.numero, i.descricao, i.valor_unitario, i.beneficio, i.sigiloso,
       (i.item->>'quantidade')::numeric as quantidade,
       i.item->>'unidadeMedida' as unidade,
       case when i.sigiloso then null else (i.item->>'valorTotal')::numeric end as valor_total,
       i.item->>'tipoBeneficioNome' as beneficio_nome,
       i.item->>'criterioJulgamentoNome' as criterio,
       i.item->>'situacaoCompraItemNome' as situacao,
       coalesce(i.item->>'numeroGrupo', i.item->>'grupo') as grupo,
       coalesce(i.item->>'numeroLote', i.item->>'lote') as lote
from public.oportunidades_itens_indice i
join public.oportunidades_indice o using (controle)
where o.encerramento is null or o.encerramento >= now() - interval '2 days';

-- Editais cujos itens foram descartados deixam de anunciar itens completos.
update public.oportunidades_indice o
   set itens_completos = false, quantidade_itens = null
 where o.itens_completos
   and o.encerramento < now() - interval '2 days';

drop table public.oportunidades_itens_indice;
alter table public.oportunidades_itens_compacto rename to oportunidades_itens_indice;
alter table public.oportunidades_itens_indice
  alter column controle set not null,
  alter column numero set not null,
  alter column descricao set not null,
  alter column descricao set default '',
  alter column sigiloso set not null,
  alter column sigiloso set default false,
  add primary key (controle, numero),
  add foreign key (controle) references public.oportunidades_indice(controle) on delete cascade,
  add constraint preco_sigiloso_oculto check (not sigiloso or (valor_unitario is null and valor_total is null));
create index oportunidades_itens_valor on public.oportunidades_itens_indice(controle, beneficio, valor_unitario) where not sigiloso;

alter table public.oportunidades_itens_indice enable row level security;
create policy oportunidades_itens_ler on public.oportunidades_itens_indice for select to authenticated using(
 (select auth.uid()) is not null and exists(select 1 from public.oportunidades_indice o where o.controle=oportunidades_itens_indice.controle and o.itens_completos)
);
revoke all on public.oportunidades_itens_indice from public, anon, authenticated;
grant select on public.oportunidades_itens_indice to authenticated;

-- Preenche o vetor dos itens a partir da tabela compacta.
update public.oportunidades_indice o set busca_itens = x.v
from (select controle,
             pg_catalog.strip(pg_catalog.to_tsvector('pg_catalog.portuguese',
               public.oportunidades_normalizar(left(string_agg(descricao, ' ' order by numero), 400000)))) v
      from public.oportunidades_itens_indice group by controle) x
where x.controle = o.controle;
update public.oportunidades_indice set busca_itens = null
 where busca_itens is not null and not exists (select 1 from public.oportunidades_itens_indice i where i.controle = oportunidades_indice.controle);
create index oportunidades_busca_itens_gin on public.oportunidades_indice using gin(busca_itens);

-- ============ 3. Funções ajustadas ============
create or replace function licitaflow_coleta.registrar_itens(p_controle text,p_itens jsonb,p_pagina integer,p_final boolean) returns void
language plpgsql set search_path='' as $$
declare i jsonb;sigilo boolean;
begin
 if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)>500 then raise exception 'Página de itens inválida';end if;
 if p_pagina=1 then
  update public.oportunidades_indice set itens_completos=false,quantidade_itens=null,busca_itens=null where controle=p_controle;
  delete from public.oportunidades_itens_indice where controle=p_controle;
 end if;
 for i in select value from jsonb_array_elements(p_itens) loop
  sigilo:=coalesce((i->>'orcamentoSigiloso')::boolean,false);
  if (i->>'numeroItem')::integer is null then raise exception 'Item sem identificação';end if;
  if p_pagina>1 and exists(select 1 from public.oportunidades_itens_indice where controle=p_controle and numero=(i->>'numeroItem')::integer) then raise exception 'A fonte repetiu a página de itens';end if;
  insert into public.oportunidades_itens_indice(controle,numero,descricao,valor_unitario,beneficio,sigiloso,quantidade,unidade,valor_total,beneficio_nome,criterio,situacao,grupo,lote)
  values(p_controle,(i->>'numeroItem')::integer,left(coalesce(i->>'descricao',''),2048),
   case when sigilo then null else (i->>'valorUnitarioEstimado')::numeric end,(i->>'tipoBeneficio')::integer,sigilo,
   (i->>'quantidade')::numeric,i->>'unidadeMedida',case when sigilo then null else (i->>'valorTotal')::numeric end,
   i->>'tipoBeneficioNome',i->>'criterioJulgamentoNome',i->>'situacaoCompraItemNome',
   coalesce(i->>'numeroGrupo',i->>'grupo'),coalesce(i->>'numeroLote',i->>'lote'));
 end loop;
 update public.oportunidades_indice set busca_itens=licitaflow_coleta.vetor_itens(p_controle) where controle=p_controle;
 if p_final then update public.oportunidades_indice set itens_completos=true,quantidade_itens=(select count(*) from public.oportunidades_itens_indice where controle=p_controle) where controle=p_controle;end if;
end;$$;

create or replace function licitaflow_coleta.registrar_compra(c jsonb) returns void
language plpgsql set search_path='' as $$
declare v text:=c->>'numeroControlePNCP';payload jsonb;mudou boolean;versao_recebida timestamptz;versao_atual timestamptz;
begin
 if v is null or length(v)>100 or coalesce(c#>>'{orgaoEntidade,cnpj}','') !~ '^[0-9]{14}$' or c->>'objetoCompra' is null then raise exception 'Identificação inválida na fonte';end if;
 versao_recebida:=licitaflow_coleta.tempo(coalesce(c->>'dataAtualizacaoGlobal',c->>'dataAtualizacao'));
 select fonte_atualizada_em into versao_atual from public.oportunidades_indice where controle=v;
 if versao_atual is not null and (versao_recebida is null or versao_recebida<versao_atual) then return;end if;

 payload:=jsonb_build_object('numeroControlePNCP',v,'numeroCompra',c->'numeroCompra','anoCompra',c->'anoCompra','sequencialCompra',c->'sequencialCompra',
 'objetoCompra',c->'objetoCompra','informacaoComplementar',c->'informacaoComplementar','orgaoEntidade',jsonb_build_object('cnpj',c#>>'{orgaoEntidade,cnpj}','razaoSocial',c#>>'{orgaoEntidade,razaoSocial}'),
 'unidadeOrgao',jsonb_build_object('ufSigla',coalesce(c#>>'{unidadeOrgao,ufSigla}',''),'municipioNome',coalesce(c#>>'{unidadeOrgao,municipioNome}','')),
 'modalidadeId',c->'modalidadeId','modalidadeNome',c->'modalidadeNome','usuarioNome',c->'usuarioNome','linkSistemaOrigem',c->'linkSistemaOrigem','srp',c->'srp',
 'valorTotalEstimado',c->'valorTotalEstimado','dataPublicacaoPncp',c->'dataPublicacaoPncp','dataAberturaProposta',c->'dataAberturaProposta','dataEncerramentoProposta',c->'dataEncerramentoProposta');
 select compra is distinct from payload or fonte_atualizada_em is distinct from licitaflow_coleta.tempo(coalesce(c->>'dataAtualizacaoGlobal',c->>'dataAtualizacao')) into mudou from public.oportunidades_indice where controle=v;
 insert into public.oportunidades_indice(controle,objeto,complemento,orgao_cnpj,orgao_nome,uf,modalidade,portal_id,publicacao,encerramento,situacao,valor,srp,compra,fonte_atualizada_em)
 values(v,c->>'objetoCompra',coalesce(c->>'informacaoComplementar',''),c#>>'{orgaoEntidade,cnpj}',coalesce(c#>>'{orgaoEntidade,razaoSocial}',''),coalesce(c#>>'{unidadeOrgao,ufSigla}',''),(c->>'modalidadeId')::integer,licitaflow_coleta.portal(c),
 licitaflow_coleta.tempo(c->>'dataPublicacaoPncp'),licitaflow_coleta.tempo(c->>'dataEncerramentoProposta'),(c->>'situacaoCompraId')::integer,(c->>'valorTotalEstimado')::numeric,(c->>'srp')::boolean,payload,licitaflow_coleta.tempo(coalesce(c->>'dataAtualizacaoGlobal',c->>'dataAtualizacao')))
 on conflict(controle) do update set objeto=excluded.objeto,complemento=excluded.complemento,orgao_nome=excluded.orgao_nome,uf=excluded.uf,modalidade=excluded.modalidade,portal_id=excluded.portal_id,
 publicacao=excluded.publicacao,encerramento=excluded.encerramento,situacao=excluded.situacao,valor=excluded.valor,srp=excluded.srp,compra=excluded.compra,fonte_atualizada_em=excluded.fonte_atualizada_em,coletado_em=now(),
 itens_completos=case when oportunidades_indice.compra is distinct from excluded.compra or oportunidades_indice.fonte_atualizada_em is distinct from excluded.fonte_atualizada_em then false else oportunidades_indice.itens_completos end,
 quantidade_itens=case when oportunidades_indice.compra is distinct from excluded.compra or oportunidades_indice.fonte_atualizada_em is distinct from excluded.fonte_atualizada_em then null else oportunidades_indice.quantidade_itens end;
 if mudou then
  delete from public.oportunidades_itens_indice where controle=v;
  update public.oportunidades_indice set busca_itens=null where controle=v;
 end if;
 -- Itens só são coletados em segundo plano para editais que ainda recebem propostas (economia de espaço).
 if not exists(select 1 from public.oportunidades_indice where controle=v and (itens_completos or encerramento < now())) then
  insert into licitaflow_coleta.jobs(tipo,ciclo,controle) values('itens',v||'/'||md5(payload::text||coalesce(extract(epoch from licitaflow_coleta.tempo(coalesce(c->>'dataAtualizacaoGlobal',c->>'dataAtualizacao')))::text,'')),v) on conflict do nothing;
 end if;
end;$$;

create or replace function public.itens_oportunidade_indexados(p_controle text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when o.itens_completos then coalesce((
   select jsonb_agg(jsonb_build_object(
     'numeroItem',i.numero,'descricao',i.descricao,'quantidade',i.quantidade,'unidadeMedida',i.unidade,
     'valorUnitarioEstimado',i.valor_unitario,'valorTotal',i.valor_total,'orcamentoSigiloso',i.sigiloso,
     'tipoBeneficio',i.beneficio,'tipoBeneficioNome',i.beneficio_nome,'criterioJulgamentoNome',i.criterio,
     'situacaoCompraItemNome',i.situacao,'numeroGrupo',i.grupo,'numeroLote',i.lote) order by i.numero)
   from public.oportunidades_itens_indice i where i.controle=o.controle),'[]'::jsonb) else null end
 from public.oportunidades_indice o where o.controle=p_controle;
$$;
revoke all on function public.itens_oportunidade_indexados(text) from public,anon;
grant execute on function public.itens_oportunidade_indexados(text) to authenticated;

create or replace function public.buscar_oportunidades(p_filtros jsonb default '{}',p_pagina integer default 1,p_tamanho integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare q tsquery;termo text:=trim(coalesce(p_filtros->>'busca',''));mods integer[];portais text[];v_uf text:=coalesce(p_filtros->>'uf','');org text:=nullif(p_filtros->>'orgao','');modo text:=coalesce(p_filtros->>'situacao','abertas');
 de date;ate date;v_min numeric:=nullif(p_filtros->>'minimo','')::numeric;v_max numeric:=nullif(p_filtros->>'maximo','')::numeric;i_min numeric:=nullif(p_filtros->>'itemMinimo','')::numeric;i_max numeric:=nullif(p_filtros->>'itemMaximo','')::numeric;
 max_itens integer:=nullif(p_filtros->>'maxItens','')::integer;exclusivo boolean:=coalesce((p_filtros->>'exclusivo')::boolean,false);sem_valor boolean:=coalesce((p_filtros->>'naoDivulgado')::boolean,false);sem_srp boolean:=coalesce((p_filtros->>'excluirSrp')::boolean,false);por_item boolean;res jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária';end if;
 if p_pagina is null or p_tamanho is null or p_pagina not between 1 and 100000 or p_tamanho not between 1 and 50 or length(termo)>128 or modo not in ('abertas','publicacoes') then raise exception 'Filtros inválidos';end if;
 select array_agg(x::integer) into mods from jsonb_array_elements_text(coalesce(p_filtros->'modalidades','[4,5,6,7,8,9]')) x;
 select array_agg(x) into portais from jsonb_array_elements_text(coalesce(p_filtros->'portais','["comprasnet","pcp","licitacoes-e","caixa","banrisul","rs","bahia","amazonas","goias","rj","recife","licitanet","bll","elic","procergs","mg","banpara","pe","bnc","outros"]')) x;
 if coalesce(array_length(mods,1),0)=0 or coalesce(array_length(portais,1),0)=0 then raise exception 'Selecione modalidade e portal';end if;
 if modo='publicacoes' then de:=(p_filtros->>'inicio')::date;ate:=(p_filtros->>'fim')::date;if de is null or ate is null or de>ate then raise exception 'Período inválido';end if;end if;
 if v_min<0 or v_max<0 or i_min<0 or i_max<0 or v_min>v_max or i_min>i_max or max_itens<1 then raise exception 'Valores inválidos';end if;
 q:=public.oportunidades_termos(termo);
 if termo<>'' and q is null then raise exception 'Informe uma palavra-chave para pesquisar';end if;
 por_item:=i_min is not null or i_max is not null or max_itens is not null or exclusivo;
 with candidatos as materialized (
  select controle from public.oportunidades_indice where q is null
  union select controle from public.oportunidades_indice where busca @@ q
  union select controle from public.oportunidades_indice where busca_itens @@ q
 ), base as materialized (
  select o.controle,o.publicacao,o.orgao_cnpj,o.orgao_nome,o.itens_completos,o.quantidade_itens from candidatos c join public.oportunidades_indice o using(controle)
  where o.modalidade=any(mods) and o.portal_id=any(portais) and (v_uf='' or o.uf=v_uf) and (org is null or o.orgao_cnpj=org)
   and (case when modo='abertas' then o.encerramento>=now() and coalesce(o.situacao,1)=1 else o.publicacao >= (de::timestamp at time zone 'America/Sao_Paulo') and o.publicacao < ((ate+1)::timestamp at time zone 'America/Sao_Paulo') end)
   and (not sem_srp or o.srp=false)
   and (case when sem_valor then coalesce(o.valor,0)=0 else (v_min is null or o.valor>0 and o.valor>=v_min) and (v_max is null or o.valor>0 and o.valor<=v_max) end)
 ), filtrados as materialized (
  select b.* from base b where not por_item or (
   b.itens_completos and (max_itens is null or b.quantidade_itens<=max_itens) and
   ((i_min is null and i_max is null and not exclusivo) or exists(select 1 from public.oportunidades_itens_indice i where i.controle=b.controle
    and (not exclusivo or i.beneficio=1) and ((i_min is null and i_max is null) or not i.sigiloso and i.valor_unitario>0 and (i_min is null or i.valor_unitario>=i_min) and (i_max is null or i.valor_unitario<=i_max))))
  )
 ), pagina as (
  select o.compra from filtrados f join public.oportunidades_indice o using(controle) order by f.publicacao desc nulls last,f.controle limit p_tamanho offset (p_pagina-1)*p_tamanho
 )
 select jsonb_build_object('data',coalesce((select jsonb_agg(compra) from pagina),'[]'::jsonb),'totalRegistros',(select count(*) from filtrados),
 'totalPaginas',ceil((select count(*) from filtrados)::numeric/p_tamanho),'orgaos',coalesce((select jsonb_agg(x) from (select orgao_cnpj cnpj,min(orgao_nome) "razaoSocial" from base group by orgao_cnpj order by min(orgao_nome) limit 200) x),'[]'::jsonb),
 'catalogo',(select to_jsonb(s)-'id' from public.oportunidades_catalogo_status s where id),
 'detalhesPendentes',case when por_item then (select count(*) from base where not itens_completos) else 0 end) into res;
 return res;
end;$$;
revoke all on function public.buscar_oportunidades(jsonb,integer,integer) from public,anon;
grant execute on function public.buscar_oportunidades(jsonb,integer,integer) to authenticated;

-- ============ 4. Limpeza contínua ============
create function licitaflow_coleta.limpar_catalogo() returns jsonb
language plpgsql set search_path='' as $$
declare itens_removidos bigint;jobs_removidos bigint;
begin
 with alvo as (
  select controle from public.oportunidades_indice
   where encerramento < now() - interval '2 days'
     and (itens_completos or busca_itens is not null or exists(select 1 from public.oportunidades_itens_indice i where i.controle=oportunidades_indice.controle))
   limit 5000
 ), apagados as (
  delete from public.oportunidades_itens_indice i using alvo where i.controle=alvo.controle returning 1
 ), marcados as (
  update public.oportunidades_indice o set itens_completos=false,quantidade_itens=null,busca_itens=null from alvo where o.controle=alvo.controle returning 1
 )
 select (select count(*) from apagados) into itens_removidos;
 delete from licitaflow_coleta.jobs where concluido and ciclo<>'base-inicial' and coalesce(concluida_em,criado_em)<now()-interval '1 day';
 get diagnostics jobs_removidos = row_count;
 return jsonb_build_object('itens_removidos',itens_removidos,'jobs_removidos',jobs_removidos);
end;$$;
revoke all on function licitaflow_coleta.limpar_catalogo(), licitaflow_coleta.vetor_itens(text) from public,anon,authenticated;

-- Agenda a limpeza a cada hora (só onde o pg_cron existe; em testes locais é ignorado).
do $$
begin
 if to_regclass('cron.job') is not null then
  perform cron.unschedule(jobid) from cron.job where jobname in ('licitaflow-limpeza-catalogo','licitaflow-limpeza-historico-cron');
  perform cron.schedule('licitaflow-limpeza-catalogo','23 * * * *','select licitaflow_coleta.limpar_catalogo()');
  -- O agendador roda a cada 10 s: guarda só 1 dia do histórico de execuções.
  perform cron.schedule('licitaflow-limpeza-historico-cron','41 3 * * *',$c$delete from cron.job_run_details where end_time < now() - interval '1 day'$c$);
 end if;
end;$$;
