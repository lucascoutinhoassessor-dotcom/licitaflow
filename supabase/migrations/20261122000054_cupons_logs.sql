-- Cupons (desconto na assinatura ou dias de acesso), logs da plataforma e edição completa do cliente pelo master.

-- ============================================================ Cupons
create table public.cupons (
  codigo      text primary key check (codigo ~ '^[A-Z0-9_-]{3,40}$'),
  tipo        text not null check (tipo in ('percentual', 'valor', 'dias')),
  -- percentual: 1 a 100 (%); valor: centavos de desconto por cobrança; dias: dias de acesso liberados.
  valor       integer not null check (valor > 0),
  plano_id    text references public.plataforma_planos(id) on delete set null,
  descricao   text check (length(descricao) <= 300),
  valido_ate  date,
  max_usos    integer check (max_usos is null or max_usos > 0),
  usos        integer not null default 0,
  ativo       boolean not null default true,
  criado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (tipo <> 'percentual' or valor <= 100),
  check (tipo <> 'dias' or valor <= 365)
);
alter table public.cupons enable row level security;
create policy cupons_admin on public.cupons for select to authenticated using (public.is_platform_admin());
grant select on public.cupons to authenticated;

create table public.cupom_resgates (
  id          bigint generated always as identity primary key,
  cupom       text not null references public.cupons(codigo) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  assinatura_id uuid,
  created_at  timestamptz not null default now(),
  unique (cupom, org_id)
);
alter table public.cupom_resgates enable row level security;
create policy resgates_sel on public.cupom_resgates for select to authenticated using (public.is_platform_admin() or public.is_member(org_id));
grant select on public.cupom_resgates to authenticated;

create function public.admin_salvar_cupom(p_codigo text, p_tipo text, p_valor integer, p_plano text default null, p_descricao text default null,
  p_valido_ate date default null, p_max_usos integer default null, p_ativo boolean default true) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := upper(trim(coalesce(p_codigo, '')));
begin
  perform public.exigir_admin();
  insert into public.cupons(codigo, tipo, valor, plano_id, descricao, valido_ate, max_usos, ativo, criado_por)
    values (v, p_tipo, p_valor, nullif(p_plano, ''), nullif(trim(p_descricao), ''), p_valido_ate, p_max_usos, coalesce(p_ativo, true), auth.uid())
  on conflict (codigo) do update set tipo = excluded.tipo, valor = excluded.valor, plano_id = excluded.plano_id, descricao = excluded.descricao,
    valido_ate = excluded.valido_ate, max_usos = excluded.max_usos, ativo = excluded.ativo;
  insert into public.admin_audit(ator, acao, alvo, dados) values (auth.uid(), 'cupom.salvar', 'cupons', jsonb_build_object('codigo', v, 'tipo', p_tipo, 'valor', p_valor));
  return v;
end $$;

