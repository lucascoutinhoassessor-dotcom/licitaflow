-- Avisos e notificações push agendados, para todos ou para vários clientes escolhidos.
-- publicar_em: o aviso só aparece para os clientes (e o push só sai) a partir deste momento.
-- org_ids:     lista de organizações destinatárias quando são duas ou mais (uma só continua em org_id;
--              as duas vazias = todos os clientes).
-- enviar_push: false publica só no painel, sem notificação.
-- Um job do pg_cron confere a cada minuto se há push vencido e chama /api/push {acao:'agendados'}.

alter table public.plataforma_avisos
  add column if not exists publicar_em timestamptz not null default now(),
  add column if not exists org_ids uuid[] check (org_ids is null or cardinality(org_ids) between 2 and 1000),
  add column if not exists enviar_push boolean not null default true;

-- Avisos antigos já foram publicados na data em que foram criados; os que nunca tiveram push
-- (anteriores ao recurso) não devem ser disparados agora pelo agendador.
update public.plataforma_avisos set publicar_em = created_at;
update public.plataforma_avisos set enviar_push = false where push_enviado_em is null;

create index if not exists avisos_push_pendente on public.plataforma_avisos(publicar_em)
  where enviar_push and push_enviado_em is null;

drop policy if exists avisos_select on public.plataforma_avisos;
create policy avisos_select on public.plataforma_avisos for select to authenticated using(
  public.is_platform_admin() or (ativo and publicar_em <= now() and (expira_em is null or expira_em > now()) and exists(
    select 1 from public.memberships m where m.user_id = auth.uid() and (
      (plataforma_avisos.org_id is null and plataforma_avisos.org_ids is null)
      or plataforma_avisos.org_id = m.org_id
      or m.org_id = any(plataforma_avisos.org_ids)
    )
  ))
);

drop function if exists public.admin_publicar_aviso(text,text,uuid,timestamptz);
create function public.admin_publicar_aviso(
  p_titulo text, p_texto text, p_org uuid default null, p_expira_em timestamptz default null,
  p_orgs uuid[] default null, p_publicar_em timestamptz default null, p_push boolean default true
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v uuid;
  v_orgs uuid[];
  v_quando timestamptz := coalesce(p_publicar_em, now());
begin
  perform public.exigir_admin();
  select array_agg(distinct x) into v_orgs
    from unnest(coalesce(p_orgs, '{}'::uuid[]) || case when p_org is null then '{}'::uuid[] else array[p_org] end) x
    where x is not null;
  if v_orgs is not null and exists(select 1 from unnest(v_orgs) x where not exists(select 1 from public.organizations o where o.id = x)) then
    raise exception 'Organização não encontrada';
  end if;
  if v_orgs is not null and cardinality(v_orgs) > 1000 then raise exception 'Selecione até 1000 clientes'; end if;
  -- Uma pequena folga para o relógio do navegador do master.
  if p_publicar_em is not null and p_publicar_em < now() - interval '5 minutes' then raise exception 'A data de envio deve ser futura'; end if;
  if v_quando > now() + interval '1 year' then raise exception 'Agende para no máximo um ano à frente'; end if;
  if p_expira_em is not null and p_expira_em <= greatest(v_quando, now()) then raise exception 'A expiração deve ser depois do envio'; end if;
  insert into public.plataforma_avisos(titulo, texto, org_id, org_ids, expira_em, publicar_em, enviar_push, criado_por)
  values(trim(p_titulo), trim(p_texto),
         case when cardinality(v_orgs) = 1 then v_orgs[1] end,
         case when cardinality(v_orgs) > 1 then v_orgs end,
         p_expira_em, greatest(v_quando, now()), coalesce(p_push, true), auth.uid())
  returning id into v;
  return v;
end; $$;
revoke execute on function public.admin_publicar_aviso(text,text,uuid,timestamptz,uuid[],timestamptz,boolean) from public, anon;
grant execute on function public.admin_publicar_aviso(text,text,uuid,timestamptz,uuid[],timestamptz,boolean) to authenticated;

-- Agendador: só faz a chamada HTTP quando há push vencido (avisos de mais de 1 dia atrás são ignorados).
do $$
begin
  if to_regclass('cron.job') is not null and to_regnamespace('net') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'licitaflow-push-agendado';
    perform cron.schedule('licitaflow-push-agendado', '* * * * *', $c$
      select net.http_post(
        url := 'https://licitaflow-prod.vercel.app/api/push',
        body := '{"acao":"agendados"}'::jsonb,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 30000)
      where exists(select 1 from public.plataforma_avisos
                   where enviar_push and ativo and push_enviado_em is null
                     and publicar_em <= now() and publicar_em > now() - interval '1 day')
    $c$);
  end if;
end; $$;
