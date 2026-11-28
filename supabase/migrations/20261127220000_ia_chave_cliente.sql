-- LicitaForce · IA do próprio cliente: o cliente liga a chave de API da conta dele (Claude/Anthropic,
-- Gemini/Google ou ChatGPT/OpenAI). Com uma chave ativa, o Leitor de editais e o Jurídico com IA usam a
-- conta dele: o custo é do cliente e o uso não conta no limite do plano.
--
-- A chave chega aqui já cifrada pelo servidor (AES-256-GCM, server/iaCliente.js). Nem o cliente nem o
-- navegador leem a chave de volta: a tabela não tem políticas; o cliente vê só o provedor, o modelo e os
-- últimos 4 caracteres pelas funções abaixo. Ativar, trocar e remover: dono ou administrador.
BEGIN;

create table public.ia_chaves_cliente (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  provedor    text not null check (provedor in ('anthropic', 'google', 'openai')),
  modelo      text not null check (modelo ~ '^[A-Za-z0-9._:-]{2,80}$'),
  cifrada     text not null check (length(cifrada) between 20 and 2000),
  final       text not null check (length(final) between 2 and 8),
  ativa       boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, provedor)
);
create unique index ia_chaves_uma_ativa on public.ia_chaves_cliente (org_id) where ativa;
alter table public.ia_chaves_cliente enable row level security;
-- Sem políticas: só o servidor (chave de serviço) e as funções abaixo.
grant select, insert, update, delete on public.ia_chaves_cliente to service_role;

-- Uso com a chave do cliente fica registrado (para o histórico), mas não conta no limite do plano.
alter table public.ia_uso add column provedor text not null default 'licitaforce'
  check (provedor in ('licitaforce', 'anthropic', 'google', 'openai'));

create or replace function public.ia_usos_mes(p_org uuid, p_agente text) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.ia_uso
  where org_id = p_org and agente = p_agente and nova and provedor = 'licitaforce' and created_at >= public.ia_inicio_mes()
$$;

-- Chaves da organização para a tela (sem a chave).
create function public.ia_chaves_resumo(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'Acesso negado'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('provedor', provedor, 'modelo', modelo, 'final', final, 'ativa', ativa, 'updated_at', updated_at) order by provedor)
    from public.ia_chaves_cliente where org_id = p_org), '[]'::jsonb);
end; $$;

-- Escolhe qual chave usar (null = voltar à IA do LicitaForce, dentro do limite do plano).
create function public.ia_ativar_chave(p_org uuid, p_provedor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(p_org, array['owner', 'admin']) then raise exception 'Só o dono ou um administrador muda a IA da organização.'; end if;
  if p_provedor is not null and not exists (select 1 from public.ia_chaves_cliente where org_id = p_org and provedor = p_provedor) then
    raise exception 'Chave não cadastrada para este provedor.';
  end if;
  update public.ia_chaves_cliente set ativa = false, updated_at = now() where org_id = p_org and ativa and provedor is distinct from p_provedor;
  if p_provedor is not null then
    update public.ia_chaves_cliente set ativa = true, updated_at = now() where org_id = p_org and provedor = p_provedor;
  end if;
  return public.ia_chaves_resumo(p_org);
end; $$;

create function public.ia_remover_chave(p_org uuid, p_provedor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(p_org, array['owner', 'admin']) then raise exception 'Só o dono ou um administrador muda a IA da organização.'; end if;
  delete from public.ia_chaves_cliente where org_id = p_org and provedor = p_provedor;
  return public.ia_chaves_resumo(p_org);
end; $$;

revoke execute on function public.ia_chaves_resumo(uuid), public.ia_ativar_chave(uuid, text), public.ia_remover_chave(uuid, text) from public, anon;
grant execute on function public.ia_chaves_resumo(uuid), public.ia_ativar_chave(uuid, text), public.ia_remover_chave(uuid, text) to authenticated;

COMMIT;
