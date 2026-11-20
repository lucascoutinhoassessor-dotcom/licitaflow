-- LicitaFlow · Amplia a cobertura do PNCP para todas as modalidades da Lei 14.133 e corrige a recoleta de itens.
--
-- Modalidades do PNCP (codigoModalidadeContratacao):
--   1 Leilão eletrônico · 2 Diálogo competitivo · 3 Concurso · 4 Concorrência eletrônica · 5 Concorrência presencial
--   6 Pregão eletrônico · 7 Pregão presencial · 8 Dispensa · 9 Inexigibilidade · 10 Manifestação de interesse
--   11 Pré-qualificação · 12 Credenciamento · 13 Leilão presencial
-- Antes eram coletadas só 4 a 9. Medição em 19/11/2026 (editais recebendo propostas no PNCP):
--   12 = 12.230, 11 = 208, 1 = 146, 13 = 43, 10 = 24, 3 = 14, 2 = 0 → cerca de 12.700 editais a mais.
--
-- Correção: os jobs de itens enfileirados na recoleta de 19/11 (ciclo controle||'/recoleta-20261119')
-- não batiam com a "versão" do edital que o coletor exige e eram concluídos sem gravar nada.
-- O coletor passa a aceitar esse ciclo, e os jobs já concluídos sem itens voltam para a fila.

-- Lista única das modalidades coletadas (usada pelo coletor).
create or replace function licitaflow_coleta.modalidades() returns integer[]
language sql immutable set search_path='' as $$ select '{1,2,3,4,5,6,7,8,9,10,11,12,13}'::integer[] $$;
revoke all on function licitaflow_coleta.modalidades() from public,anon,authenticated;

create or replace function licitaflow_coleta.tick() returns jsonb
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
     -- Aceita a versão atual do edital ou uma recoleta manual (ciclo controle/recoleta-AAAAMMDD).
     if versao is not distinct from j.ciclo or left(j.ciclo,length(j.controle)+10)=j.controle||'/recoleta-' then
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
   insert into licitaflow_coleta.jobs(tipo,ciclo,modalidade,inicio,fim) select 'atualizacao',novo_ciclo,m,coalesce((estado.ultimo_delta_em at time zone 'America/Sao_Paulo')::date,hoje),hoje from unnest(licitaflow_coleta.modalidades()) m;
   update licitaflow_coleta.estado set ultimo_delta_em=now() where id;
  end if;
  if not exists(select 1 from licitaflow_coleta.jobs where tipo='abertas' and not concluido) and coalesce(estado.ultima_varredura_em,'epoch'::timestamptz)<now()-interval '24 hours' then
   novo_ciclo:='abertas/'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS');
   insert into licitaflow_coleta.jobs(tipo,ciclo,modalidade) select 'abertas',novo_ciclo,m from unnest(licitaflow_coleta.modalidades()) m;
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

create or replace function public.buscar_oportunidades(p_filtros jsonb default '{}',p_pagina integer default 1,p_tamanho integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare q tsquery;termo text:=trim(coalesce(p_filtros->>'busca',''));mods integer[];portais text[];v_uf text:=coalesce(p_filtros->>'uf','');org text:=nullif(p_filtros->>'orgao','');modo text:=coalesce(p_filtros->>'situacao','abertas');
 de date;ate date;v_min numeric:=nullif(p_filtros->>'minimo','')::numeric;v_max numeric:=nullif(p_filtros->>'maximo','')::numeric;i_min numeric:=nullif(p_filtros->>'itemMinimo','')::numeric;i_max numeric:=nullif(p_filtros->>'itemMaximo','')::numeric;
 max_itens integer:=nullif(p_filtros->>'maxItens','')::integer;exclusivo boolean:=coalesce((p_filtros->>'exclusivo')::boolean,false);sem_valor boolean:=coalesce((p_filtros->>'naoDivulgado')::boolean,false);sem_srp boolean:=coalesce((p_filtros->>'excluirSrp')::boolean,false);por_item boolean;res jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária';end if;
 if p_pagina is null or p_tamanho is null or p_pagina not between 1 and 100000 or p_tamanho not between 1 and 50 or length(termo)>128 or modo not in ('abertas','publicacoes') then raise exception 'Filtros inválidos';end if;
 select array_agg(x::integer) into mods from jsonb_array_elements_text(coalesce(p_filtros->'modalidades','[1,2,3,4,5,6,7,8,9,10,11,12,13]')) x;
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

-- Recoleta: jobs concluídos sem gravar itens (editais ainda abertos e sem itens) voltam para a fila.
update licitaflow_coleta.jobs j set concluido=false,concluida_em=null,request_id=null,erro=null,proxima_em=now()
 from public.oportunidades_indice o
 where j.tipo='itens' and j.controle=o.controle and left(j.ciclo,length(j.controle)+10)=j.controle||'/recoleta-'
   and j.concluido and not o.itens_completos and o.encerramento>=now()
   and not exists(select 1 from licitaflow_coleta.jobs v where v.tipo='itens' and v.controle=j.controle and not v.concluido);
-- Sem coleta dupla: recoleta pendente sai da fila quando o edital já tem um job normal de itens pendente.
delete from licitaflow_coleta.jobs r
 where r.tipo='itens' and left(r.ciclo,length(r.controle)+10)=r.controle||'/recoleta-' and not r.concluido and r.request_id is null
   and exists(select 1 from licitaflow_coleta.jobs v where v.tipo='itens' and v.controle=r.controle and not v.concluido
              and left(v.ciclo,length(v.controle)+10)<>v.controle||'/recoleta-');

-- Carga das modalidades novas (o próximo ciclo diário já inclui todas).
insert into licitaflow_coleta.jobs(tipo,ciclo,modalidade)
select 'abertas','abertas/ampliacao-20261119',m from unnest(array[1,2,3,10,11,12,13]) m
on conflict do nothing;
