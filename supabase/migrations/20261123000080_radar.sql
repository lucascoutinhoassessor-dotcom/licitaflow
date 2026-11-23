-- LicitaForce · Agente Radar: todo dia de manhã cruza os editais abertos com o perfil de cada empresa
-- (palavras-chave, estados, modalidades, faixa de valor, palavras para excluir) e sugere as oportunidades
-- que combinam, com o motivo. O cliente decide: "Adicionar ao funil" cria o processo; "Descartar" esconde.
--
-- - Busca no próprio banco (oportunidades_indice / oportunidades_busca), com as mesmas regras de palavra-chave
--   da tela de Oportunidades (oportunidades_termos; "papel" acha "papéis"). Não usa IA: sem custo por uso.
--   Se a busca de oportunidades sair do Postgres (Turso), o Radar precisa acompanhar.
-- - Limite do plano (chave "radar" em limites_ia): empresas monitoradas ao mesmo tempo (as mais antigas primeiro).
-- - Rodada diária às 7h (Brasília) pelo pg_cron. Com sugestões novas, chama a Vercel só para mandar o push.
-- - "Buscar agora" no app roda a mesma busca para uma empresa (no máximo 1 vez a cada 10 min).
BEGIN;

create schema if not exists licitaflow_radar;
revoke all on schema licitaflow_radar from public, anon, authenticated;

create table licitaflow_radar.config (
  id boolean primary key default true check (id),
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  url text not null default 'https://licitaforce-app.vercel.app/api/agentes?agente=radar&acao=avisar',
  ativo boolean not null default true
);
insert into licitaflow_radar.config default values;

create table licitaflow_radar.execucoes (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  executado_em timestamptz not null default now(),
  novas integer not null default 0
);

