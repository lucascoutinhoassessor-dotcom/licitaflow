-- LicitaFlow · Oportunidades desertas e fracassadas.
-- Depois da sessão, o órgão marca no PNCP os itens que ficaram sem proposta (Deserto, código 4) ou sem proposta
-- válida (Fracassado, código 5). Esses itens costumam voltar em nova licitação ou em dispensa (Lei 14.133/2021,
-- art. 75, III), então são uma oportunidade para quem não participou.
-- O catálogo só guardava os itens antes da sessão. Agora o coletor relê os itens de cada pregão, concorrência e
-- dispensa 2, 7 e 20 dias depois da sessão, com a menor prioridade da fila, e guarda só os desertos e fracassados
-- numa tabela própria e pequena (~17% dos pregões têm algum, ~250 bytes por item). Os editais continuam
-- saindo do catálogo 30 dias depois da sessão, e seus desertos saem junto (on delete cascade).

alter table public.oportunidades_indice add column if not exists verificacoes_deserto smallint not null default 0;
-- Só os editais que ainda vão ser verificados: o agendamento lê este índice, nunca a tabela inteira.
create index if not exists oportunidades_verificar_deserto on public.oportunidades_indice(encerramento)
 where verificacoes_deserto<3 and modalidade in (2,4,5,6,7,8);

create table if not exists public.oportunidades_desertos (
 controle text not null references public.oportunidades_indice(controle) on delete cascade,
 numero integer not null,
 situacao smallint not null check (situacao in (4,5)),
 descricao text not null default '',
 quantidade numeric,
 unidade text,
 valor_unitario numeric,
 beneficio smallint,
 sigiloso boolean not null default false,
 verificado_em timestamptz not null default now(),
 busca tsvector generated always as (to_tsvector('pg_catalog.portuguese',public.oportunidades_normalizar(descricao))) stored,
 primary key(controle,numero),
 constraint deserto_preco_sigiloso check (not sigiloso or valor_unitario is null)
);
create index if not exists oportunidades_desertos_busca on public.oportunidades_desertos using gin(busca);
alter table public.oportunidades_desertos enable row level security;
drop policy if exists oportunidades_desertos_ler on public.oportunidades_desertos;
create policy oportunidades_desertos_ler on public.oportunidades_desertos for select to authenticated using((select auth.uid()) is not null);
revoke all on public.oportunidades_desertos from public,anon,authenticated;
grant select on public.oportunidades_desertos to authenticated;

alter table licitaflow_coleta.jobs drop constraint if exists jobs_tipo_check;
alter table licitaflow_coleta.jobs add constraint jobs_tipo_check check (tipo in ('abertas','atualizacao','itens','desertos'));

-- Grava os itens desertos/fracassados de uma página de itens do PNCP (a página 1 substitui o que havia).
create or replace function licitaflow_coleta.registrar_desertos(p_controle text,p_itens jsonb,p_pagina integer) returns void
language plpgsql set search_path='' as $$
declare i jsonb;s smallint;sigilo boolean;
begin
 if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)>500 then raise exception 'Página de itens inválida';end if;
 if not exists(select 1 from public.oportunidades_indice where controle=p_controle) then return;end if;
 if p_pagina=1 then delete from public.oportunidades_desertos where controle=p_controle;end if;
 for i in select value from jsonb_array_elements(p_itens) loop
  if (i->>'numeroItem')::integer is null then raise exception 'Item sem identificação';end if;
  s:=licitaflow_coleta.codigo_item(i->>'situacaoCompraItem',i->>'situacaoCompraItemNome','situacao');
  continue when s is null or s not in (4,5);
  sigilo:=coalesce((i->>'orcamentoSigiloso')::boolean,false);
  insert into public.oportunidades_desertos(controle,numero,situacao,descricao,quantidade,unidade,valor_unitario,beneficio,sigiloso)
  values(p_controle,(i->>'numeroItem')::integer,s,left(coalesce(i->>'descricao',''),240),(i->>'quantidade')::numeric,left(i->>'unidadeMedida',20),
   case when sigilo then null else nullif((i->>'valorUnitarioEstimado')::numeric,0) end,(i->>'tipoBeneficio')::smallint,sigilo)
  on conflict (controle,numero) do update set situacao=excluded.situacao,descricao=excluded.descricao,quantidade=excluded.quantidade,unidade=excluded.unidade,
   valor_unitario=excluded.valor_unitario,beneficio=excluded.beneficio,sigiloso=excluded.sigiloso,verificado_em=now();
 end loop;
