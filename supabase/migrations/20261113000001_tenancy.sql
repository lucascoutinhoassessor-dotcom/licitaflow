-- LicitaFlow · 0001 · Multi-tenancy: perfis, organizações, membros, convites e empresas licitantes
-- Modelo: organization (cliente pagante) -> N empresas licitantes (CNPJ).
-- Fornecedor = 1 empresa; assessoria = várias.

-- =========================================================
-- Utilitários
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- Perfis (espelho de auth.users)
-- =========================================================
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text,
  email       text,
  telefone    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- Organizações e membros
-- =========================================================
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) between 2 and 120),
  tipo        text not null default 'fornecedor' check (tipo in ('fornecedor', 'assessoria')),
  plano       text not null default 'trial' check (plano in ('trial', 'essencial', 'profissional', 'assessoria', 'cancelado')),
  trial_ate   date not null default (current_date + 14),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.memberships (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  papel       text not null default 'membro' check (papel in ('owner', 'admin', 'membro', 'leitor')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id);

-- Funções de autorização usadas nas políticas RLS.
-- security definer evita recursão de RLS em memberships.
create or replace function public.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = auth.uid()
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
    where m.org_id = p_org and m.user_id = auth.uid() and m.papel = any (p_papeis)
  );
$$;

-- Pode escrever = qualquer papel exceto leitor
create or replace function public.can_write(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(p_org, array['owner', 'admin', 'membro']);
$$;

-- =========================================================
-- Convites
-- =========================================================
create table public.convites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  email       text not null,
  papel       text not null default 'membro' check (papel in ('admin', 'membro', 'leitor')),
  token       uuid not null default gen_random_uuid() unique,
  criado_por  uuid references auth.users (id) on delete set null,
  aceito_em   timestamptz,
  aceito_por  uuid references auth.users (id) on delete set null,
  expira_em   timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now()
);

create index convites_org_idx on public.convites (org_id);

-- =========================================================
-- Empresas licitantes (CNPJ)
-- =========================================================
create table public.empresas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  cnpj            text not null check (cnpj ~ '^[0-9]{14}$'),
  razao_social    text not null,
  nome_fantasia   text,
  porte           text,               -- ME, EPP, DEMAIS
  optante_simples boolean,
  cnae_principal  text,
  cnaes           jsonb not null default '[]'::jsonb,
  endereco        jsonb not null default '{}'::jsonb,
  uf              text check (uf is null or uf ~ '^[A-Z]{2}$'),
  municipio       text,
  email           text,
  telefone        text,
  palavras_chave  text[] not null default '{}',  -- perfil de atuação (usado pelo Radar)
  ativa           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, cnpj)
);

create index empresas_org_idx on public.empresas (org_id);

create trigger empresas_updated_at before update on public.empresas
  for each row execute function public.set_updated_at();

-- =========================================================
-- RPCs
-- =========================================================

-- Cria organização e torna o usuário atual owner (atômico).
create or replace function public.criar_organizacao(p_nome text, p_tipo text default 'fornecedor')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  insert into public.organizations (nome, tipo, created_by)
  values (trim(p_nome), p_tipo, auth.uid())
  returning id into v_org;

  insert into public.memberships (org_id, user_id, papel)
  values (v_org, auth.uid(), 'owner');

  return v_org;
end;
$$;

-- Aceita convite: valida token, e-mail e validade.
create or replace function public.aceitar_convite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.convites;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select * into v_conv from public.convites where token = p_token for update;
  if not found then
    raise exception 'convite inválido';
  end if;
  if v_conv.aceito_em is not null then
    raise exception 'convite já utilizado';
  end if;
  if v_conv.expira_em < now() then
    raise exception 'convite expirado';
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if lower(v_email) <> lower(v_conv.email) then
    raise exception 'este convite foi enviado para outro e-mail';
  end if;

  insert into public.memberships (org_id, user_id, papel)
  values (v_conv.org_id, auth.uid(), v_conv.papel)
  on conflict (org_id, user_id) do nothing;

  update public.convites
     set aceito_em = now(), aceito_por = auth.uid()
   where id = v_conv.id;

  return v_conv.org_id;
end;
$$;

-- Dados públicos mínimos de um convite (para a tela de aceite, antes do login).
create or replace function public.ver_convite(p_token uuid)
returns table (org_nome text, email text, papel text, expirado boolean, usado boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select o.nome, c.email, c.papel, c.expira_em < now(), c.aceito_em is not null
  from public.convites c
  join public.organizations o on o.id = c.org_id
  where c.token = p_token;
$$;

grant execute on function public.criar_organizacao(text, text) to authenticated;
grant execute on function public.aceitar_convite(uuid) to authenticated;
grant execute on function public.ver_convite(uuid) to anon, authenticated;

-- =========================================================
-- RLS
-- =========================================================
alter table public.profiles      enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships   enable row level security;
alter table public.convites      enable row level security;
alter table public.empresas      enable row level security;

-- profiles: o próprio usuário, e colegas de organização (para mostrar nomes)
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships a
      join public.memberships b on a.org_id = b.org_id
      where a.user_id = auth.uid() and b.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- organizations: membros leem; owner/admin editam; criação só via RPC
create policy org_select on public.organizations for select to authenticated
  using (public.is_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.has_role(id, array['owner', 'admin']))
  with check (public.has_role(id, array['owner', 'admin']));
create policy org_delete on public.organizations for delete to authenticated
  using (public.has_role(id, array['owner']));

-- memberships: membros veem a equipe; owner/admin gerenciam (exceto rebaixar/remover owner)
create policy mem_select on public.memberships for select to authenticated
  using (public.is_member(org_id));
create policy mem_update on public.memberships for update to authenticated
  using (public.has_role(org_id, array['owner', 'admin']) and papel <> 'owner')
  with check (public.has_role(org_id, array['owner', 'admin']) and papel <> 'owner');
create policy mem_delete on public.memberships for delete to authenticated
  using (
    (public.has_role(org_id, array['owner', 'admin']) and papel <> 'owner')
    or (user_id = auth.uid() and papel <> 'owner')   -- sair da organização
  );

-- convites: owner/admin
create policy conv_select on public.convites for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin']));
create policy conv_insert on public.convites for insert to authenticated
  with check (public.has_role(org_id, array['owner', 'admin']) and criado_por = auth.uid());
create policy conv_delete on public.convites for delete to authenticated
  using (public.has_role(org_id, array['owner', 'admin']));

-- empresas
create policy emp_select on public.empresas for select to authenticated
  using (public.is_member(org_id));
create policy emp_insert on public.empresas for insert to authenticated
  with check (public.has_role(org_id, array['owner', 'admin']));
create policy emp_update on public.empresas for update to authenticated
  using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy emp_delete on public.empresas for delete to authenticated
  using (public.has_role(org_id, array['owner', 'admin']));
