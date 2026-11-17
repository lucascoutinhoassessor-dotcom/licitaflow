BEGIN;

-- Dados públicos compartilhados, separados de organizações, processos e documentos dos clientes.
create schema if not exists licitaflow_coleta;
revoke all on schema licitaflow_coleta from public, anon, authenticated;

create function public.oportunidades_normalizar(p_texto text) returns text
language sql immutable parallel safe set search_path='' as $$
 select translate(lower(coalesce(p_texto,'')), 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaaeeeeiiiiooooouuuucnyy');
$$;
create function public.oportunidades_termos(p_texto text) returns tsquery
language sql immutable parallel safe set search_path='' as $$
 select pg_catalog.to_tsquery('pg_catalog.portuguese',string_agg(quote_literal(t)||':*',' & '))
 from unnest(pg_catalog.tsvector_to_array(pg_catalog.to_tsvector('pg_catalog.portuguese',public.oportunidades_normalizar(p_texto)))) t;
$$;
revoke all on function public.oportunidades_normalizar(text),public.oportunidades_termos(text) from public,anon;
grant execute on function public.oportunidades_normalizar(text),public.oportunidades_termos(text) to authenticated;

create table public.oportunidades_indice (
 controle text primary key,
 objeto text not null,
 complemento text not null default '',
 orgao_cnpj text not null,
 orgao_nome text not null,
 uf text not null,
 modalidade integer not null,
 portal_id text not null,
 publicacao timestamptz,
 encerramento timestamptz,
 situacao integer,
 valor numeric,
 srp boolean,
 compra jsonb not null,
 fonte_atualizada_em timestamptz,
 coletado_em timestamptz not null default now(),
 itens_completos boolean not null default false,
 quantidade_itens integer,
 busca tsvector generated always as (
  setweight(to_tsvector('pg_catalog.portuguese', public.oportunidades_normalizar(objeto)),'A') ||
  setweight(to_tsvector('pg_catalog.portuguese', public.oportunidades_normalizar(complemento)),'B') ||
  setweight(to_tsvector('pg_catalog.portuguese', public.oportunidades_normalizar(orgao_nome||' '||orgao_cnpj||' '||controle||' '||coalesce(compra->>'numeroCompra',''))),'D')
 ) stored
);
create index oportunidades_busca_gin on public.oportunidades_indice using gin(busca);
create index oportunidades_uf_modalidade_data on public.oportunidades_indice(uf,modalidade,publicacao desc);
create index oportunidades_encerramento on public.oportunidades_indice(encerramento);
create index oportunidades_data on public.oportunidades_indice(publicacao desc,controle);
create index oportunidades_orgao on public.oportunidades_indice(orgao_cnpj);

create table public.oportunidades_itens_indice (
 controle text not null references public.oportunidades_indice(controle) on delete cascade,
 numero integer not null,
 descricao text not null default '',
 valor_unitario numeric,
 beneficio integer,
 sigiloso boolean not null default false,
 item jsonb not null,
 busca tsvector generated always as (to_tsvector('pg_catalog.portuguese',public.oportunidades_normalizar(descricao))) stored,
 primary key(controle,numero),
 constraint preco_sigiloso_oculto check(not sigiloso or (valor_unitario is null and (item->>'valorUnitarioEstimado') is null and (item->>'valorTotal') is null))
);
create index oportunidades_itens_busca_gin on public.oportunidades_itens_indice using gin(busca);
create index oportunidades_itens_valor on public.oportunidades_itens_indice(controle,beneficio,valor_unitario) where not sigiloso;

create table public.oportunidades_catalogo_status (
 id boolean primary key default true check(id),
 iniciado_em timestamptz not null default now(),
 ultima_coleta_em timestamptz,
 ultima_carga_completa_em timestamptz,
 carga_inicial_concluida boolean not null default false,
 editais_indexados bigint not null default 0,
 editais_com_itens bigint not null default 0,
 paginas_coletadas integer not null default 0,
 paginas_planejadas integer not null default 6,
 pausado_ate timestamptz,
 aviso text
);
insert into public.oportunidades_catalogo_status(id) values(true);
alter table public.oportunidades_indice enable row level security;
alter table public.oportunidades_itens_indice enable row level security;
alter table public.oportunidades_catalogo_status enable row level security;
create policy oportunidades_ler on public.oportunidades_indice for select to authenticated using((select auth.uid()) is not null);
create policy oportunidades_status_ler on public.oportunidades_catalogo_status for select to authenticated using((select auth.uid()) is not null);
create policy oportunidades_itens_ler on public.oportunidades_itens_indice for select to authenticated using(
 (select auth.uid()) is not null and exists(select 1 from public.oportunidades_indice o where o.controle=oportunidades_itens_indice.controle and o.itens_completos)
);
revoke all on public.oportunidades_indice,public.oportunidades_itens_indice,public.oportunidades_catalogo_status from public,anon,authenticated;
grant select on public.oportunidades_indice,public.oportunidades_itens_indice,public.oportunidades_catalogo_status to authenticated;

create table licitaflow_coleta.portais(id text primary key,dominios jsonb not null,nomes jsonb not null);
create table licitaflow_coleta.estado (
 id boolean primary key default true check(id),ativo boolean not null default false,
 pausa_ate timestamptz,ultima_manutencao_em timestamptz,ultimo_delta_em timestamptz,ultima_varredura_em timestamptz
);
insert into licitaflow_coleta.estado(id) values(true);
create table licitaflow_coleta.jobs (
 id bigint generated always as identity primary key,
 tipo text not null check(tipo in ('abertas','atualizacao','itens')),
 ciclo text not null,
 modalidade integer not null default 0,
 controle text not null default '',
 pagina integer not null default 1 check(pagina between 1 and 10000),
 inicio date,fim date,
 criado_em timestamptz not null default now(),
 concluida_em timestamptz,urgente boolean not null default false,
 request_id bigint,agendada_em timestamptz,
 proxima_em timestamptz not null default now(),
 concluido boolean not null default false,
 bloqueado boolean not null default false,
 tentativas integer not null default 0,
 erro text,
 unique(tipo,ciclo,modalidade,controle,pagina)
);
create index coleta_pendentes on licitaflow_coleta.jobs(proxima_em,pagina,id) where not concluido and request_id is null;
create index coleta_em_voo on licitaflow_coleta.jobs(request_id) where request_id is not null;
create index coleta_janela on licitaflow_coleta.jobs(agendada_em);
create table licitaflow_coleta.envios(request_id bigint primary key,agendada_em timestamptz not null default now());
create index coleta_envios_janela on licitaflow_coleta.envios(agendada_em);
alter table licitaflow_coleta.envios enable row level security;
create table licitaflow_coleta.solicitacoes(user_id uuid not null,controle text not null,criado_em timestamptz not null default now());
create index coleta_solicitacoes_user on licitaflow_coleta.solicitacoes(user_id,criado_em);
alter table licitaflow_coleta.portais enable row level security;
alter table licitaflow_coleta.estado enable row level security;
alter table licitaflow_coleta.jobs enable row level security;
alter table licitaflow_coleta.solicitacoes enable row level security;
revoke all on all tables in schema licitaflow_coleta from public,anon,authenticated;

create function licitaflow_coleta.portal(p_compra jsonb) returns text
language plpgsql stable set search_path='' as $$
declare host text;nome text;v text;
begin
 host:=substring(lower(coalesce(p_compra->>'linkSistemaOrigem','')) from '^https://([^/:?#]+)');
 nome:=public.oportunidades_normalizar(p_compra->>'usuarioNome');
 select p.id into v from licitaflow_coleta.portais p,jsonb_array_elements_text(p.dominios) d where host=d or right(host,length(d)+1)='.'||d limit 1;
 if v is null then select p.id into v from licitaflow_coleta.portais p,jsonb_array_elements_text(p.nomes) n where position(n in nome)>0 order by length(n) desc limit 1;end if;
 return coalesce(v,'outros');
end;$$;
create function licitaflow_coleta.tempo(p_valor text) returns timestamptz
language sql stable set search_path='' as $$
 select case when nullif(p_valor,'') is null then null when p_valor ~ '([zZ]|[+-][0-9]{2}:?[0-9]{2})$' then p_valor::timestamptz else p_valor::timestamp at time zone 'America/Sao_Paulo' end;
$$;

create function licitaflow_coleta.registrar_compra(c jsonb) returns void
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
 if mudou then delete from public.oportunidades_itens_indice where controle=v;end if;
 -- Os detalhes são coletados em segundo plano, com prioridade menor que os editais.
 if not exists(select 1 from public.oportunidades_indice where controle=v and itens_completos) then
  insert into licitaflow_coleta.jobs(tipo,ciclo,controle) values('itens',v||'/'||md5(payload::text||coalesce(extract(epoch from licitaflow_coleta.tempo(coalesce(c->>'dataAtualizacaoGlobal',c->>'dataAtualizacao')))::text,'')),v) on conflict do nothing;
 end if;
end;$$;

create function public.buscar_oportunidades(p_filtros jsonb default '{}',p_pagina integer default 1,p_tamanho integer default 20)
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
  union select i.controle from public.oportunidades_itens_indice i where i.busca @@ q
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

create function public.itens_oportunidade_indexados(p_controle text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when o.itens_completos then coalesce((select jsonb_agg(i.item order by i.numero) from public.oportunidades_itens_indice i where i.controle=o.controle),'[]'::jsonb) else null end from public.oportunidades_indice o where o.controle=p_controle;
$$;
revoke all on function public.itens_oportunidade_indexados(text) from public,anon;
grant execute on function public.itens_oportunidade_indexados(text) to authenticated;
revoke all on all functions in schema licitaflow_coleta from public,anon,authenticated;
insert into licitaflow_coleta.portais values ('comprasnet','["compras.gov.br","comprasnet.gov.br","serpro.gov.br"]'::jsonb,'["compras.gov.br","comprasnet"]'::jsonb);
insert into licitaflow_coleta.portais values ('pcp','["portaldecompraspublicas.com.br"]'::jsonb,'["portal de compras publicas"]'::jsonb);
insert into licitaflow_coleta.portais values ('licitacoes-e','["licitacoes-e.com.br"]'::jsonb,'["licitacoes-e"]'::jsonb);
insert into licitaflow_coleta.portais values ('caixa','["licitacoes.caixa.gov.br"]'::jsonb,'["licitacoes caixa"]'::jsonb);
insert into licitaflow_coleta.portais values ('banrisul','["banrisul.com.br"]'::jsonb,'["banrisul"]'::jsonb);
insert into licitaflow_coleta.portais values ('rs','["compras.rs.gov.br"]'::jsonb,'["compras rs"]'::jsonb);
insert into licitaflow_coleta.portais values ('bahia','["comprasnet.ba.gov.br"]'::jsonb,'["compras bahia"]'::jsonb);
insert into licitaflow_coleta.portais values ('amazonas','["e-compras.am.gov.br"]'::jsonb,'["compras amazonas"]'::jsonb);
insert into licitaflow_coleta.portais values ('goias','["comprasnet.go.gov.br","sislog.go.gov.br"]'::jsonb,'["comprasnet goias","sislog"]'::jsonb);
insert into licitaflow_coleta.portais values ('rj','["compras.rj.gov.br"]'::jsonb,'["compras rj","siga rj"]'::jsonb);
insert into licitaflow_coleta.portais values ('recife','["recife.pe.gov.br"]'::jsonb,'["compras recife"]'::jsonb);
insert into licitaflow_coleta.portais values ('licitanet','["licitanet.com.br"]'::jsonb,'["licitanet"]'::jsonb);
insert into licitaflow_coleta.portais values ('bll','["bll.org.br","bllcompras.com"]'::jsonb,'["bll compras","bolsa de licitacoes e leiloes"]'::jsonb);
insert into licitaflow_coleta.portais values ('elic','["elic.sc.gov.br","portaldecompras.sc.gov.br"]'::jsonb,'["e-lic","compras santa catarina"]'::jsonb);
insert into licitaflow_coleta.portais values ('procergs','["procergs.com.br","procergs.rs.gov.br"]'::jsonb,'["procergs"]'::jsonb);
insert into licitaflow_coleta.portais values ('mg','["compras.mg.gov.br"]'::jsonb,'["compras minas gerais"]'::jsonb);
insert into licitaflow_coleta.portais values ('banpara','["banpara.b.br"]'::jsonb,'["banpara"]'::jsonb);
insert into licitaflow_coleta.portais values ('pe','["peintegrado.pe.gov.br"]'::jsonb,'["pe integrado"]'::jsonb);
insert into licitaflow_coleta.portais values ('bnc','["bnc.org.br"]'::jsonb,'["bolsa nacional de compras","bnc"]'::jsonb);
insert into licitaflow_coleta.portais values ('outros','[]'::jsonb,'[]'::jsonb);

-- A função é ativada por Cron no deploy; as pesquisas nunca executam este coletor.
create function licitaflow_coleta.registrar_itens(p_controle text,p_itens jsonb,p_pagina integer,p_final boolean) returns void
language plpgsql set search_path='' as $$
declare i jsonb;v jsonb;sigilo boolean;
begin
 if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)>500 then raise exception 'Página de itens inválida';end if;
 if p_pagina=1 then
  update public.oportunidades_indice set itens_completos=false,quantidade_itens=null where controle=p_controle;
  delete from public.oportunidades_itens_indice where controle=p_controle;
 end if;
 for i in select value from jsonb_array_elements(p_itens) loop
  sigilo:=coalesce((i->>'orcamentoSigiloso')::boolean,false);
  v:=jsonb_build_object('numeroItem',i->'numeroItem','descricao',i->'descricao','quantidade',i->'quantidade','unidadeMedida',i->'unidadeMedida',
   'valorUnitarioEstimado',case when sigilo then null else i->'valorUnitarioEstimado' end,'valorTotal',case when sigilo then null else i->'valorTotal' end,
   'orcamentoSigiloso',sigilo,'tipoBeneficio',i->'tipoBeneficio','tipoBeneficioNome',i->'tipoBeneficioNome','criterioJulgamentoNome',i->'criterioJulgamentoNome','situacaoCompraItemNome',i->'situacaoCompraItemNome',
   'numeroGrupo',i->'numeroGrupo','grupo',i->'grupo','numeroLote',i->'numeroLote','lote',i->'lote');
  if (i->>'numeroItem')::integer is null then raise exception 'Item sem identificação';end if;
  if p_pagina>1 and exists(select 1 from public.oportunidades_itens_indice where controle=p_controle and numero=(i->>'numeroItem')::integer) then raise exception 'A fonte repetiu a página de itens';end if;
  insert into public.oportunidades_itens_indice(controle,numero,descricao,valor_unitario,beneficio,sigiloso,item)
  values(p_controle,(i->>'numeroItem')::integer,coalesce(i->>'descricao',''),case when sigilo then null else (i->>'valorUnitarioEstimado')::numeric end,(i->>'tipoBeneficio')::integer,sigilo,v);
 end loop;
 if p_final then update public.oportunidades_indice set itens_completos=true,quantidade_itens=(select count(*) from public.oportunidades_itens_indice where controle=p_controle) where controle=p_controle;end if;
end;$$;

create function licitaflow_coleta.esperar_fonte(p_cabecalho text) returns timestamptz
language plpgsql set search_path='' as $$
begin
 if p_cabecalho ~ '^[0-9]+$' then return now()+make_interval(secs=>greatest(1,p_cabecalho::double precision));end if;
 if p_cabecalho is not null then return greatest(now()+interval '1 second',p_cabecalho::timestamptz);end if;
 return now()+interval '1 minute';
exception when others then return now()+interval '5 minutes';
end;$$;

create function licitaflow_coleta.tick() returns jsonb
language plpgsql set search_path='' as $$
declare j record;r record;c jsonb;d jsonb;u text;params jsonb;novo bigint;n integer;processados integer:=0;enviados integer:=0;dados_enviados integer:=0;slot integer;voo integer;janela integer;ate timestamptz;estado record;hoje date:=(now() at time zone 'America/Sao_Paulo')::date;novo_ciclo text;versao text;mudou boolean:=false;
begin
 if not pg_try_advisory_xact_lock(73481041) then return '{"ocupado":true}'::jsonb;end if;
 select * into estado from licitaflow_coleta.estado where id for update;
 if not estado.ativo then return '{"ativo":false}'::jsonb;end if;
 -- Consome somente respostas que pertencem aos nossos pedidos.
 for j in select * from licitaflow_coleta.jobs where request_id is not null and not concluido order by id limit 24 loop
  select * into r from net._http_response where id=j.request_id order by created desc limit 1;
  if not found then
   if j.agendada_em<now()-interval '90 seconds' then delete from net.http_request_queue where id=j.request_id;update licitaflow_coleta.jobs set request_id=null,proxima_em=now()+interval '1 minute',erro='Tempo de resposta excedido' where id=j.id;end if;
   continue;
  end if;
  begin
   if r.status_code=429 then
    ate:=licitaflow_coleta.esperar_fonte(coalesce(r.headers->>'retry-after',r.headers->>'Retry-After'));
    update licitaflow_coleta.estado set pausa_ate=greatest(pausa_ate,ate) where id;
    update licitaflow_coleta.jobs set request_id=null,proxima_em=ate,erro='Limite temporário da fonte' where id=j.id;
    update public.oportunidades_catalogo_status set pausado_ate=ate,aviso='A fonte pediu uma pausa na atualização. A pesquisa continua disponível.' where id;
   elsif r.status_code in (200,204) and not coalesce(r.timed_out,false) and r.error_msg is null then
    d:=case when r.status_code=204 then case when j.tipo='itens' then '[]'::jsonb else '{"data":[],"totalPaginas":0}'::jsonb end else r.content::jsonb end;
    if j.tipo='itens' then
     select o.controle||'/'||md5(o.compra::text||coalesce(extract(epoch from o.fonte_atualizada_em)::text,'')) into versao from public.oportunidades_indice o where o.controle=j.controle;
     if versao is not distinct from j.ciclo then
      n:=jsonb_array_length(d);
      if j.pagina>=20 and n=500 then raise exception 'Detalhamento excede limite de verificação';end if;
      perform licitaflow_coleta.registrar_itens(j.controle,d,j.pagina,n<500);
      if n=500 then insert into licitaflow_coleta.jobs(tipo,ciclo,controle,pagina) values('itens',j.ciclo,j.controle,j.pagina+1) on conflict do nothing;end if;
     end if;
    else
     if jsonb_typeof(d->'data')<>'array' or (d->>'totalPaginas')::integer is null then raise exception 'Resposta de catálogo inválida';end if;
     if (d->>'totalPaginas')::integer>10000 then raise exception 'Fonte excedeu limite de paginação';end if;
     for c in select value from jsonb_array_elements(d->'data') loop
      -- Não cria um arquivo histórico ilimitado: foco em oportunidades em aberto e registros já acompanhados.
      if j.tipo='abertas' or licitaflow_coleta.tempo(c->>'dataEncerramentoProposta')>=now() or exists(select 1 from public.oportunidades_indice where controle=c->>'numeroControlePNCP') then perform licitaflow_coleta.registrar_compra(c);end if;
     end loop;
     insert into licitaflow_coleta.jobs(tipo,ciclo,modalidade,pagina,inicio,fim)
      select j.tipo,j.ciclo,j.modalidade,p,j.inicio,j.fim from generate_series(2,(d->>'totalPaginas')::integer) p on conflict do nothing;
    end if;
    update licitaflow_coleta.jobs set concluido=true,concluida_em=now(),request_id=null,erro=null where id=j.id;
    processados:=processados+1;mudou:=true;
   else
    update licitaflow_coleta.jobs set request_id=null,proxima_em=now()+make_interval(secs=>least(900,30*power(2,least(j.tentativas,5)))::integer),erro='Falha temporária na fonte' where id=j.id;
   end if;
  exception when others then
   update licitaflow_coleta.jobs set request_id=null,proxima_em=now()+interval '15 minutes',erro='Resposta incompatível ou incompleta da fonte',bloqueado=(j.tipo='itens' and j.pagina>=20) where id=j.id;
  end;
  delete from net._http_response where id=j.request_id;
 end loop;
 update public.oportunidades_catalogo_status set aviso=case
  when (select pausa_ate from licitaflow_coleta.estado where id)>now() then 'A fonte pediu uma pausa na atualização. A pesquisa continua disponível.'
  when exists(select 1 from licitaflow_coleta.jobs where not concluido and erro is not null) then 'Parte da atualização aguarda nova tentativa na fonte.'
  else null end where id;
 -- A primeira carga só fica completa quando todas as páginas planejadas foram persistidas.
 if exists(select 1 from licitaflow_coleta.jobs where tipo='abertas' and ciclo='base-inicial') and not exists(select 1 from licitaflow_coleta.jobs where tipo='abertas' and ciclo='base-inicial' and not concluido) then
  update public.oportunidades_catalogo_status set carga_inicial_concluida=true,ultima_carga_completa_em=coalesce(ultima_carga_completa_em,now()) where id;
 end if;
 if (select carga_inicial_concluida from public.oportunidades_catalogo_status where id) then
  -- Checkpoint por ciclo; a próxima atualização é agendada após a anterior terminar.
  if not exists(select 1 from licitaflow_coleta.jobs where tipo='atualizacao' and not concluido and not bloqueado) and coalesce(estado.ultimo_delta_em,'epoch'::timestamptz)<now()-interval '15 minutes' then
   novo_ciclo:='delta/'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS');
   insert into licitaflow_coleta.jobs(tipo,ciclo,modalidade,inicio,fim) select 'atualizacao',novo_ciclo,m,coalesce((estado.ultimo_delta_em at time zone 'America/Sao_Paulo')::date,hoje),hoje from unnest(array[4,5,6,7,8,9]) m;
   update licitaflow_coleta.estado set ultimo_delta_em=now() where id;
  end if;
  if not exists(select 1 from licitaflow_coleta.jobs where tipo='abertas' and not concluido) and coalesce(estado.ultima_varredura_em,'epoch'::timestamptz)<now()-interval '24 hours' then
   novo_ciclo:='abertas/'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS');
   insert into licitaflow_coleta.jobs(tipo,ciclo,modalidade) select 'abertas',novo_ciclo,m from unnest(array[4,5,6,7,8,9]) m;
   update licitaflow_coleta.estado set ultima_varredura_em=now() where id;
  end if;
 end if;
 if mudou then
  update public.oportunidades_catalogo_status set ultima_coleta_em=now(),editais_indexados=(select count(*) from public.oportunidades_indice),editais_com_itens=(select count(*) from public.oportunidades_indice where itens_completos),
   paginas_coletadas=(select count(*) from licitaflow_coleta.jobs where tipo='abertas' and ciclo='base-inicial' and concluido),paginas_planejadas=(select count(*) from licitaflow_coleta.jobs where tipo='abertas' and ciclo='base-inicial'),
   aviso=case when exists(select 1 from licitaflow_coleta.jobs where not concluido and erro is not null) then 'Parte da atualização aguarda nova tentativa na fonte.' else null end where id;
 end if;
 select pausa_ate into ate from licitaflow_coleta.estado where id;
 if ate>now() then return jsonb_build_object('processados',processados,'pausado_ate',ate);end if;
 select count(*) into voo from licitaflow_coleta.jobs where request_id is not null;
 select count(*) into janela from licitaflow_coleta.envios where agendada_em>=now()-interval '1 minute';
 for slot in 1..greatest(0,least(4-voo,24-janela)) loop
  select * into j from licitaflow_coleta.jobs where not concluido and not bloqueado and request_id is null and proxima_em<=now()
   order by case when tipo='abertas' and ciclo='base-inicial' then 0 when tipo='itens' and urgente then 1
     when dados_enviados>=2 then case when tipo='itens' then 2 else 3 end
     else case when tipo<>'itens' then 2 else 3 end end,pagina,id limit 1 for update skip locked;
  if not found then exit;end if;
  if j.tipo='itens' then
   select compra into c from public.oportunidades_indice where controle=j.controle;
   if c is null then update licitaflow_coleta.jobs set concluido=true,concluida_em=now() where id=j.id;continue;end if;
   if coalesce(c->>'anoCompra','') !~ '^[0-9]{4}$' or coalesce(c->>'sequencialCompra','') !~ '^[1-9][0-9]*$' then update licitaflow_coleta.jobs set bloqueado=true,erro='Identificação de detalhes inválida na fonte' where id=j.id;continue;end if;
   u:='https://pncp.gov.br/api/pncp/v1/orgaos/'||(c#>>'{orgaoEntidade,cnpj}')||'/compras/'||(c->>'anoCompra')||'/'||(c->>'sequencialCompra')||'/itens';
   params:=jsonb_build_object('pagina',j.pagina,'tamanhoPagina',500);
  else
   u:='https://pncp.gov.br/api/consulta/v1/contratacoes/'||case when j.tipo='abertas' then 'proposta' else 'atualizacao' end;
   params:=jsonb_build_object('codigoModalidadeContratacao',j.modalidade,'pagina',j.pagina,'tamanhoPagina',50,'dataFinal',case when j.tipo='abertas' then '20991231' else to_char(j.fim,'YYYYMMDD') end);
   if j.tipo='atualizacao' then params:=params||jsonb_build_object('dataInicial',to_char(j.inicio,'YYYYMMDD'));end if;
  end if;
  novo:=net.http_get(url:=u,params:=params,timeout_milliseconds:=20000);
  update licitaflow_coleta.jobs set request_id=novo,agendada_em=now(),tentativas=tentativas+1 where id=j.id;
  insert into licitaflow_coleta.envios(request_id) values(novo);
  enviados:=enviados+1;
  if j.tipo<>'itens' then dados_enviados:=dados_enviados+1;end if;
 end loop;
 if coalesce(estado.ultima_manutencao_em,'epoch'::timestamptz)<now()-interval '15 minutes' then
  delete from licitaflow_coleta.solicitacoes where criado_em<now()-interval '1 day';
  delete from licitaflow_coleta.envios where agendada_em<now()-interval '1 day';
  delete from licitaflow_coleta.jobs where concluido and ciclo<>'base-inicial' and coalesce(concluida_em,criado_em)<now()-interval '7 days';
  delete from public.oportunidades_indice where controle in (select controle from public.oportunidades_indice where encerramento<now()-interval '30 days' and publicacao<now()-interval '30 days' limit 1000);
  update licitaflow_coleta.estado set ultima_manutencao_em=now() where id;
 end if;
 update public.oportunidades_catalogo_status set ultima_carga_completa_em=greatest(ultima_carga_completa_em,(select max(fim) from (select max(concluida_em) fim from licitaflow_coleta.jobs where tipo='abertas' group by ciclo having bool_and(concluido)) x)) where id and carga_inicial_concluida;
 update public.oportunidades_catalogo_status set pausado_ate=null where id and pausado_ate<=now();
 return jsonb_build_object('processados',processados,'enviados',enviados);
end;$$;

create function public.solicitar_itens_oportunidade(p_controle text) returns void
language plpgsql security definer set search_path='' as $$
declare c record;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária';end if;
 select * into c from public.oportunidades_indice where controle=p_controle;
 if not found then raise exception 'Edital não encontrado';end if;
 if c.itens_completos then return;end if;
 if (select count(*) from licitaflow_coleta.solicitacoes where user_id=auth.uid() and criado_em>now()-interval '1 hour')>=30 then return;end if;
 insert into licitaflow_coleta.solicitacoes(user_id,controle) values(auth.uid(),p_controle);
 insert into licitaflow_coleta.jobs(tipo,ciclo,controle,proxima_em,urgente) values('itens',p_controle||'/'||md5(c.compra::text||coalesce(extract(epoch from c.fonte_atualizada_em)::text,'')),p_controle,now(),true)
 on conflict(tipo,ciclo,modalidade,controle,pagina) do update set proxima_em=least(jobs.proxima_em,now()),urgente=true;
end;$$;
revoke all on function public.solicitar_itens_oportunidade(text) from public,anon;
grant execute on function public.solicitar_itens_oportunidade(text) to authenticated;
revoke all on all functions in schema licitaflow_coleta from public,anon,authenticated;

insert into licitaflow_coleta.jobs(tipo,ciclo,modalidade) select 'abertas','base-inicial',m from unnest(array[4,5,6,7,8,9]) m;


create function public.admin_catalogo_oportunidades(p_ativo boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare agendado boolean:=false;
begin
 perform public.exigir_admin();
 if to_regclass('cron.job') is not null then execute 'select exists(select 1 from cron.job where jobname=$1)' into agendado using 'licitaflow-coleta-oportunidades';end if;
 if p_ativo is not null then
  if p_ativo and not agendado then raise exception 'A atualização automática ainda precisa ser configurada no banco';end if;
  update licitaflow_coleta.estado set ativo=p_ativo where id;
  update public.oportunidades_catalogo_status set aviso=case when p_ativo then null else 'A atualização automática está pausada. A pesquisa continua disponível.' end where id;
  insert into public.admin_audit(ator,acao,alvo,dados) values(auth.uid(),'coleta.alterar','oportunidades',jsonb_build_object('ativo',p_ativo));
 end if;
 return jsonb_build_object('ativo',(select ativo from licitaflow_coleta.estado where id),'agendado',agendado,
  'catalogo',(select to_jsonb(s)-'id' from public.oportunidades_catalogo_status s where id),
  'fila',(select count(*) from licitaflow_coleta.jobs where not concluido and not bloqueado),
  'pedidos_em_andamento',(select count(*) from licitaflow_coleta.jobs where request_id is not null),
  'aguardando_tentativa',(select count(*) from licitaflow_coleta.jobs where not concluido and erro is not null));
end;$$;
revoke all on function public.admin_catalogo_oportunidades(boolean) from public,anon;
grant execute on function public.admin_catalogo_oportunidades(boolean) to authenticated;

-- Executar somente após as migrações indice_oportunidades e coleta_oportunidades.
-- Sem chaves no navegador, sem serviço externo pago, sem acesso aos dados dos clientes.

create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
revoke usage on schema net from public,anon,authenticated;
revoke execute on all functions in schema net from public,anon,authenticated;
grant usage on schema net to postgres;
grant execute on all functions in schema net to postgres;
grant select,delete on net._http_response,net.http_request_queue to postgres;
update licitaflow_coleta.estado set ativo=true,ultima_varredura_em=now() where id;
select cron.schedule('licitaflow-coleta-oportunidades','10 seconds','select licitaflow_coleta.tick();');
select licitaflow_coleta.tick();


COMMIT;