end;$$;

-- Põe na fila a próxima verificação dos editais cuja sessão já passou: 2, 7 e 20 dias depois.
-- Um edital que entra tarde (sessão há 10 dias, por exemplo) pula direto para a verificação daquela idade.
create or replace function licitaflow_coleta.agendar_desertos(p_limite integer default 200) returns integer
language plpgsql set search_path='' as $$
declare n integer;
begin
 with alvo as (
  select o.controle,greatest(o.verificacoes_deserto+1,case when o.encerramento<now()-interval '20 days' then 3 when o.encerramento<now()-interval '7 days' then 2 else 1 end) v
   from public.oportunidades_indice o
   where o.verificacoes_deserto<3 and o.modalidade in (2,4,5,6,7,8)
     and o.encerramento>=now()-interval '30 days' and o.encerramento<now()-interval '2 days'
     and o.encerramento<now()-case o.verificacoes_deserto when 0 then interval '2 days' when 1 then interval '7 days' else interval '20 days' end
     and coalesce(o.situacao,1) not in (2,3)
   order by o.encerramento desc limit p_limite
   for update of o skip locked
 ), marcados as (
  update public.oportunidades_indice o set verificacoes_deserto=alvo.v from alvo where o.controle=alvo.controle returning o.controle,alvo.v
 )
 insert into licitaflow_coleta.jobs(tipo,ciclo,controle) select 'desertos',controle||'/deserto-'||v,controle from marcados on conflict do nothing;
 get diagnostics n=row_count;
 return n;
end;$$;
revoke all on function licitaflow_coleta.registrar_desertos(text,jsonb,integer),licitaflow_coleta.agendar_desertos(integer) from public,anon,authenticated;

