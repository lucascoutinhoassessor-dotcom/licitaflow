-- LicitaFlow · 0003 · Painel master (administração da plataforma)
-- Administradores da plataforma enxergam e gerenciam todas as organizações via RPCs
-- security definer que checam is_platform_admin(). Nenhuma política RLS é afrouxada.

create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- sem políticas: ninguém lê/escreve pela API; só via funções abaixo e pelo SQL Editor.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
grant execute on function public.is_platform_admin() to authenticated;

-- Suspensão de organização (bloqueia o acesso aos dados, preserva tudo)
alter table public.organizations
  add column suspensa        boolean not null default false,
  add column motivo_suspensao text,
  add column notas_admin     text;

-- is_member passa a negar acesso a organizações suspensas
create or replace function public.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    join public.organizations o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid() and not o.suspensa
  );
$$;

create or replace function public.has_role(p_org uuid, p_papeis text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    join public.organizations o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid() and m.papel = any (p_papeis) and not o.suspensa
  );
$$;

-- O usuário continua vendo a própria organização (para exibir o aviso de suspensão)
drop policy org_select on public.organizations;
create policy org_select on public.organizations for select to authenticated
  using (exists (select 1 from public.memberships m where m.org_id = organizations.id and m.user_id = auth.uid()));

drop policy mem_select on public.memberships;
create policy mem_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_member(org_id));

-- Impede que o próprio cliente altere campos administrativos
create or replace function public.proteger_campos_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- só restringe chamadas de usuários logados (SQL Editor e service role não têm auth.uid())
  if auth.uid() is not null and not public.is_platform_admin() then
    new.plano := old.plano;
    new.trial_ate := old.trial_ate;
    new.suspensa := old.suspensa;
    new.motivo_suspensao := old.motivo_suspensao;
    new.notas_admin := old.notas_admin;
  end if;
  return new;
end;
$$;
create trigger organizations_proteger_admin before update on public.organizations
  for each row execute function public.proteger_campos_admin();

-- =========================================================
-- RPCs do painel master
-- =========================================================
create or replace function public.exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'acesso restrito ao administrador da plataforma';
  end if;
end;
$$;

create or replace function public.admin_resumo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'organizacoes', (select count(*) from public.organizations),
    'usuarios', (select count(*) from auth.users),
    'usuarios_confirmados', (select count(*) from auth.users where email_confirmed_at is not null),
    'empresas', (select count(*) from public.empresas),
    'processos', (select count(*) from public.processos),
    'documentos', (select count(*) from public.documentos),
    'contratos', (select count(*) from public.contratos),
    'suspensas', (select count(*) from public.organizations where suspensa),
    'trials_ativos', (select count(*) from public.organizations where plano = 'trial' and trial_ate >= current_date and not suspensa),
    'trials_vencendo', (select count(*) from public.organizations where plano = 'trial' and trial_ate between current_date and current_date + 3),
    'trials_vencidos', (select count(*) from public.organizations where plano = 'trial' and trial_ate < current_date),
    'pagantes', (select count(*) from public.organizations where plano in ('essencial', 'profissional', 'assessoria') and not suspensa),
    'ativos_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'por_plano', (select coalesce(jsonb_object_agg(plano, n), '{}'::jsonb) from (select plano, count(*) n from public.organizations group by plano) x),
    'cadastros_30d', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'n', coalesce(c.n, 0)) order by d), '[]'::jsonb)
      from generate_series(current_date - 29, current_date, interval '1 day') d
      left join (select created_at::date dia, count(*) n from auth.users group by 1) c on c.dia = d::date
    )
  );
end;
$$;