-- Filtros do Radar por empresa. As palavras-chave continuam em empresas.palavras_chave.
create table public.radar_perfis (
  empresa_id   uuid primary key references public.empresas (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  ativo        boolean not null default true,
  excluir      text[] not null default '{}' check (cardinality(excluir) <= 30),
  ufs          text[] not null default '{}' check (cardinality(ufs) <= 27),
  modalidades  integer[] not null default '{}' check (cardinality(modalidades) <= 20),
  valor_min    numeric check (valor_min is null or valor_min >= 0),
  valor_max    numeric check (valor_max is null or valor_max >= 0),
  antecedencia_horas integer not null default 24 check (antecedencia_horas between 0 and 720),
  updated_at   timestamptz not null default now()
);
create trigger radar_perfis_empresa_org before insert or update of empresa_id, org_id on public.radar_perfis
  for each row execute function public.check_empresa_org();
alter table public.radar_perfis enable row level security;
create policy radar_perfis_ler on public.radar_perfis for select to authenticated using (public.is_member(org_id));
create policy radar_perfis_criar on public.radar_perfis for insert to authenticated with check (public.can_write(org_id));
create policy radar_perfis_editar on public.radar_perfis for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
grant select, insert, update on public.radar_perfis to authenticated;

create table public.radar_sugestoes (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organizations (id) on delete cascade,
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  controle      text not null,
  objeto        text,
  orgao         text,
  uf            text,
  modalidade    integer,
  valor         numeric,
  publicacao    timestamptz,
  encerramento  timestamptz,
  pontuacao     integer not null default 0,
  motivos       jsonb not null default '[]',
  compra        jsonb,
  status        text not null default 'nova' check (status in ('nova', 'adicionada', 'descartada')),
  processo_id   uuid references public.processos (id) on delete set null,
  notificado_em timestamptz,
  decidido_em   timestamptz,
  decidido_por  uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (empresa_id, controle)
);
create index radar_sugestoes_org on public.radar_sugestoes (org_id, status, created_at desc);
create index radar_sugestoes_aviso on public.radar_sugestoes (created_at) where notificado_em is null;
alter table public.radar_sugestoes enable row level security;
create policy radar_sugestoes_ler on public.radar_sugestoes for select to authenticated using (public.is_member(org_id));
grant select on public.radar_sugestoes to authenticated;
-- Sem escrita direta: o banco grava as sugestões e o cliente decide por radar_decidir().

-- O agente aparece explicitamente em todos os planos (nunca em aberto).
update public.plataforma_planos set limites_ia = limites_ia || jsonb_build_object('radar',
  case id when 'trial' then to_jsonb(1) when 'essencial' then to_jsonb(1) when 'profissional' then to_jsonb(3)
          when 'assessoria' then 'null'::jsonb else to_jsonb(0) end);

-- Empresas monitoradas: ativas, com palavras-chave, Radar ligado, agentes liberados, dentro do limite do plano.
create function licitaflow_radar.monitoradas(p_org uuid default null)
returns table (org_id uuid, empresa_id uuid)
language sql stable security definer set search_path = '' as $$
  with c as (
    select e.org_id, e.id, row_number() over (partition by e.org_id order by e.created_at, e.id) n
    from public.empresas e
    left join public.radar_perfis p on p.empresa_id = e.id
    where e.ativa and cardinality(e.palavras_chave) > 0 and coalesce(p.ativo, true)
      and (p_org is null or e.org_id = p_org)
      and licitaflow_sentinela.agentes_liberados(e.org_id)
  )
  select c.org_id, c.id from c
  where coalesce((public.ia_limite_efetivo(c.org_id, 'radar')->>'limite')::int, 2147483647) >= c.n
$$;

-- Busca as oportunidades de uma empresa e grava as sugestões novas (no máximo 30 por vez). Devolve quantas.
create function licitaflow_radar.buscar(p_empresa uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  e public.empresas; p public.radar_perfis; q tsquery; q_ex tsquery; kw text; r record; n integer := 0;
  no_objeto text[]; nos_itens text[]; pts integer; motivos jsonb;
begin
  select * into e from public.empresas where id = p_empresa;
  if not found then return 0; end if;
  select * into p from public.radar_perfis where empresa_id = p_empresa;
  foreach kw in array e.palavras_chave loop
    if public.oportunidades_termos(kw) is not null then q := case when q is null then public.oportunidades_termos(kw) else q || public.oportunidades_termos(kw) end; end if;
  end loop;
  if q is null then return 0; end if;
  foreach kw in array coalesce(p.excluir, '{}') loop
    if public.oportunidades_termos(kw) is not null then q_ex := case when q_ex is null then public.oportunidades_termos(kw) else q_ex || public.oportunidades_termos(kw) end; end if;
  end loop;

  for r in
    select i.controle, i.objeto, i.orgao_nome, i.uf, i.modalidade, i.valor, i.publicacao, i.encerramento, i.compra, i.busca_itens
    from public.oportunidades_indice i
    join public.oportunidades_busca b on b.controle = i.controle
    where (i.busca @@ q or i.busca_itens @@ q)
      and coalesce(b.situacao, 1) = 1
      and b.encerramento >= now() + make_interval(hours => coalesce(p.antecedencia_horas, 24))
      and (coalesce(cardinality(p.ufs), 0) = 0 or b.uf = any(p.ufs))
      and (coalesce(cardinality(p.modalidades), 0) = 0 or b.modalidade = any(p.modalidades))
      and (p.valor_min is null or b.valor >= p.valor_min)
      and (p.valor_max is null or coalesce(b.valor, 0) <= p.valor_max)
      and (q_ex is null or not (i.busca @@ q_ex))
      and not exists (select 1 from public.radar_sugestoes s where s.empresa_id = p_empresa and s.controle = i.controle)
    order by b.encerramento
    limit 200
  loop
    no_objeto := array(select k from unnest(e.palavras_chave) k
      where public.oportunidades_termos(k) is not null
        and to_tsvector('pg_catalog.portuguese', public.oportunidades_normalizar(r.objeto)) @@ public.oportunidades_termos(k));
    nos_itens := array(select k from unnest(e.palavras_chave) k
      where r.busca_itens is not null and public.oportunidades_termos(k) is not null and r.busca_itens @@ public.oportunidades_termos(k));
    pts := (case when cardinality(no_objeto) > 0 then 60 + least(20, 10 * (cardinality(no_objeto) - 1)) else 0 end)
         + (case when cardinality(nos_itens) > 0 then 15 else 0 end)
         + (case when e.uf is not null and e.uf = r.uf then 5 else 0 end);
    if pts = 0 then pts := 25; end if; -- só nas informações complementares
    motivos := '[]'::jsonb;
    if cardinality(no_objeto) > 0 then motivos := motivos || to_jsonb('O objeto cita: ' || array_to_string(no_objeto, ', ')); end if;
    if cardinality(nos_itens) > 0 then motivos := motivos || to_jsonb('Os itens citam: ' || array_to_string(nos_itens, ', ')); end if;
    if cardinality(no_objeto) = 0 and cardinality(nos_itens) = 0 then motivos := motivos || to_jsonb('As informações complementares citam suas palavras-chave'::text); end if;
    if e.uf is not null and e.uf = r.uf then motivos := motivos || to_jsonb('No mesmo estado da empresa (' || r.uf || ')'); end if;
    motivos := motivos || to_jsonb('Prazo final das propostas: ' || to_char(r.encerramento at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
    insert into public.radar_sugestoes (org_id, empresa_id, controle, objeto, orgao, uf, modalidade, valor, publicacao, encerramento, pontuacao, motivos, compra)
    values (e.org_id, e.id, r.controle, left(r.objeto, 1000), r.orgao_nome, r.uf, r.modalidade, r.valor, r.publicacao, r.encerramento, least(pts, 100), motivos, r.compra)
    on conflict (empresa_id, controle) do nothing;
    if found then n := n + 1; end if;
    exit when n >= 30;
  end loop;

  insert into licitaflow_radar.execucoes (empresa_id, executado_em, novas) values (p_empresa, now(), n)
  on conflict (empresa_id) do update set executado_em = now(), novas = excluded.novas;
  return n;
end $$;

-- Rodada diária: todas as empresas monitoradas. Com novidade, chama a Vercel para o push.
create function licitaflow_radar.rodada() returns jsonb
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
  if total > 0 and to_regnamespace('net') is not null then
    perform net.http_get(url := c.url, headers := jsonb_build_object('x-coleta', c.token), timeout_milliseconds := 60000);
  end if;
  return jsonb_build_object('empresas', empresas, 'novas', total);
end $$;

-- Para o app: "Buscar agora" de uma empresa (quem pode editar; no máximo 1 vez a cada 10 min).
create function public.radar_buscar_agora(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_ult timestamptz; n integer;
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
  -- Quem pediu está vendo a tela: não precisa de push.
  update public.radar_sugestoes set notificado_em = now() where empresa_id = p_empresa and notificado_em is null;
  return jsonb_build_object('novas', n);
end $$;

-- Para o app: adicionar ao funil (com o processo criado) ou descartar uma sugestão.
create function public.radar_decidir(p_id bigint, p_status text, p_processo uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.radar_sugestoes;
begin
  select * into s from public.radar_sugestoes where id = p_id;
  if not found or not public.can_write(s.org_id) then raise exception 'Acesso negado'; end if;
  if p_status not in ('nova', 'adicionada', 'descartada') then raise exception 'Situação inválida'; end if;
  if p_processo is not null and not exists (select 1 from public.processos where id = p_processo and org_id = s.org_id) then
    raise exception 'Processo inválido';
  end if;
  update public.radar_sugestoes set status = p_status, processo_id = coalesce(p_processo, processo_id),
    decidido_em = case when p_status = 'nova' then null else now() end, decidido_por = auth.uid()
  where id = p_id;
end $$;

-- Para o app: situação do Radar na organização.
create function public.radar_resumo(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'Acesso negado'; end if;
  return jsonb_build_object(
    'liberado', licitaflow_sentinela.agentes_liberados(p_org),
    'limite', public.ia_limite_efetivo(p_org, 'radar'),
    'empresas', coalesce((select jsonb_agg(jsonb_build_object(
        'empresa_id', e.id, 'razao_social', e.razao_social, 'nome_fantasia', e.nome_fantasia, 'uf', e.uf, 'palavras_chave', e.palavras_chave,
        'monitorada', m.empresa_id is not null,
        'motivo', case when cardinality(e.palavras_chave) = 0 then 'Cadastre as palavras-chave do que a empresa vende'
                       when p.ativo = false then 'Radar desligado nesta empresa'
                       when not licitaflow_sentinela.agentes_liberados(p_org) then 'Agentes de IA ainda não liberados para a sua conta'
                       when m.empresa_id is null then 'Fora do limite do plano'
                       else null end,
        'ultima_busca', x.executado_em, 'ultima_novas', x.novas,
        'pendentes', (select count(*) from public.radar_sugestoes s where s.empresa_id = e.id and s.status = 'nova'))
        order by e.created_at)
      from public.empresas e
      left join public.radar_perfis p on p.empresa_id = e.id
      left join licitaflow_radar.monitoradas(p_org) m on m.empresa_id = e.id
      left join licitaflow_radar.execucoes x on x.empresa_id = e.id
      where e.org_id = p_org and e.ativa), '[]'::jsonb));
end $$;

-- Para o servidor (push): sugestões ainda não avisadas, por empresa. Marca como avisadas.
create function public.radar_para_avisar(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if p_token is null or p_token <> (select token from licitaflow_radar.config where id) then raise exception 'Token inválido'; end if;
  with marcadas as (
    update public.radar_sugestoes set notificado_em = now()
    where notificado_em is null and status = 'nova' and created_at > now() - interval '2 days'
    returning org_id, empresa_id, objeto, pontuacao
  )
  select coalesce(jsonb_agg(jsonb_build_object('org_id', g.org_id, 'empresa_id', g.empresa_id, 'empresa', coalesce(e.nome_fantasia, e.razao_social),
      'quantidade', g.quantidade, 'destaque', g.destaque)), '[]'::jsonb) into v
  from (select org_id, empresa_id, count(*)::int quantidade, (array_agg(objeto order by pontuacao desc))[1] destaque from marcadas group by org_id, empresa_id) g
  join public.empresas e on e.id = g.empresa_id;
  return v;
end $$;

-- Uso por agente: Radar conta as empresas monitoradas agora (limite simultâneo), como a Sentinela.
create or replace function public.ia_uso_resumo(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'Acesso negado'; end if;
  return coalesce((
    select jsonb_object_agg(a.agente, public.ia_limite_efetivo(p_org, a.agente) || jsonb_build_object('usadas',
      case when a.agente = 'sentinela' then (select count(*)::int from licitaflow_sentinela.vigiados(p_org))
           when a.agente = 'radar' then (select count(*)::int from licitaflow_radar.monitoradas(p_org))
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
      || jsonb_build_object('radar', jsonb_build_object('novas', (select count(*)::int from licitaflow_radar.monitoradas(p_org)), 'reaproveitadas', 0, 'custo_usd', 0)));
end; $$;

-- Selo no cartão do Kanban: processo que veio de uma sugestão do Radar.
create or replace function public.agentes_estado_processos(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_liberado boolean; v_lim jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'Acesso negado'; end if;
  v_liberado := licitaflow_sentinela.agentes_liberados(p_org);
  v_lim := public.ia_limite_efetivo(p_org, 'sentinela') -> 'limite';
  return coalesce((
    select jsonb_object_agg(p.id, jsonb_strip_nulls(jsonb_build_object(
      'sentinela', case
        when p.pncp_controle is null or p.pncp_controle !~ '^\d{14}-1-\d{1,9}/\d{4}$'
          then jsonb_build_object('estado', 'indisponivel', 'motivo', 'Sem edital do PNCP vinculado')
        when p.arquivado_em is not null then jsonb_build_object('estado', 'indisponivel', 'motivo', 'Processo arquivado')
        when p.etapa in ('homologado', 'concluido', 'perdido', 'desistencia') then jsonb_build_object('estado', 'indisponivel', 'motivo', 'Processo encerrado')
        when not p.monitorar then jsonb_build_object('estado', 'desligado', 'motivo', 'Desligado neste processo')
        when not v_liberado then jsonb_build_object('estado', 'parado', 'motivo', 'Agentes de IA ainda não liberados para a sua conta')
        when v_lim = '0'::jsonb then jsonb_build_object('estado', 'parado', 'motivo', 'O seu plano não inclui a Sentinela')
        when w.processo_id is null then jsonb_build_object('estado', 'parado', 'motivo',
          'Fora do limite do plano (' || coalesce(v_lim #>> '{}', '?') || ' processos ao mesmo tempo)')
        when e.verificado_em is null then jsonb_build_object('estado', 'na_fila', 'motivo', 'Ligado: primeira verificação na fila')
        when e.falhas >= 3 then jsonb_build_object('estado', 'falha', 'motivo', 'O PNCP não respondeu nas últimas verificações', 'verificado_em', e.verificado_em)
        else jsonb_build_object('estado', 'ativo', 'motivo', 'Monitorando no PNCP', 'verificado_em', e.verificado_em, 'proxima_em', e.proxima_em, 'alterado_em', e.alterado_em)
      end,
      'leitor-editais', case when l.controle is not null
        then jsonb_build_object('estado', 'ativo', 'motivo', 'Edital lido pela IA', 'lido_em', l.created_at) end,
      'radar', case when rs.id is not null
        then jsonb_build_object('estado', 'ativo', 'motivo', 'Encontrado pelo Radar', 'lido_em', rs.created_at) end
    )))
    from public.processos p
    left join licitaflow_sentinela.vigiados(p_org) w on w.processo_id = p.id
    left join licitaflow_sentinela.editais e on e.controle = p.pncp_controle
    left join public.ia_leituras_edital l on l.controle = p.pncp_controle
    left join lateral (select s.id, s.created_at from public.radar_sugestoes s where s.processo_id = p.id limit 1) rs on true
    where p.org_id = p_org), '{}'::jsonb);
end $$;

revoke execute on all functions in schema licitaflow_radar from public, anon, authenticated;
revoke execute on function public.radar_buscar_agora(uuid), public.radar_decidir(bigint, text, uuid), public.radar_resumo(uuid) from public, anon;
grant execute on function public.radar_buscar_agora(uuid), public.radar_decidir(bigint, text, uuid), public.radar_resumo(uuid) to authenticated;
revoke execute on function public.radar_para_avisar(text) from public, anon, authenticated;
grant execute on function public.radar_para_avisar(text) to service_role;

-- Agenda: todo dia às 7h de Brasília (10h UTC).
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'licitaflow-radar';
    perform cron.schedule('licitaflow-radar', '0 10 * * *', 'select licitaflow_radar.rodada()');
  end if;
end $$;

COMMIT;