create function public.admin_excluir_cupom(p_codigo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  delete from public.cupons where codigo = upper(trim(p_codigo));
  if not found then raise exception 'Cupom não encontrado'; end if;
  insert into public.admin_audit(ator, acao, alvo, dados) values (auth.uid(), 'cupom.excluir', 'cupons', jsonb_build_object('codigo', upper(trim(p_codigo))));
end $$;

-- Confere se o cupom vale para a organização (e para o plano, quando é desconto). Não consome.
create function public.conferir_cupom(p_codigo text, p_org uuid, p_plano text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.cupons;
begin
  if not public.pode_gerir_cobranca(p_org) and not public.is_platform_admin() then raise exception 'Somente o dono ou um administrador da organização usa cupons'; end if;
  select * into c from public.cupons where codigo = upper(trim(coalesce(p_codigo, '')));
  if not found or not c.ativo then raise exception 'Cupom inválido'; end if;
  if c.valido_ate is not null and c.valido_ate < current_date then raise exception 'Este cupom venceu em %', to_char(c.valido_ate, 'DD/MM/YYYY'); end if;
  if c.max_usos is not null and c.usos >= c.max_usos then raise exception 'Este cupom já atingiu o limite de usos'; end if;
  if exists (select 1 from public.cupom_resgates r where r.cupom = c.codigo and r.org_id = p_org) then raise exception 'Sua organização já usou este cupom'; end if;
  if c.tipo <> 'dias' and c.plano_id is not null and p_plano is not null and c.plano_id <> p_plano then raise exception 'Este cupom vale só para outro plano'; end if;
  return jsonb_build_object('codigo', c.codigo, 'tipo', c.tipo, 'valor', c.valor, 'plano', c.plano_id, 'descricao', c.descricao);
end $$;

-- A trava que impede o cliente de mexer em plano/teste/suspensão passa a aceitar uma liberação local da
-- transação, ligada só por funções do banco (como o resgate de cupom). O PostgREST não expõe set_config.
create or replace function public.proteger_campos_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() and coalesce(current_setting('licitaflow.liberar_campos', true), '') <> '1' then
    new.plano := old.plano;
    new.trial_ate := old.trial_ate;
    new.suspensa := old.suspensa;
    new.motivo_suspensao := old.motivo_suspensao;
    new.notas_admin := old.notas_admin;
  end if;
  return new;
end; $$;

-- Cupom de dias: soma os dias ao acesso (teste) e libera na hora a suspensão automática por teste vencido.
create function public.resgatar_cupom_dias(p_codigo text, p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c jsonb; v_ate date; v_nome text; v_plano text;
begin
  c := public.conferir_cupom(p_codigo, p_org);
  if c->>'tipo' <> 'dias' then raise exception 'Este cupom é de desconto: use-o ao assinar um plano'; end if;
  -- Trava o cupom contra dois resgates ao mesmo tempo além do limite.
  update public.cupons set usos = usos + 1 where codigo = c->>'codigo' and (max_usos is null or usos < max_usos);
  if not found then raise exception 'Este cupom já atingiu o limite de usos'; end if;
  insert into public.cupom_resgates(cupom, org_id, user_id) values (c->>'codigo', p_org, auth.uid());
  perform set_config('licitaflow.liberar_campos', '1', true);
  update public.organizations set trial_ate = greatest(coalesce(trial_ate, current_date), current_date) + (c->>'valor')::int
    where id = p_org returning trial_ate, nome, plano into v_ate, v_nome, v_plano;
  perform set_config('licitaflow.liberar_campos', '', true);
  insert into public.admin_audit(ator, acao, alvo, dados) values (auth.uid(), 'cupom.resgatar', 'organizations', jsonb_build_object('codigo', c->>'codigo', 'org', p_org, 'dias', c->>'valor', 'ate', v_ate));
  return c || jsonb_build_object('ate', v_ate, 'organizacao', v_nome, 'plano_atual', v_plano);
end $$;

-- Cupom de desconto: consumido pela API de pagamentos (chave de serviço) depois de criar a assinatura.
create function public.registrar_cupom_desconto(p_codigo text, p_org uuid, p_usuario uuid, p_assinatura uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.cupons set usos = usos + 1 where codigo = upper(trim(p_codigo)) and (max_usos is null or usos < max_usos);
  insert into public.cupom_resgates(cupom, org_id, user_id, assinatura_id) values (upper(trim(p_codigo)), p_org, p_usuario, p_assinatura) on conflict do nothing;
end $$;

revoke execute on function public.admin_salvar_cupom(text, text, integer, text, text, date, integer, boolean), public.admin_excluir_cupom(text),
  public.conferir_cupom(text, uuid, text), public.resgatar_cupom_dias(text, uuid), public.registrar_cupom_desconto(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_salvar_cupom(text, text, integer, text, text, date, integer, boolean), public.admin_excluir_cupom(text),
  public.conferir_cupom(text, uuid, text), public.resgatar_cupom_dias(text, uuid) to authenticated;
revoke execute on function public.registrar_cupom_desconto(text, uuid, uuid, uuid) from authenticated;

-- ============================================================ Logs da plataforma
-- Registro feito pelo master (atualizações, correções, incidentes, notas). Os marcados como públicos
-- aparecem para os clientes como "Atualizações da plataforma".
create table public.plataforma_logs (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null default 'nota' check (tipo in ('atualizacao', 'correcao', 'incidente', 'nota')),
  titulo      text not null check (length(trim(titulo)) between 3 and 160),
  texto       text not null default '' check (length(texto) <= 10000),
  publico     boolean not null default false,
  criado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index plataforma_logs_data on public.plataforma_logs(created_at desc);
alter table public.plataforma_logs enable row level security;
create policy logs_sel on public.plataforma_logs for select to authenticated using (public.is_platform_admin() or publico);
create policy logs_ins on public.plataforma_logs for insert to authenticated with check (public.is_platform_admin());
create policy logs_upd on public.plataforma_logs for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy logs_del on public.plataforma_logs for delete to authenticated using (public.is_platform_admin());
grant select, insert, update, delete on public.plataforma_logs to authenticated;

-- ============================================================ Master: nome e tipo da organização
create function public.admin_dados_org(p_org uuid, p_nome text, p_tipo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  if length(trim(coalesce(p_nome, ''))) not between 2 and 120 then raise exception 'Nome da organização: 2 a 120 caracteres'; end if;
  if p_tipo not in ('fornecedor', 'assessoria') then raise exception 'Tipo inválido'; end if;
  update public.organizations set nome = trim(p_nome), tipo = p_tipo where id = p_org;
  if not found then raise exception 'Organização não encontrada'; end if;
  insert into public.admin_audit(ator, acao, alvo, dados) values (auth.uid(), 'org.dados', 'organizations', jsonb_build_object('org', p_org, 'nome', trim(p_nome), 'tipo', p_tipo));
end $$;
revoke execute on function public.admin_dados_org(uuid, text, text) from public, anon;
grant execute on function public.admin_dados_org(uuid, text, text) to authenticated;
