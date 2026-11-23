-- Som de cada aviso: o que toca quando o push chega com o app aberto na tela.
--   principal   = o "Som do aviso" do console master (áudio enviado pelo master ou, sem ele, "licitaforce!")
--   licitaforce = sempre a vinheta + voz padrão do app
--   ping        = duas notas curtas
--   silencio    = sem som (a notificação aparece igual)
-- Com o app fechado, quem decide o som é o aparelho (a Web Push não deixa escolher).
alter table public.plataforma_avisos
  add column if not exists som text not null default 'principal'
  constraint plataforma_avisos_som_check check (som in ('principal','licitaforce','ping','silencio'));

drop function if exists public.admin_publicar_aviso(text,text,uuid,timestamptz,uuid[],timestamptz,boolean);
create function public.admin_publicar_aviso(
  p_titulo text, p_texto text, p_org uuid default null, p_expira_em timestamptz default null,
  p_orgs uuid[] default null, p_publicar_em timestamptz default null, p_push boolean default true,
  p_som text default 'principal'
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v uuid;
  v_orgs uuid[];
  v_quando timestamptz := coalesce(p_publicar_em, now());
begin
  perform public.exigir_admin();
  if coalesce(p_som, 'principal') not in ('principal','licitaforce','ping','silencio') then raise exception 'Som inválido'; end if;
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
  insert into public.plataforma_avisos(titulo, texto, org_id, org_ids, expira_em, publicar_em, enviar_push, criado_por, som)
  values(trim(p_titulo), trim(p_texto),
         case when cardinality(v_orgs) = 1 then v_orgs[1] end,
         case when cardinality(v_orgs) > 1 then v_orgs end,
         p_expira_em, greatest(v_quando, now()), coalesce(p_push, true), auth.uid(), coalesce(p_som, 'principal'))
  returning id into v;
  return v;
end; $$;
revoke execute on function public.admin_publicar_aviso(text,text,uuid,timestamptz,uuid[],timestamptz,boolean,text) from public, anon;
grant execute on function public.admin_publicar_aviso(text,text,uuid,timestamptz,uuid[],timestamptz,boolean,text) to authenticated;