-- Coletor: igual ao da migration 18, com o tipo de pedido 'desertos' (menor prioridade, mesma URL dos itens)
-- e o agendamento das verificações na manutenção de 15 em 15 minutos.
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
   elsif j.tipo in ('itens','desertos') and r.status_code=404 then
    -- Edital retirado do PNCP: não adianta tentar de novo.
    update licitaflow_coleta.jobs set concluido=true,concluida_em=now(),request_id=null,erro='Contratação não encontrada na fonte' where id=j.id;
   elsif r.status_code in (200,204) and not coalesce(r.timed_out,false) and r.error_msg is null then
    d:=case when r.status_code=204 then case when j.tipo in ('itens','desertos') then '[]'::jsonb else '{"data":[],"totalPaginas":0}'::jsonb end else r.content::jsonb end;
    if j.tipo='desertos' then
     -- Verificação depois da sessão: guarda só os itens desertos e fracassados.
     n:=jsonb_array_length(d);
     if j.pagina>=20 and n=500 then raise exception 'Detalhamento excede limite de verificação';end if;
     perform licitaflow_coleta.registrar_desertos(j.controle,d,j.pagina);
     if n=500 then insert into licitaflow_coleta.jobs(tipo,ciclo,controle,pagina) values('desertos',j.ciclo,j.controle,j.pagina+1) on conflict do nothing;end if;
    elsif j.tipo='itens' then
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
     concluido=(j.tipo in ('itens','desertos') and j.tentativas>=12),concluida_em=case when j.tipo in ('itens','desertos') and j.tentativas>=12 then now() end where id=j.id;
   end if;
  exception when others then
   update licitaflow_coleta.jobs set request_id=null,proxima_em=now()+interval '15 minutes',erro='Resposta incompatível ou incompleta da fonte',bloqueado=(j.tipo in ('itens','desertos') and j.pagina>=20),
    concluido=(j.tipo in ('itens','desertos') and j.tentativas>=12),concluida_em=case when j.tipo in ('itens','desertos') and j.tentativas>=12 then now() end where id=j.id;
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
 -- Contagens do painel de status custam uma leitura da tabela inteira: a cada rodada só durante a carga inicial; depois, no máximo a cada 2 minutos.
 if mudou and (select not carga_inicial_concluida or coalesce(paginas_coletadas,0)<coalesce(paginas_planejadas,0) or coalesce(ultima_coleta_em,'epoch'::timestamptz)<now()-interval '2 minutes' from public.oportunidades_catalogo_status where id) then
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
   order by case when tipo='abertas' and ciclo='base-inicial' then 0 when tipo='itens' and urgente then 1 when tipo='desertos' then 4
     when dados_enviados>=2 then case when tipo='itens' then 2 else 3 end
     else case when tipo<>'itens' then 2 else 3 end end,pagina,id limit 1 for update skip locked;
  if not found then exit;end if;
  if j.tipo in ('itens','desertos') then
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
  if j.tipo not in ('itens','desertos') then dados_enviados:=dados_enviados+1;end if;
 end loop;
 if coalesce(estado.ultima_manutencao_em,'epoch'::timestamptz)<now()-interval '15 minutes' then
  delete from licitaflow_coleta.solicitacoes where criado_em<now()-interval '1 day';
  delete from licitaflow_coleta.envios where agendada_em<now()-interval '1 day';
  delete from licitaflow_coleta.jobs where concluido and ciclo<>'base-inicial' and coalesce(concluida_em,criado_em)<now()-interval '7 days';
  delete from public.oportunidades_indice where controle in (select controle from public.oportunidades_indice where encerramento<now()-interval '30 days' and publicacao<now()-interval '30 days' limit 1000);
  update licitaflow_coleta.estado set ultima_manutencao_em=now() where id;
  perform licitaflow_coleta.agendar_desertos(200);
 end if;
 update public.oportunidades_catalogo_status set ultima_carga_completa_em=greatest(ultima_carga_completa_em,(select max(fim) from (select max(concluida_em) fim from licitaflow_coleta.jobs where tipo='abertas' group by ciclo having bool_and(concluido)) x)) where id and carga_inicial_concluida;
 update public.oportunidades_catalogo_status set pausado_ate=null where id and pausado_ate<=now();
 return jsonb_build_object('processados',processados,'enviados',enviados);
end;$$;
revoke all on function licitaflow_coleta.tick() from public,anon,authenticated;

-- Pesquisa das desertas e fracassadas, com as sessões dos últimos 1 a 30 dias.
-- Filtros: busca (termos separados por ";"), uf, dias, tipo ('' ambos, '4' desertos, '5' fracassados), modalidades, inverter.
create or replace function public.buscar_desertas(p_filtros jsonb default '{}',p_pagina integer default 1,p_tamanho integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare termo text:=trim(coalesce(p_filtros->>'busca',''));q tsquery;parte text;v_uf text:=coalesce(p_filtros->>'uf','');
 dias integer:=coalesce(nullif(p_filtros->>'dias','')::integer,30);v_tipo text:=coalesce(p_filtros->>'tipo','');
 inverter boolean:=coalesce((p_filtros->>'inverter')::boolean,false);mods integer[];res jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária';end if;
 if p_pagina is null or p_tamanho is null or p_pagina not between 1 and 100000 or p_tamanho not between 1 and 50 or length(termo)>300
  or dias not between 1 and 30 or v_tipo not in ('','4','5') or v_uf !~ '^([A-Z]{2})?$' then raise exception 'Filtros inválidos';end if;
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