create or replace function public.admin_organizacoes()
returns table (
  id uuid, nome text, tipo text, plano text, trial_ate date, suspensa boolean, motivo_suspensao text, notas_admin text,
  created_at timestamptz, dono_email text, dono_nome text, membros bigint, empresas bigint, processos bigint,
  documentos bigint, contratos bigint, tem_palavras_chave boolean, ultima_atividade timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return query
  select o.id, o.nome, o.tipo, o.plano, o.trial_ate, o.suspensa, o.motivo_suspensao, o.notas_admin, o.created_at,
         u.email::text, p.nome,
         (select count(*) from public.memberships m where m.org_id = o.id),
         (select count(*) from public.empresas e where e.org_id = o.id),
         (select count(*) from public.processos x where x.org_id = o.id),
         (select count(*) from public.documentos x where x.org_id = o.id),
         (select count(*) from public.contratos x where x.org_id = o.id),
         exists (select 1 from public.empresas e where e.org_id = o.id and cardinality(e.palavras_chave) > 0),
         greatest(
           (select max(a.created_at) from public.audit_log a where a.org_id = o.id),
           (select max(uu.last_sign_in_at) from public.memberships m join auth.users uu on uu.id = m.user_id where m.org_id = o.id)
         )
  from public.organizations o
  left join public.memberships mo on mo.org_id = o.id and mo.papel = 'owner'
  left join auth.users u on u.id = mo.user_id
  left join public.profiles p on p.id = mo.user_id
  order by o.created_at desc;
end;
$$;

create or replace function public.admin_usuarios()
returns table (
  id uuid, email text, nome text, created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmado boolean, is_admin boolean, organizacoes jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return query
  select u.id, u.email::text, p.nome, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
         exists (select 1 from public.platform_admins pa where pa.user_id = u.id),
         coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'papel', m.papel))
                   from public.memberships m join public.organizations o on o.id = m.org_id
                   where m.user_id = u.id), '[]'::jsonb)
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by u.created_at desc;
end;
$$;

create or replace function public.admin_atividade(p_limite integer default 100, p_org uuid default null)
returns table (id bigint, created_at timestamptz, org_id uuid, org_nome text, usuario_email text, tabela text, acao text, resumo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return query
  select a.id, a.created_at, a.org_id, o.nome, u.email::text, a.tabela, a.acao,
         coalesce(a.depois ->> 'objeto', a.depois ->> 'razao_social', a.depois ->> 'nome', a.depois ->> 'descricao',
                  a.depois ->> 'numero', a.antes ->> 'objeto', a.antes ->> 'razao_social', a.antes ->> 'nome')
  from public.audit_log a
  left join public.organizations o on o.id = a.org_id
  left join auth.users u on u.id = a.user_id
  where p_org is null or a.org_id = p_org
  order by a.created_at desc
  limit least(greatest(p_limite, 1), 500);
end;
$$;

create or replace function public.admin_atualizar_org(
  p_org uuid, p_plano text, p_trial_ate date, p_suspensa boolean, p_motivo text, p_notas text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  update public.organizations
     set plano = p_plano,
         trial_ate = p_trial_ate,
         suspensa = p_suspensa,
         motivo_suspensao = case when p_suspensa then nullif(trim(p_motivo), '') end,
         notas_admin = nullif(trim(p_notas), '')
   where id = p_org;
  if not found then
    raise exception 'organização não encontrada';
  end if;
end;
$$;

create or replace function public.admin_definir_admin(p_user uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  if p_user = auth.uid() and not p_admin then
    raise exception 'você não pode remover o seu próprio acesso master';
  end if;
  if p_admin then
    insert into public.platform_admins (user_id) values (p_user) on conflict do nothing;
  else
    delete from public.platform_admins where user_id = p_user;
  end if;
end;
$$;

revoke execute on function public.admin_resumo() from public, anon;
revoke execute on function public.admin_organizacoes() from public, anon;
revoke execute on function public.admin_usuarios() from public, anon;
revoke execute on function public.admin_atividade(integer, uuid) from public, anon;
revoke execute on function public.admin_atualizar_org(uuid, text, date, boolean, text, text) from public, anon;
revoke execute on function public.admin_definir_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_resumo() to authenticated;
grant execute on function public.admin_organizacoes() to authenticated;
grant execute on function public.admin_usuarios() to authenticated;
grant execute on function public.admin_atividade(integer, uuid) to authenticated;
grant execute on function public.admin_atualizar_org(uuid, text, date, boolean, text, text) to authenticated;
grant execute on function public.admin_definir_admin(uuid, boolean) to authenticated;
