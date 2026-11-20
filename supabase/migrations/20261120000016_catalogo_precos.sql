-- LicitaFlow · Catálogo de materiais (PDM) e serviços do governo federal, base do Histórico de preços.
-- Fonte: dados abertos do Compras.gov.br (modulo-material/3_consultarPdmMaterial e modulo-servico/6_consultarItemServico).
-- Guardamos só nome → código (~18 mil linhas, ~4 MB). Os preços praticados são consultados na hora
-- (Painel de Preços, modulo-pesquisa-preco) pela função /api/precos, sem ocupar espaço no banco.
-- O carregamento roda no próprio banco (pg_net + pg_cron), uma página de 500 por minuto, e se repete a cada 7 dias.

create table public.catalogo_compras (
  tipo char(1) not null check (tipo in ('M','S')),
  codigo integer not null,
  nome text not null,
  classe text not null default '',
  grupo text not null default '',
  busca tsvector generated always as (
    setweight(to_tsvector('pg_catalog.portuguese', public.oportunidades_normalizar(nome)), 'A') ||
    setweight(to_tsvector('pg_catalog.portuguese', public.oportunidades_normalizar(classe)), 'C')
  ) stored,
  atualizado_em timestamptz not null default now(),
  primary key (tipo, codigo)
);
create index catalogo_compras_busca on public.catalogo_compras using gin(busca);
alter table public.catalogo_compras enable row level security;
create policy catalogo_compras_ler on public.catalogo_compras for select to authenticated using ((select auth.uid()) is not null);
revoke all on public.catalogo_compras from public, anon, authenticated;
grant select on public.catalogo_compras to authenticated;

-- Estado do carregamento: uma linha por tipo (M = materiais/PDM, S = serviços).
create table licitaflow_coleta.catalogo_carga (
  tipo char(1) primary key check (tipo in ('M','S')),
  pagina integer not null default 1,
  total_paginas integer,
  request_id bigint,
  agendada_em timestamptz,
  concluida_em timestamptz,
  erro text,
  tentativas integer not null default 0
);
insert into licitaflow_coleta.catalogo_carga(tipo) values ('M'), ('S') on conflict do nothing;

create or replace function licitaflow_coleta.registrar_catalogo(p_tipo char, p_lista jsonb) returns integer
language plpgsql set search_path='' as $$
declare n integer;
begin
 if jsonb_typeof(p_lista)<>'array' or jsonb_array_length(p_lista)>1000 then raise exception 'Página de catálogo inválida';end if;
 if p_tipo='M' then
  insert into public.catalogo_compras(tipo,codigo,nome,classe,grupo,atualizado_em)
  select 'M',(x->>'codigoPdm')::integer,trim(both '"' from x->>'nomePdm'),coalesce(x->>'nomeClasse',''),coalesce(x->>'nomeGrupo',''),now()
    from jsonb_array_elements(p_lista) x
   where x->>'codigoPdm' ~ '^[0-9]+$' and coalesce(x->>'nomePdm','')<>'' and coalesce((x->>'statusPdm')::boolean,true)
  on conflict (tipo,codigo) do update set nome=excluded.nome,classe=excluded.classe,grupo=excluded.grupo,atualizado_em=now();
 else
  insert into public.catalogo_compras(tipo,codigo,nome,classe,grupo,atualizado_em)
  select 'S',(x->>'codigoServico')::integer,x->>'nomeServico',coalesce(x->>'nomeClasse',''),coalesce(x->>'nomeGrupo',''),now()
    from jsonb_array_elements(p_lista) x
   where x->>'codigoServico' ~ '^[0-9]+$' and coalesce(x->>'nomeServico','')<>'' and coalesce((x->>'statusServico')::boolean,true)
  on conflict (tipo,codigo) do update set nome=excluded.nome,classe=excluded.classe,grupo=excluded.grupo,atualizado_em=now();
 end if;
 get diagnostics n = row_count;
 return n;
end;$$;

