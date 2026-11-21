-- LicitaFlow · Liberação de funcionalidades pelo master.
-- Cada módulo do app do cliente tem um estado: liberado (todos), teste (só organizações escolhidas),
-- em_breve (aparece no menu com aviso, sem abrir) ou oculto (não aparece). Módulo sem linha (novo) = oculto no app.
-- A lista de organizações de teste nunca chega ao cliente: ele recebe só o estado efetivo para a própria org.
BEGIN;

create table public.plataforma_modulos (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  estado text not null default 'liberado' check (estado in ('liberado','teste','em_breve','oculto')),
  orgs_teste uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.plataforma_modulos enable row level security;
-- Sem políticas: leitura só pelas funções abaixo.
create trigger modulos_audit after insert or update on public.plataforma_modulos
  for each row execute function public.auditar_administracao();

-- Estado atual mantido: tudo liberado, exceto os agentes de IA, que já apareciam como "em breve".
insert into public.plataforma_modulos(id, estado) values
  ('oportunidades','liberado'), ('processos','liberado'), ('prazos','liberado'), ('contratos','liberado'),
  ('financeiro','liberado'), ('analise-empresas','liberado'), ('historico-precos','liberado'),
  ('relatorios','liberado'), ('documentos','liberado'), ('agentes','em_breve');

-- Estado efetivo de cada módulo para a organização do usuário (membro, mesmo suspensa).
create function public.modulos_da_org(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is not null and not public.is_platform_admin()
     and not exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid()) then
    raise exception 'Acesso negado';
  end if;
  return coalesce((select jsonb_object_agg(m.id,
      case when m.estado = 'teste' then case when p_org = any(m.orgs_teste) then 'liberado' else 'oculto' end else m.estado end)
    from public.plataforma_modulos m), '{}'::jsonb);
end; $$;

create function public.admin_modulos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return coalesce((select jsonb_object_agg(m.id, jsonb_build_object('estado', m.estado, 'orgs_teste', m.orgs_teste, 'updated_at', m.updated_at))
    from public.plataforma_modulos m), '{}'::jsonb);
end; $$;

create function public.admin_salvar_modulo(p_id text, p_estado text, p_orgs uuid[] default '{}') returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  if p_estado not in ('liberado','teste','em_breve','oculto') then raise exception 'Estado inválido'; end if;
  insert into public.plataforma_modulos(id, estado, orgs_teste, updated_at)
    values (p_id, p_estado, coalesce(p_orgs, '{}'), now())
  on conflict (id) do update set estado = excluded.estado, orgs_teste = excluded.orgs_teste, updated_at = now();
end; $$;

revoke execute on function public.modulos_da_org(uuid) from public, anon;
revoke execute on function public.admin_modulos() from public, anon;
revoke execute on function public.admin_salvar_modulo(text, text, uuid[]) from public, anon;
grant execute on function public.modulos_da_org(uuid), public.admin_modulos(), public.admin_salvar_modulo(text, text, uuid[]) to authenticated;

COMMIT;
