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
