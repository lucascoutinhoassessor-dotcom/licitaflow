-- LicitaFlow · Limites mensais dos agentes de IA por plano, com exceção por cliente.
-- Regra de cada agente (chave = id do agente, ex.: "leitor-editais"):
--   número ≥ 0 → usos novos por mês (0 = agente fora do plano) · null → sem limite · chave ausente → 0.
-- A exceção do cliente (ia_limites_org) vale no lugar do plano. O mês segue o horário de Brasília.
-- Só usos novos contam: leitura reaproveitada (nova = false) não gasta IA nem limite.
BEGIN;

create function public.limites_ia_validos(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1 from jsonb_each(p) e
    where e.key !~ '^[a-z0-9-]{2,40}$'
       or not (jsonb_typeof(e.value) = 'null'
               or (jsonb_typeof(e.value) = 'number' and (e.value #>> '{}') ~ '^\d{1,7}$')))
$$;

alter table public.plataforma_planos
  add column limites_ia jsonb not null default '{}' check (public.limites_ia_validos(limites_ia));
update public.plataforma_planos set limites_ia = jsonb_build_object('leitor-editais',
  case id when 'trial' then 3 when 'essencial' then 10 when 'profissional' then 30 when 'assessoria' then 100 else 0 end);

create table public.ia_limites_org (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  agente      text not null check (agente ~ '^[a-z0-9-]{2,40}$'),
  limite      integer check (limite between 0 and 9999999), -- null = sem limite
  updated_at  timestamptz not null default now(),
  primary key (org_id, agente)
);
alter table public.ia_limites_org enable row level security;
-- Sem políticas: leitura e escrita só pelas funções abaixo.
create trigger ia_limites_org_audit after insert or update or delete on public.ia_limites_org
  for each row execute function public.auditar_administracao();

create function public.ia_inicio_mes() returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
$$;

-- Limite efetivo de um agente para a organização: {limite, origem: 'cliente' | 'plano'}.
create function public.ia_limite_efetivo(p_org uuid, p_agente text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_lim public.ia_limites_org; v_plano jsonb;
begin
  select * into v_lim from public.ia_limites_org where org_id = p_org and agente = p_agente;
  if found then return jsonb_build_object('limite', v_lim.limite, 'origem', 'cliente'); end if;
  select p.limites_ia into v_plano from public.organizations o join public.plataforma_planos p on p.id = o.plano where o.id = p_org;
  if v_plano is null or not (v_plano ? p_agente) then return jsonb_build_object('limite', 0, 'origem', 'plano'); end if;
  return jsonb_build_object('limite', v_plano -> p_agente, 'origem', 'plano');
end; $$;

create function public.ia_usos_mes(p_org uuid, p_agente text) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.ia_uso
  where org_id = p_org and agente = p_agente and nova and created_at >= public.ia_inicio_mes()
$$;

-- Para o servidor (chave de serviço): limite efetivo e usos novos do mês.
create function public.ia_limite_e_uso(p_org uuid, p_agente text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.ia_limite_efetivo(p_org, p_agente) || jsonb_build_object('usadas', public.ia_usos_mes(p_org, p_agente))
$$;

-- Para o cliente: limite e uso do mês de cada agente que o plano ou a exceção mencionam, ou que já foi usado.
create function public.ia_uso_resumo(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'Acesso negado'; end if;
  return coalesce((
    select jsonb_object_agg(a.agente, public.ia_limite_efetivo(p_org, a.agente) || jsonb_build_object('usadas', public.ia_usos_mes(p_org, a.agente)))
    from (
      select jsonb_object_keys(p.limites_ia) agente from public.organizations o join public.plataforma_planos p on p.id = o.plano where o.id = p_org
      union select l.agente from public.ia_limites_org l where l.org_id = p_org
      union select u.agente from public.ia_uso u where u.org_id = p_org and u.created_at >= public.ia_inicio_mes()
    ) a), '{}'::jsonb);
end; $$;

create function public.admin_salvar_limites_ia_plano(p_plano text, p_limites jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  if not public.limites_ia_validos(coalesce(p_limites, 'null'::jsonb)) then raise exception 'Limites de IA inválidos'; end if;
  update public.plataforma_planos set limites_ia = p_limites, updated_at = now() where id = p_plano;
  if not found then raise exception 'Plano não encontrado'; end if;
end; $$;

-- p_usar_plano = true remove a exceção; senão grava p_limite (null = sem limite).
create function public.admin_salvar_limite_ia_org(p_org uuid, p_agente text, p_limite integer, p_usar_plano boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  if p_agente !~ '^[a-z0-9-]{2,40}$' then raise exception 'Agente inválido'; end if;
  if p_usar_plano then
    delete from public.ia_limites_org where org_id = p_org and agente = p_agente;
  else
    if p_limite is not null and p_limite < 0 then raise exception 'Limite inválido'; end if;
    insert into public.ia_limites_org(org_id, agente, limite, updated_at) values (p_org, p_agente, p_limite, now())
    on conflict (org_id, agente) do update set limite = excluded.limite, updated_at = now();
  end if;
end; $$;

-- Ficha de IA de um cliente para o master: plano, exceções e consumo do mês por agente.
create function public.admin_ia_cliente(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'plano', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'limites_ia', p.limites_ia) from public.organizations o join public.plataforma_planos p on p.id = o.plano where o.id = p_org),
    'excecoes', coalesce((select jsonb_object_agg(agente, limite) from public.ia_limites_org where org_id = p_org), '{}'::jsonb),
    'uso', coalesce((select jsonb_object_agg(agente, jsonb_build_object('novas', novas, 'reaproveitadas', reaproveitadas, 'custo_usd', custo))
      from (select agente, count(*) filter (where nova)::int novas, count(*) filter (where not nova)::int reaproveitadas, sum(custo_usd) custo
            from public.ia_uso where org_id = p_org and created_at >= public.ia_inicio_mes() group by agente) x), '{}'::jsonb));
end; $$;

-- Consumo de IA de todos os clientes num mês (p_mes = qualquer dia do mês; padrão: mês atual).
create function public.admin_consumo_ia(p_mes date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_ini timestamptz; v_fim timestamptz;
begin
  perform public.exigir_admin();
  v_ini := case when p_mes is null then public.ia_inicio_mes() else (date_trunc('month', p_mes)::timestamp) at time zone 'America/Sao_Paulo' end;
  v_fim := ((date_trunc('month', v_ini at time zone 'America/Sao_Paulo') + interval '1 month')::timestamp) at time zone 'America/Sao_Paulo';
  return jsonb_build_object('inicio', v_ini, 'fim', v_fim, 'linhas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'org_id', o.id, 'org', o.nome, 'plano', p.nome, 'mensal_centavos', p.mensal_centavos, 'agente', x.agente,
      'novas', x.novas, 'reaproveitadas', x.reaproveitadas, 'custo_usd', x.custo, 'tokens', x.tokens,
      'limite', public.ia_limite_efetivo(o.id, x.agente)) order by x.custo desc, o.nome)
    from (select org_id, agente, count(*) filter (where nova)::int novas, count(*) filter (where not nova)::int reaproveitadas,
                 coalesce(sum(custo_usd), 0) custo, coalesce(sum(tokens_entrada + tokens_saida), 0)::bigint tokens
          from public.ia_uso where created_at >= v_ini and created_at < v_fim group by org_id, agente) x
    join public.organizations o on o.id = x.org_id
    join public.plataforma_planos p on p.id = o.plano), '[]'::jsonb));
end; $$;

revoke execute on function public.ia_limite_efetivo(uuid, text), public.ia_usos_mes(uuid, text), public.ia_limite_e_uso(uuid, text) from public, anon, authenticated;
grant execute on function public.ia_limite_e_uso(uuid, text) to service_role;
revoke execute on function public.ia_uso_resumo(uuid), public.admin_salvar_limites_ia_plano(text, jsonb),
  public.admin_salvar_limite_ia_org(uuid, text, integer, boolean), public.admin_ia_cliente(uuid), public.admin_consumo_ia(date) from public, anon;
grant execute on function public.ia_uso_resumo(uuid), public.admin_salvar_limites_ia_plano(text, jsonb),
  public.admin_salvar_limite_ia_org(uuid, text, integer, boolean), public.admin_ia_cliente(uuid), public.admin_consumo_ia(date) to authenticated;

COMMIT;
