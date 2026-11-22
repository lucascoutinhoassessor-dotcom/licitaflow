-- LicitaFlow · Agente Sentinela: vigia no PNCP os editais dos processos dos clientes e avisa quando algo muda
-- (situação da compra, datas, documentos novos ou retirados, resultado publicado, edital retirado).
--
-- Como funciona:
-- - Cada edital (número de controle PNCP) é vigiado uma vez só, mesmo que vários clientes o acompanhem.
--   A foto mais recente fica em licitaflow_sentinela.editais; o servidor compara com a nova e grava os eventos.
-- - Um processo é vigiado quando tem número de controle PNCP, não está homologado, perdido ou em desistência,
--   e a organização tem o módulo "agentes" liberado. O limite do plano (chave "sentinela" em limites_ia) é o
--   número de processos vigiados ao mesmo tempo, não um limite mensal: os mais recentes têm preferência.
-- - O pg_cron chama a Vercel a cada 10 min, só quando há edital com verificação vencida. A Sentinela não usa IA:
--   não gera custo de IA nem registro em ia_uso.
BEGIN;

create schema if not exists licitaflow_sentinela;
revoke all on schema licitaflow_sentinela from public, anon, authenticated;

create table licitaflow_sentinela.config (
  id boolean primary key default true check (id),
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  url text not null default 'https://licitaflow-prod.vercel.app/api/agentes?agente=sentinela&acao=verificar',
  ativo boolean not null default true
);
insert into licitaflow_sentinela.config default values;

create table licitaflow_sentinela.editais (
  controle      text primary key check (controle ~ '^\d{14}-1-\d{1,9}/\d{4}$'),
  estado        jsonb,               -- última foto lida do PNCP (null = ainda não lido)
  verificado_em timestamptz,
  proxima_em    timestamptz not null default now(),
  tentado_em    timestamptz,
  falhas        integer not null default 0,
  alterado_em   timestamptz
);
create index sentinela_editais_proxima on licitaflow_sentinela.editais (proxima_em);

