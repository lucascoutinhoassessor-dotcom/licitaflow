-- LicitaFlow · Pedidos de itens de editais removidos do PNCP não travam mais a fila.
-- Em 20/11/2026, cerca de 165 jobs de itens recebiam "404 Contratação não cadastrada" (o edital foi retirado
-- do PNCP) e eram tratados como falha temporária: voltavam a cada 15 minutos para o início da fila
-- (já com 167 tentativas) e ocupavam quase toda a vaga de itens, então a recoleta não andava.
-- Agora: 404 em itens encerra o job; jobs de itens param de tentar após 12 falhas (as listas de editais seguem tentando).

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
   elsif j.tipo='itens' and r.status_code=404 then
    -- Edital retirado do PNCP: não adianta tentar de novo.
    update licitaflow_coleta.jobs set concluido=true,concluida_em=now(),request_id=null,erro='Contratação não encontrada na fonte' where id=j.id;
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
    update licitaflow_coleta.jobs set request_id=null,proxima_em=now()+make_interval(secs=>least(900,30*power(2,least(j.tentativas,5)))::integer),erro='Falha temporária na fonte',
     concluido=(j.tipo='itens' and j.tentativas>=12),concluida_em=case when j.tipo='itens' and j.tentativas>=12 then now() end where id=j.id;
   end if;
  exception when others then
   update licitaflow_coleta.jobs set request_id=null,proxima_em=now()+interval '15 minutes',erro='Resposta incompatível ou incompleta da fonte',bloqueado=(j.tipo='itens' and j.pagina>=20),
    concluido=(j.tipo='itens' and j.tentativas>=12),concluida_em=case when j.tipo='itens' and j.tentativas>=12 then now() end where id=j.id;
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

-- Jobs de itens que já falharam muitas vezes (editais retirados) saem da fila.
update licitaflow_coleta.jobs set concluido=true,concluida_em=now(),erro='Desistência após 12 tentativas na fonte'
 where tipo='itens' and not concluido and request_id is null and tentativas>=12 and erro is not null;
