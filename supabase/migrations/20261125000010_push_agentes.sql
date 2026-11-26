-- Resumo diário das atividades reais dos agentes, às 8h de Brasília.
-- Fila privada por aparelho: reserva concorrente, retentativas e deduplicação por organização/dia.
BEGIN;
create index if not exists processo_eventos_sentinela_org_data on public.processo_eventos(org_id, created_at) where tipo = 'sentinela';
create table public.push_agentes_preferencias (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  radar boolean not null default true,
  sentinela boolean not null default true,
  resumo_diario boolean not null default true
);
alter table public.push_agentes_preferencias enable row level security;
create policy push_agentes_ler on public.push_agentes_preferencias for select to authenticated using (user_id = (select auth.uid()));
create policy push_agentes_criar on public.push_agentes_preferencias for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_agentes_editar on public.push_agentes_preferencias for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.push_agentes_preferencias to authenticated;
grant select on public.push_agentes_preferencias to service_role;

create schema licitaflow_push_agentes;
revoke all on schema licitaflow_push_agentes from public, anon, authenticated;
create table licitaflow_push_agentes.config (
  id boolean primary key default true check (id),
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  url text not null default 'https://licitaforce-app.vercel.app/api/push',
  ativo boolean not null default true,
  preparado_em date
);
insert into licitaflow_push_agentes.config default values;
alter table licitaflow_push_agentes.config enable row level security;
create table licitaflow_push_agentes.fila (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  inscricao_id uuid not null references public.push_inscricoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  payload jsonb not null,
  tentativas integer not null default 0,
  proxima_em timestamptz not null default now(),
  reserva uuid,
  enviado_em timestamptz,
  unique (org_id, inscricao_id, dia)
);
create index push_agentes_pendentes on licitaflow_push_agentes.fila(proxima_em) where enviado_em is null;
create index push_agentes_inscricao on licitaflow_push_agentes.fila(inscricao_id);
create index push_agentes_usuario on licitaflow_push_agentes.fila(user_id);
alter table licitaflow_push_agentes.fila enable row level security;