create or replace function licitaflow_coleta.tick_catalogo() returns jsonb
language plpgsql set search_path='' as $$
declare c record;r record;d jsonb;u text;novo bigint;feitos integer:=0;
begin
 if not pg_try_advisory_xact_lock(73481043) then return '{"ocupado":true}'::jsonb;end if;
 for c in select * from licitaflow_coleta.catalogo_carga order by tipo for update loop
  -- Carga concluída há mais de 7 dias: recomeça (atualização semanal).
  if c.concluida_em is not null then
   if c.concluida_em < now()-interval '7 days' then update licitaflow_coleta.catalogo_carga set pagina=1,total_paginas=null,concluida_em=null,erro=null,tentativas=0 where tipo=c.tipo;end if;
   continue;
  end if;
  if c.request_id is not null then
   select * into r from net._http_response where id=c.request_id order by created desc limit 1;
   if not found then
    if c.agendada_em<now()-interval '2 minutes' then update licitaflow_coleta.catalogo_carga set request_id=null,erro='Tempo de resposta excedido' where tipo=c.tipo;end if;
    continue;
   end if;
   begin
    if r.status_code=200 and r.error_msg is null then
     d:=r.content::jsonb;
     if jsonb_typeof(d->'resultado')<>'array' then raise exception 'Resposta inesperada';end if;
     perform licitaflow_coleta.registrar_catalogo(c.tipo,d->'resultado');
     feitos:=feitos+1;
     if c.pagina>=coalesce((d->>'totalPaginas')::integer,0) or c.pagina>=200 then
      update licitaflow_coleta.catalogo_carga set request_id=null,total_paginas=(d->>'totalPaginas')::integer,concluida_em=now(),erro=null,tentativas=0 where tipo=c.tipo;
     else
      update licitaflow_coleta.catalogo_carga set request_id=null,pagina=c.pagina+1,total_paginas=(d->>'totalPaginas')::integer,erro=null,tentativas=0 where tipo=c.tipo;
     end if;
    else
     update licitaflow_coleta.catalogo_carga set request_id=null,erro='Falha temporária na fonte',tentativas=c.tentativas+1 where tipo=c.tipo;
    end if;
   exception when others then
    update licitaflow_coleta.catalogo_carga set request_id=null,erro='Resposta incompatível da fonte',tentativas=c.tentativas+1 where tipo=c.tipo;
   end;
   delete from net._http_response where id=c.request_id;
   continue;
  end if;
  if c.tentativas>=12 then continue;end if;
  u:=case when c.tipo='M' then 'https://dadosabertos.compras.gov.br/modulo-material/3_consultarPdmMaterial' else 'https://dadosabertos.compras.gov.br/modulo-servico/6_consultarItemServico' end;
  novo:=net.http_get(url:=u,params:=case when c.tipo='M' then jsonb_build_object('pagina',c.pagina,'tamanhoPagina',500,'statusPdm','true') else jsonb_build_object('pagina',c.pagina,'tamanhoPagina',500,'statusServico','true') end,timeout_milliseconds:=60000);
  update licitaflow_coleta.catalogo_carga set request_id=novo,agendada_em=now() where tipo=c.tipo;
 end loop;
 return jsonb_build_object('paginas_processadas',feitos);
end;$$;
revoke all on function licitaflow_coleta.registrar_catalogo(char,jsonb), licitaflow_coleta.tick_catalogo() from public,anon,authenticated;

-- Pesquisa por palavra no catálogo (para escolher o código antes de consultar os preços).
create or replace function public.buscar_catalogo(p_termo text, p_tipo text default '') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare q tsquery;termo text:=trim(coalesce(p_termo,''));res jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária';end if;
 if length(termo)>120 or coalesce(p_tipo,'') not in ('','M','S') then raise exception 'Pesquisa inválida';end if;
 q:=public.oportunidades_termos(termo);
 if q is null then return jsonb_build_object('data','[]'::jsonb,'catalogo',(select jsonb_build_object('itens',count(*)) from public.catalogo_compras));end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into res from (
  select tipo,codigo,nome,classe from public.catalogo_compras
   where busca @@ q and (coalesce(p_tipo,'')='' or tipo=p_tipo)
   order by ts_rank(busca,q) desc, length(nome), codigo limit 20) x;
 return jsonb_build_object('data',res,'catalogo',(select jsonb_build_object('itens',count(*)) from public.catalogo_compras));
end;$$;
revoke all on function public.buscar_catalogo(text,text) from public,anon;
grant execute on function public.buscar_catalogo(text,text) to authenticated;

do $$
begin
 if to_regclass('cron.job') is not null then
  perform cron.unschedule(jobid) from cron.job where jobname='licitaflow-catalogo-precos';
  perform cron.schedule('licitaflow-catalogo-precos','* * * * *','select licitaflow_coleta.tick_catalogo()');
 end if;
end;$$;