create table public.sentinela_eventos (
  id          bigint generated always as identity primary key,
  controle    text not null,
  tipo        text not null check (tipo in ('situacao','encerramento','abertura','documento_novo','documento_retirado','resultado','valor','retirado')),
  nivel       text not null default 'medio' check (nivel in ('alto','medio','baixo')),
  titulo      text not null check (length(titulo) between 3 and 300),
  detalhe     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index sentinela_eventos_controle on public.sentinela_eventos (controle, created_at desc);
alter table public.sentinela_eventos enable row level security;
-- O cliente vê os eventos dos editais que algum processo da organização dele acompanha.
create policy sentinela_eventos_ler on public.sentinela_eventos for select to authenticated using (
  public.is_platform_admin() or exists (
    select 1 from public.processos p where p.pncp_controle = sentinela_eventos.controle and public.is_member(p.org_id)));
grant select on public.sentinela_eventos to authenticated;

-- O agente aparece explicitamente em todos os planos (nunca em aberto).
update public.plataforma_planos set limites_ia = limites_ia || jsonb_build_object('sentinela',
  case id when 'trial' then to_jsonb(5) when 'essencial' then to_jsonb(20) when 'profissional' then to_jsonb(100)
          when 'assessoria' then 'null'::jsonb else to_jsonb(0) end);

-- Agentes liberados para a organização (mesma regra de modulos_da_org).
create function licitaflow_sentinela.agentes_liberados(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plataforma_modulos m where m.id = 'agentes'
                 and (m.estado = 'liberado' or (m.estado = 'teste' and p_org = any(m.orgs_teste))))
$$;

-- Processos vigiados de cada organização, respeitando o limite do plano (os mais recentes primeiro).
create function licitaflow_sentinela.vigiados(p_org uuid default null)
returns table (org_id uuid, processo_id uuid, controle text)
language sql stable security definer set search_path = '' as $$
  with candidatos as (
    select p.org_id, p.id processo_id, p.pncp_controle controle,
           row_number() over (partition by p.org_id order by coalesce(p.data_abertura, p.created_at) desc, p.id) n
    from public.processos p
    where p.pncp_controle ~ '^\d{14}-1-\d{1,9}/\d{4}$'
      and p.etapa not in ('homologado', 'perdido', 'desistencia')
      and (p_org is null or p.org_id = p_org)
      and licitaflow_sentinela.agentes_liberados(p.org_id)
  )
  select c.org_id, c.processo_id, c.controle from candidatos c
  where coalesce((public.ia_limite_efetivo(c.org_id, 'sentinela')->>'limite')::int, 2147483647) >= c.n
$$;

-- Garante a linha de cada edital vigiado e devolve se há verificação vencida.
create function licitaflow_sentinela.ha_trabalho() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into licitaflow_sentinela.editais (controle) select distinct v.controle from licitaflow_sentinela.vigiados() v
  on conflict do nothing;
  return exists (select 1 from licitaflow_sentinela.editais e
                 where e.proxima_em <= now() and (e.tentado_em is null or e.tentado_em < now() - interval '10 minutes')
                   and exists (select 1 from licitaflow_sentinela.vigiados() v where v.controle = e.controle));
end $$;

create function licitaflow_sentinela.disparar() returns boolean
language plpgsql security definer set search_path = '' as $$
declare c licitaflow_sentinela.config;
begin
  select * into c from licitaflow_sentinela.config where id;
  if not c.ativo or to_regnamespace('net') is null or not licitaflow_sentinela.ha_trabalho() then return false; end if;
  perform net.http_get(url := c.url, headers := jsonb_build_object('x-coleta', c.token), timeout_milliseconds := 120000);
  return true;
end $$;

-- Para o servidor: próximo lote de editais com verificação vencida (e a foto anterior de cada um).
create function public.sentinela_lote(p_token text, p_limite integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if p_token is null or p_token <> (select token from licitaflow_sentinela.config where id) then raise exception 'Token inválido'; end if;
  perform licitaflow_sentinela.ha_trabalho();
  with lote as (
    select e.controle from licitaflow_sentinela.editais e
    where e.proxima_em <= now() and (e.tentado_em is null or e.tentado_em < now() - interval '10 minutes')
      and exists (select 1 from licitaflow_sentinela.vigiados() w where w.controle = e.controle)
    order by e.proxima_em limit least(greatest(coalesce(p_limite, 30), 1), 60)
    for update skip locked
  ), marcados as (
    update licitaflow_sentinela.editais e set tentado_em = now() from lote where e.controle = lote.controle
    returning e.controle, e.estado
  )
  select coalesce(jsonb_agg(jsonb_build_object('controle', controle, 'estado', estado)), '[]'::jsonb) into v from marcados;
  return v;
end $$;

-- Para o servidor: grava o resultado de cada edital.
-- p_itens: [{controle, estado?, erro?, proxima_em, eventos: [{tipo, nivel, titulo, detalhe}]}]
-- Devolve os avisos a mandar por push: [{titulo, texto, nivel, org_id, processo_id}].
create function public.sentinela_gravar(p_token text, p_itens jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it jsonb; ev jsonb; avisos jsonb := '[]'::jsonb; v record; n integer;
begin
  if p_token is null or p_token <> (select token from licitaflow_sentinela.config where id) then raise exception 'Token inválido'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    if it ? 'erro' then
      update licitaflow_sentinela.editais set falhas = falhas + 1, proxima_em = (it->>'proxima_em')::timestamptz, tentado_em = null
      where controle = it->>'controle';
      continue;
    end if;
    n := jsonb_array_length(coalesce(it->'eventos', '[]'::jsonb));
    update licitaflow_sentinela.editais set estado = it->'estado', verificado_em = now(), falhas = 0, tentado_em = null,
      proxima_em = (it->>'proxima_em')::timestamptz, alterado_em = case when n > 0 then now() else alterado_em end
    where controle = it->>'controle';
    for ev in select * from jsonb_array_elements(coalesce(it->'eventos', '[]'::jsonb)) loop
      insert into public.sentinela_eventos (controle, tipo, nivel, titulo, detalhe)
      values (it->>'controle', ev->>'tipo', coalesce(ev->>'nivel', 'medio'), left(ev->>'titulo', 300), coalesce(ev->'detalhe', '{}'::jsonb));
      -- Linha do tempo de cada processo vigiado que acompanha este edital.
      for v in select * from licitaflow_sentinela.vigiados() w where w.controle = it->>'controle' loop
        insert into public.processo_eventos (org_id, processo_id, tipo, titulo, dados, origem)
        values (v.org_id, v.processo_id, 'sentinela', left('Sentinela: ' || (ev->>'titulo'), 300),
                jsonb_build_object('nivel', ev->>'nivel', 'tipo', ev->>'tipo') || coalesce(ev->'detalhe', '{}'::jsonb), 'agente');
        avisos := avisos || jsonb_build_object('titulo', ev->>'titulo', 'nivel', ev->>'nivel', 'org_id', v.org_id, 'processo_id', v.processo_id);
      end loop;
    end loop;
  end loop;
  return avisos;
end $$;

-- Para o cliente: limite, processos vigiados e os que ficaram de fora pelo limite do plano.
create function public.sentinela_resumo(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'Acesso negado'; end if;
  return jsonb_build_object(
    'liberado', licitaflow_sentinela.agentes_liberados(p_org),
    'limite', public.ia_limite_efetivo(p_org, 'sentinela'),
    'vigiados', coalesce((select jsonb_agg(jsonb_build_object('processo_id', p.id, 'objeto', p.objeto, 'numero', p.numero, 'controle', p.pncp_controle,
        'verificado_em', e.verificado_em, 'situacao', e.estado->>'situacao', 'encerramento', e.estado->>'encerramento', 'alterado_em', e.alterado_em)
        order by coalesce(p.data_abertura, p.created_at) desc)
      from licitaflow_sentinela.vigiados(p_org) w join public.processos p on p.id = w.processo_id
      left join licitaflow_sentinela.editais e on e.controle = w.controle), '[]'::jsonb),
    'fora_do_limite', (select count(*) from public.processos p
      where p.org_id = p_org and p.pncp_controle ~ '^\d{14}-1-\d{1,9}/\d{4}$' and p.etapa not in ('homologado', 'perdido', 'desistencia')
        and not exists (select 1 from licitaflow_sentinela.vigiados(p_org) w where w.processo_id = p.id)),
    'sem_controle', (select count(*) from public.processos p
      where p.org_id = p_org and p.pncp_controle is null and p.etapa not in ('homologado', 'perdido', 'desistencia')));
end $$;

-- Uso do mês por agente: para a Sentinela, conta os processos vigiados agora (limite simultâneo).
create or replace function public.ia_uso_resumo(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'Acesso negado'; end if;
  return coalesce((
    select jsonb_object_agg(a.agente, public.ia_limite_efetivo(p_org, a.agente) || jsonb_build_object('usadas',
      case when a.agente = 'sentinela' then (select count(*)::int from licitaflow_sentinela.vigiados(p_org))
           else public.ia_usos_mes(p_org, a.agente) end))
    from (
      select jsonb_object_keys(p.limites_ia) agente from public.organizations o join public.plataforma_planos p on p.id = o.plano where o.id = p_org
      union select l.agente from public.ia_limites_org l where l.org_id = p_org
      union select u.agente from public.ia_uso u where u.org_id = p_org and u.created_at >= public.ia_inicio_mes()
    ) a), '{}'::jsonb);
end; $$;

-- Ficha de IA do cliente no master: acrescenta os processos vigiados pela Sentinela.
create or replace function public.admin_ia_cliente(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'plano', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'limites_ia', p.limites_ia) from public.organizations o join public.plataforma_planos p on p.id = o.plano where o.id = p_org),
    'excecoes', coalesce((select jsonb_object_agg(agente, limite) from public.ia_limites_org where org_id = p_org), '{}'::jsonb),
    'uso', coalesce((select jsonb_object_agg(agente, jsonb_build_object('novas', novas, 'reaproveitadas', reaproveitadas, 'custo_usd', custo))
      from (select agente, count(*) filter (where nova)::int novas, count(*) filter (where not nova)::int reaproveitadas, sum(custo_usd) custo
            from public.ia_uso where org_id = p_org and created_at >= public.ia_inicio_mes() group by agente) x), '{}'::jsonb)
      || jsonb_build_object('sentinela', jsonb_build_object('novas', (select count(*)::int from licitaflow_sentinela.vigiados(p_org)), 'reaproveitadas', 0, 'custo_usd', 0)));
end; $$;

revoke execute on function public.sentinela_lote(text, integer), public.sentinela_gravar(text, jsonb) from public, anon, authenticated;
grant execute on function public.sentinela_lote(text, integer), public.sentinela_gravar(text, jsonb) to service_role;
revoke execute on function public.sentinela_resumo(uuid) from public, anon;
grant execute on function public.sentinela_resumo(uuid) to authenticated;
revoke execute on all functions in schema licitaflow_sentinela from public, anon, authenticated;

-- Agenda: a cada 10 min, e só chama a Vercel se houver edital com verificação vencida.
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'licitaflow-sentinela';
    perform cron.schedule('licitaflow-sentinela', '*/10 * * * *', 'select licitaflow_sentinela.disparar()');
  end if;
end $$;

COMMIT;