create function public.push_agentes_autorizar(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or not exists (select 1 from licitaflow_push_agentes.config where id and ativo and token = p_token)
    then raise exception 'Token inválido' using errcode = '28000'; end if;
end $$;

create function licitaflow_push_agentes.preparar(p_agora timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
declare d date := (p_agora at time zone 'America/Sao_Paulo')::date;
  fim timestamptz; inicio timestamptz; o record; texto text; n bigint; verificadas bigint;
begin
  -- Janela fixa: de ontem às 8h até hoje às 8h, sem sobreposição entre resumos.
  fim := (d + time '08:00') at time zone 'America/Sao_Paulo';
  if p_agora < fim then return; end if;
  -- Uma preparação por dia, mesmo com várias chamadas simultâneas do cron.
  perform 1 from licitaflow_push_agentes.config where id and ativo and preparado_em is distinct from d for update;
  if not found then return; end if;
  inicio := fim - interval '24 hours';
  for o in select distinct org.id, org.nome from public.organizations org
    join public.memberships m on m.org_id = org.id
    join public.push_inscricoes s on s.user_id = m.user_id
    where not org.suspensa and licitaflow_sentinela.agentes_liberados(org.id) loop
    texto := '';
    select count(*) into n from public.radar_sugestoes where org_id = o.id and created_at >= inicio and created_at < fim;
    if n > 0 then texto := 'Radar: ' || n || ' oportunidades encontradas. '; end if;
    select count(distinct w.processo_id) into verificadas from licitaflow_sentinela.vigiados(o.id) w
      join licitaflow_sentinela.editais e on e.controle = w.controle
      where e.verificado_em >= inicio and e.falhas = 0;
    select count(*) into n from public.processo_eventos where org_id = o.id and tipo = 'sentinela' and created_at >= inicio and created_at < fim;
    if verificadas > 0 or n > 0 then texto := texto || 'Sentinela: ' || verificadas || ' processos acompanhados, ' || n || ' mudanças. '; end if;
    select count(*) into n from public.ia_uso where org_id = o.id and agente = 'leitor-editais' and created_at >= inicio and created_at < fim;
    if n > 0 then texto := texto || 'Leitor: ' || n || ' leituras. '; end if;
    select count(*) into n from public.ia_uso where org_id = o.id and agente = 'cotador' and created_at >= inicio and created_at < fim;
    if n > 0 then texto := texto || 'Cotador: ' || n || ' cotações. '; end if;
    if texto = '' then continue; end if;
    insert into licitaflow_push_agentes.fila(org_id, inscricao_id, user_id, dia, payload)
      select o.id, s.id, s.user_id, d, jsonb_build_object('titulo', 'Suas IAs · ' || left(o.nome, 50),
        'texto', trim(texto), 'url', '/app/agentes', 'tag', 'agentes-' || o.id || '-' || d)
      from public.memberships m join public.push_inscricoes s on s.user_id = m.user_id
      left join public.push_agentes_preferencias p on p.user_id = m.user_id
      where m.org_id = o.id and m.created_at < inicio and coalesce(p.resumo_diario, true)
      on conflict (org_id, inscricao_id, dia) do nothing;
  end loop;
  update licitaflow_push_agentes.config set preparado_em = d where id;
end $$;

create function public.push_agentes_lote(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare resultado jsonb;
begin
  perform public.push_agentes_autorizar(p_token);
  with candidatos as (
    select f.id from licitaflow_push_agentes.fila f
    join public.push_inscricoes s on s.id = f.inscricao_id and s.user_id = f.user_id
    join public.memberships m on m.org_id = f.org_id and m.user_id = f.user_id
    join public.organizations o on o.id = f.org_id and not o.suspensa
    left join public.push_agentes_preferencias p on p.user_id = f.user_id
    where f.enviado_em is null and f.proxima_em <= now() and f.tentativas < 5
      and f.dia = (now() at time zone 'America/Sao_Paulo')::date
      and coalesce(p.resumo_diario, true) and licitaflow_sentinela.agentes_liberados(f.org_id)
    order by f.proxima_em, f.id limit 50 for update of f skip locked
  ), reservados as (
    update licitaflow_push_agentes.fila f set reserva = gen_random_uuid(), proxima_em = now() + interval '10 minutes', tentativas = tentativas + 1
    from candidatos c where f.id = c.id returning f.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reserva', r.reserva, 'payload', r.payload,
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    into resultado from reservados r join public.push_inscricoes s on s.id = r.inscricao_id;
  return resultado;
end $$;

create function public.push_agentes_concluir(p_token text, p_id uuid, p_reserva uuid, p_status integer) returns void
language plpgsql security definer set search_path = '' as $$
declare f licitaflow_push_agentes.fila;
begin
  perform public.push_agentes_autorizar(p_token);
  select * into f from licitaflow_push_agentes.fila where id = p_id and reserva = p_reserva and enviado_em is null for update;
  if not found then return; end if;
  if p_status in (404, 410) then
    delete from public.push_inscricoes where id = f.inscricao_id and user_id = f.user_id;
  else
    update licitaflow_push_agentes.fila set reserva = null,
      enviado_em = case when p_status between 200 and 299 then now() else null end,
      proxima_em = now() + interval '5 minutes' * power(2, tentativas - 1)
      where id = p_id;
  end if;
end $$;

revoke execute on function public.push_agentes_autorizar(text), public.push_agentes_lote(text), public.push_agentes_concluir(text, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.push_agentes_autorizar(text), public.push_agentes_lote(text), public.push_agentes_concluir(text, uuid, uuid, integer) to service_role;
revoke execute on function licitaflow_push_agentes.preparar(timestamptz) from public, anon, authenticated;

create function licitaflow_push_agentes.disparar() returns void
language plpgsql security definer set search_path = '' as $$
declare c licitaflow_push_agentes.config;
begin
  select * into c from licitaflow_push_agentes.config where id;
  if not c.ativo then return; end if;
  -- Dados e preferências ficam no banco; a Vercel apenas entrega as mensagens reservadas.
  perform licitaflow_push_agentes.preparar();
  delete from licitaflow_push_agentes.fila where dia < (now() at time zone 'America/Sao_Paulo')::date - 7;
  if to_regnamespace('net') is not null and exists (select 1 from licitaflow_push_agentes.fila
      where enviado_em is null and proxima_em <= now() and tentativas < 5 and dia = (now() at time zone 'America/Sao_Paulo')::date) then
    perform net.http_post(url := c.url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-coleta', c.token),
      body := '{"acao":"resumo-agentes"}'::jsonb, timeout_milliseconds := 60000);
  end if;
end $$;
revoke execute on function licitaflow_push_agentes.disparar() from public, anon, authenticated;
do $$ begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule('licitaflow-push-agentes', '*/5 * * * *', 'select licitaflow_push_agentes.disparar()');
  end if;
end $$;
COMMIT;
