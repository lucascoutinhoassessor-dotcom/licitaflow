-- Resumo do Radar por empresa e membro, independente das notificações push.
BEGIN;

-- O domínio antigo da Vercel foi desativado; os avisos seguem para a produção atual.
update licitaflow_radar.config set url = 'https://licitaflow.com.br/api/agentes?agente=radar&acao=avisar'
where url = 'https://licitaforce-app.vercel.app/api/agentes?agente=radar&acao=avisar';

alter table public.radar_sugestoes add column email_enfileirado_em timestamptz;
create index radar_sugestoes_email on public.radar_sugestoes(created_at) where email_enfileirado_em is null;

create table licitaflow_radar.emails (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sugestoes bigint[] not null,
  reserva uuid,
  reservado_ate timestamptz,
  enviado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index radar_emails_pendentes on licitaflow_radar.emails(criado_em) where enviado_em is null;
create index radar_emails_org on licitaflow_radar.emails(org_id);
create index radar_emails_empresa on licitaflow_radar.emails(empresa_id);
create index radar_emails_usuario on licitaflow_radar.emails(user_id);
alter table licitaflow_radar.emails enable row level security;
revoke all on licitaflow_radar.emails from public, anon, authenticated;

create function public.radar_emails_reservar(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if p_token is null or p_token <> (select token from licitaflow_radar.config where id) then raise exception 'Token inválido'; end if;
  -- Serializa a montagem dos lotes: duas chamadas não enfileiram a mesma sugestão.
  perform pg_advisory_xact_lock(hashtext('licitaflow_radar.emails'));
  with novas as (
    update public.radar_sugestoes s set email_enfileirado_em = now()
    where s.email_enfileirado_em is null and s.status = 'nova'
      and s.created_at > now() - interval '2 days'
      and (s.encerramento is null or s.encerramento > now())
      and exists (select 1 from licitaflow_radar.monitoradas() m where m.empresa_id = s.empresa_id)
      and exists (select 1 from public.memberships m join auth.users u on u.id = m.user_id
        where m.org_id = s.org_id and nullif(trim(u.email), '') is not null)
    returning s.id, s.org_id, s.empresa_id
  )
  insert into licitaflow_radar.emails(org_id, empresa_id, user_id, sugestoes)
  select n.org_id, n.empresa_id, m.user_id, array_agg(n.id order by n.id)
  from novas n join public.memberships m on m.org_id = n.org_id
  join auth.users u on u.id = m.user_id
  where nullif(trim(u.email), '') is not null
  group by n.org_id, n.empresa_id, m.user_id;

  -- Antes de cada tentativa, confere vínculo, acesso e prazo; reservas expiram em 10 min.
  with candidatas as (
    select q.id from licitaflow_radar.emails q
    join auth.users u on u.id = q.user_id
    where q.enviado_em is null and (q.reservado_ate is null or q.reservado_ate < now())
      and nullif(trim(u.email), '') is not null
      and exists (select 1 from public.memberships m where m.org_id = q.org_id and m.user_id = q.user_id)
      and exists (select 1 from licitaflow_radar.monitoradas() m where m.empresa_id = q.empresa_id)
      and exists (select 1 from public.radar_sugestoes s where s.id = any(q.sugestoes)
        and s.status = 'nova' and (s.encerramento is null or s.encerramento > now()))
    order by q.criado_em, q.id limit 50 for update of q skip locked
  ), reservadas as (
    update licitaflow_radar.emails q set reserva = gen_random_uuid(), reservado_ate = now() + interval '10 minutes'
    from candidatas c where q.id = c.id returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'reserva', q.reserva, 'org_id', q.org_id, 'empresa_id', q.empresa_id,
    'empresa', coalesce(e.nome_fantasia, e.razao_social), 'email', u.email,
    'nome', u.raw_user_meta_data->>'nome', 'oportunidades', (
      select jsonb_agg(jsonb_build_object('id', s.id, 'objeto', s.objeto, 'orgao', s.orgao, 'uf', s.uf,
        'valor', s.valor, 'encerramento', s.encerramento, 'motivos', s.motivos) order by s.pontuacao desc, s.id)
      from public.radar_sugestoes s where s.id = any(q.sugestoes) and s.status = 'nova'
        and (s.encerramento is null or s.encerramento > now())
    ))), '[]'::jsonb) into v
  from reservadas q join auth.users u on u.id = q.user_id join public.empresas e on e.id = q.empresa_id;
  return v;
end $$;

create function public.radar_email_concluir(p_token text, p_id uuid, p_reserva uuid, p_sucesso boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token <> (select token from licitaflow_radar.config where id) then raise exception 'Token inválido'; end if;
  update licitaflow_radar.emails set enviado_em = case when p_sucesso then now() else null end,
    reservado_ate = null, reserva = null
  where id = p_id and reserva = p_reserva and enviado_em is null;
end $$;

revoke execute on function public.radar_emails_reservar(text), public.radar_email_concluir(text, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.radar_emails_reservar(text), public.radar_email_concluir(text, uuid, uuid, boolean) to service_role;

-- Chama os avisos mesmo sem novas sugestões para retentar e-mails que falharam.
create or replace function licitaflow_radar.rodada() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c licitaflow_radar.config; m record; total integer := 0; empresas integer := 0;
begin
  select * into c from licitaflow_radar.config where id;
  if not c.ativo then return jsonb_build_object('ativo', false); end if;
  for m in select * from licitaflow_radar.monitoradas() loop
    begin
      total := total + licitaflow_radar.buscar(m.empresa_id);
      empresas := empresas + 1;
    exception when others then
      raise warning 'Radar: falha na empresa %: %', m.empresa_id, sqlerrm;
    end;
  end loop;
  if to_regnamespace('net') is not null then
    perform net.http_get(url := c.url, headers := jsonb_build_object('x-coleta', c.token), timeout_milliseconds := 60000);
  end if;
  return jsonb_build_object('empresas', empresas, 'novas', total);
end $$;

-- A busca manual também manda o resumo por e-mail; o push continua dispensado.
create or replace function public.radar_buscar_agora(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_ult timestamptz; n integer; c licitaflow_radar.config;
begin
  select org_id into v_org from public.empresas where id = p_empresa;
  if v_org is null or not public.can_write(v_org) then raise exception 'Acesso negado'; end if;
  if not exists (select 1 from licitaflow_radar.monitoradas(v_org) m where m.empresa_id = p_empresa) then
    raise exception 'Esta empresa não está monitorada pelo Radar (sem palavras-chave, Radar desligado ou fora do limite do plano).';
  end if;
  select executado_em into v_ult from licitaflow_radar.execucoes where empresa_id = p_empresa;
  if v_ult > now() - interval '10 minutes' then
    raise exception 'O Radar acabou de procurar para esta empresa. Tente de novo em alguns minutos.';
  end if;
  n := licitaflow_radar.buscar(p_empresa);
  update public.radar_sugestoes set notificado_em = now() where empresa_id = p_empresa and notificado_em is null;
  select * into c from licitaflow_radar.config where id;
  if c.ativo and n > 0 and to_regnamespace('net') is not null then
    perform net.http_get(url := c.url, headers := jsonb_build_object('x-coleta', c.token), timeout_milliseconds := 60000);
  end if;
  return jsonb_build_object('novas', n);
end $$;

COMMIT;
