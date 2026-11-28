-- LicitaForce Pregão ao Vivo: o programa instalado no computador do cliente acompanha a sala de disputa
-- nos portais, com a sessão que o próprio usuário abriu. Ver docs/app-instalado.md.
--
-- pav_computadores: cada computador com o programa aberto (sinal de vida a cada minuto).
-- pav_sessoes: cada pregão acompanhado (portal + chave do pregão no portal), ligado ao processo quando der.
-- pav_eventos: o que aconteceu na sala (mensagem do pregoeiro, convocação, fase do item, lance, posição).
--
-- Regras: módulo "pregao-ao-vivo" liberado para a organização (nasce oculto), limite de sessões
-- acompanhadas ao mesmo tempo pelo plano (limites_ia, chave "pregao-ao-vivo") e RLS por organização.
BEGIN;

update public.plataforma_planos set limites_ia = limites_ia || jsonb_build_object('pregao-ao-vivo',
  case id when 'trial' then 1 when 'essencial' then 2 when 'profissional' then 5 when 'assessoria' then 15 else 0 end);

create schema if not exists licitaflow_pav;
revoke all on schema licitaflow_pav from public, anon, authenticated;

create function licitaflow_pav.liberado(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plataforma_modulos m where m.id = 'pregao-ao-vivo'
                 and (m.estado = 'liberado' or (m.estado = 'teste' and p_org = any(m.orgs_teste))))
$$;

create table public.pav_computadores (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome       text not null check (length(nome) between 1 and 80),
  versao     text check (length(versao) <= 20),
  sinal_em   timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id, user_id, nome)
);

create table public.pav_sessoes (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  processo_id      uuid references public.processos (id) on delete set null,
  computador_id    uuid references public.pav_computadores (id) on delete set null,
  portal           text not null check (portal in ('comprasgov', 'bll', 'bnc', 'licitanet', 'pcp')),
  chave            text not null check (chave ~ '^[A-Za-z0-9._/-]{1,60}$'),
  titulo           text check (length(titulo) <= 300),
  situacao         text not null default 'acompanhando' check (situacao in ('acompanhando', 'pausada', 'encerrada')),
  sinal_em         timestamptz not null default now(),
  ultimo_evento_em timestamptz,
  created_at       timestamptz not null default now(),
  unique (org_id, portal, chave)
);
create index pav_sessoes_processo on public.pav_sessoes (processo_id) where processo_id is not null;

create table public.pav_eventos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  sessao_id    uuid not null references public.pav_sessoes (id) on delete cascade,
  tipo         text not null check (tipo in ('mensagem', 'convocacao', 'fase', 'lance', 'posicao', 'situacao', 'aviso')),
  item         text check (length(item) <= 20),
  autor        text check (length(autor) <= 80),
  texto        text not null check (length(texto) between 1 and 4000),
  prazo        timestamptz,
  cita_cliente boolean not null default false,
  quando       timestamptz not null default now(),
  impressao    text not null check (length(impressao) between 8 and 80),
  dados        jsonb not null default '{}' check (octet_length(dados::text) <= 4000),
  created_at   timestamptz not null default now(),
  unique (sessao_id, impressao)
);
create index pav_eventos_sessao on public.pav_eventos (sessao_id, quando desc);
create index pav_eventos_org on public.pav_eventos (org_id, created_at desc);

alter table public.pav_computadores enable row level security;
alter table public.pav_sessoes enable row level security;
alter table public.pav_eventos enable row level security;

create policy pav_comp_sel on public.pav_computadores for select to authenticated using (public.is_member(org_id));
create policy pav_comp_ins on public.pav_computadores for insert to authenticated
  with check (public.can_write(org_id) and user_id = (select auth.uid()));
create policy pav_comp_upd on public.pav_computadores for update to authenticated
  using (user_id = (select auth.uid())) with check (public.can_write(org_id) and user_id = (select auth.uid()));
create policy pav_comp_del on public.pav_computadores for delete to authenticated using (public.can_write(org_id));

create policy pav_sess_sel on public.pav_sessoes for select to authenticated using (public.is_member(org_id));
create policy pav_sess_ins on public.pav_sessoes for insert to authenticated with check (public.can_write(org_id));
create policy pav_sess_upd on public.pav_sessoes for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy pav_sess_del on public.pav_sessoes for delete to authenticated using (public.can_write(org_id));

-- Eventos: o programa grava, ninguém edita. Apagar só apagando a sessão.
create policy pav_ev_sel on public.pav_eventos for select to authenticated using (public.is_member(org_id));
create policy pav_ev_ins on public.pav_eventos for insert to authenticated with check (public.can_write(org_id));

grant select, insert, update, delete on public.pav_computadores, public.pav_sessoes to authenticated;
grant select, insert on public.pav_eventos to authenticated;
grant select on public.pav_computadores, public.pav_sessoes, public.pav_eventos to service_role;

-- Computador: só com o módulo liberado.
create function licitaflow_pav.antes_computador() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not licitaflow_pav.liberado(new.org_id) then
    raise exception 'O Pregão ao Vivo ainda não está liberado para a sua conta.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger pav_computadores_antes before insert or update on public.pav_computadores
  for each row execute function licitaflow_pav.antes_computador();

-- Sessão: módulo liberado, limite do plano e ligação com o processo (Compras.gov: UASG + número/ano).
create function licitaflow_pav.antes_sessao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_lim int; v_ativas int; v_num text; v_ano text;
begin
  if not licitaflow_pav.liberado(new.org_id) then
    raise exception 'O Pregão ao Vivo ainda não está liberado para a sua conta.' using errcode = '42501';
  end if;
  if new.situacao = 'acompanhando' and (tg_op = 'INSERT' or old.situacao <> 'acompanhando') then
    v_lim := (public.ia_limite_efetivo(new.org_id, 'pregao-ao-vivo')->>'limite')::int;
    if v_lim is not null then
      select count(*) into v_ativas from public.pav_sessoes s
        where s.org_id = new.org_id and s.situacao = 'acompanhando' and s.id <> new.id;
      if v_ativas >= v_lim then
        raise exception 'Seu plano acompanha % sessão(ões) ao mesmo tempo. Encerre uma para acompanhar outra.', v_lim using errcode = 'P0001';
      end if;
    end if;
  end if;
  if new.processo_id is null and new.portal = 'comprasgov' and new.chave ~ '^\d{17}$' then
    v_num := ltrim(substr(new.chave, 9, 5), '0');
    v_ano := substr(new.chave, 14, 4);
    select p.id into new.processo_id from public.processos p
      where p.org_id = new.org_id and ltrim(coalesce(p.uasg, ''), '0') = ltrim(substr(new.chave, 1, 6), '0')
        and ltrim(regexp_replace(coalesce(p.numero, ''), '\D', '', 'g'), '0') in (v_num || v_ano, v_num)
      order by p.created_at desc limit 1;
  end if;
  return new;
end $$;
create trigger pav_sessoes_antes before insert or update on public.pav_sessoes
  for each row execute function licitaflow_pav.antes_sessao();

-- Evento: a organização vem da sessão (não dá para gravar em sessão de outra organização).
create function licitaflow_pav.antes_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select s.org_id into new.org_id from public.pav_sessoes s where s.id = new.sessao_id;
  if new.org_id is null then raise exception 'Sessão não encontrada'; end if;
  return new;
end $$;
create trigger pav_eventos_antes before insert on public.pav_eventos
  for each row execute function licitaflow_pav.antes_evento();

-- Depois do evento: atualiza a sessão e, se for convocação com prazo e a sessão tiver processo, cria o prazo.
create function licitaflow_pav.depois_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_proc uuid;
begin
  update public.pav_sessoes set ultimo_evento_em = greatest(coalesce(ultimo_evento_em, new.quando), new.quando)
    where id = new.sessao_id returning processo_id into v_proc;
  if new.tipo = 'convocacao' and new.prazo is not null and new.prazo > now() and v_proc is not null then
    insert into public.prazos (org_id, processo_id, tipo, titulo, data_hora, origem, avisar_dias)
    values (new.org_id, v_proc, 'proposta',
            left('Convocação do pregoeiro' || coalesce(' (item ' || new.item || ')', '') || ': ' || new.texto, 300),
            new.prazo, 'sistema', '{0}');
  end if;
  return null;
end $$;
create trigger pav_eventos_depois after insert on public.pav_eventos
  for each row execute function licitaflow_pav.depois_evento();

-- "Meu plano" e a ficha do cliente no master: sessões acompanhadas agora contam como uso do Pregão ao Vivo.
create function licitaflow_pav.ativas(p_org uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.pav_sessoes where org_id = p_org and situacao = 'acompanhando'
$$;

create or replace function public.ia_uso_resumo(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'Acesso negado'; end if;
  return coalesce((
    select jsonb_object_agg(a.agente, public.ia_limite_efetivo(p_org, a.agente) || jsonb_build_object('usadas',
      case when a.agente = 'sentinela' then (select count(*)::int from licitaflow_sentinela.vigiados(p_org))
           when a.agente = 'radar' then (select count(*)::int from licitaflow_radar.monitoradas(p_org))
           when a.agente = 'pregao-ao-vivo' then licitaflow_pav.ativas(p_org)
           else public.ia_usos_mes(p_org, a.agente) end))
    from (
      select jsonb_object_keys(p.limites_ia) agente from public.organizations o join public.plataforma_planos p on p.id = o.plano where o.id = p_org
      union select l.agente from public.ia_limites_org l where l.org_id = p_org
      union select u.agente from public.ia_uso u where u.org_id = p_org and u.created_at >= public.ia_inicio_mes()
    ) a), '{}'::jsonb);
end; $$;

create or replace function public.admin_ia_cliente(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'plano', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'limites_ia', p.limites_ia) from public.organizations o join public.plataforma_planos p on p.id = o.plano where o.id = p_org),
    'excecoes', coalesce((select jsonb_object_agg(agente, limite) from public.ia_limites_org where org_id = p_org), '{}'::jsonb),
    'uso', coalesce((select jsonb_object_agg(agente, jsonb_build_object('novas', novas, 'reaproveitadas', reaproveitadas, 'custo_usd', custo))
      from (select agente, count(*) filter (where nova)::int novas, count(*) filter (where not nova)::int reaproveitadas, sum(custo_usd) custo
            from public.ia_uso where org_id = p_org and created_at >= public.ia_inicio_mes() group by agente) x), '{}'::jsonb)
      || jsonb_build_object('sentinela', jsonb_build_object('novas', (select count(*)::int from licitaflow_sentinela.vigiados(p_org)), 'reaproveitadas', 0, 'custo_usd', 0))
      || jsonb_build_object('radar', jsonb_build_object('novas', (select count(*)::int from licitaflow_radar.monitoradas(p_org)), 'reaproveitadas', 0, 'custo_usd', 0))
      || jsonb_build_object('pregao-ao-vivo', jsonb_build_object('novas', licitaflow_pav.ativas(p_org), 'reaproveitadas', 0, 'custo_usd', 0)));
end; $$;

-- Tempo real para o site (só quando a publicação do Supabase existe).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.pav_eventos, public.pav_sessoes, public.pav_computadores';
  end if;
end $$;

COMMIT;
