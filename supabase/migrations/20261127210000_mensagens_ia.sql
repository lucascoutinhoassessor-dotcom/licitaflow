-- Mensagens da IA para cada cliente, em horário comercial, a partir da análise daquele cliente:
-- oportunidades novas do Radar, disputas e prazos do dia, documentos vencendo e dicas do que falta configurar.
-- O master escolhe dias, horários e assuntos (Master → Mensagens da IA), tira clientes da rotina ou dá
-- horários próprios a eles, e pode mandar mensagens avulsas redigidas pela IA na hora.
-- As mensagens vão para o sino de cada usuário (public.notificacoes) e saem por push pela fila que já existe
-- (public.notificacoes_envios, entregue pela ação "lembretes" de api/push). Sem chave da IA, os textos são
-- montados com os dados do cliente (modelos abaixo), sem custo.
BEGIN;

-- =========================================================
-- 1. Configuração do master
-- =========================================================
create table public.mensagens_ia_config (
  id boolean primary key default true check (id),
  ativo boolean not null default false,
  -- 0 = domingo … 6 = sábado (extract(dow)); padrão: segunda a sexta.
  dias smallint[] not null default '{1,2,3,4,5}' check (cardinality(dias) between 1 and 7 and 0 <= all(dias) and 6 >= all(dias)),
  -- Horas cheias de Brasília em que a rotina roda (7h–21h).
  horarios smallint[] not null default '{9,13,17}' check (cardinality(horarios) between 1 and 8 and 7 <= all(horarios) and 21 >= all(horarios)),
  oportunidades boolean not null default true,
  prazos boolean not null default true,
  documentos boolean not null default true,
  dicas boolean not null default true,
  -- Quem não tem push recebe também por e-mail/WhatsApp (canal de reserva de Notificações e lembretes).
  reserva boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.mensagens_ia_config default values;
alter table public.mensagens_ia_config enable row level security;
create policy mensagens_ia_config_ler on public.mensagens_ia_config for select to authenticated using ((select public.is_platform_admin()));
create policy mensagens_ia_config_editar on public.mensagens_ia_config for update to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
grant select, update on public.mensagens_ia_config to authenticated;
create trigger mensagens_ia_config_atualizado before update on public.mensagens_ia_config for each row execute function public.set_updated_at();

-- Exceções por cliente: fora da rotina ou com horários próprios.
create table public.mensagens_ia_clientes (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  fora boolean not null default false,
  horarios smallint[] check (horarios is null or (cardinality(horarios) between 1 and 8 and 7 <= all(horarios) and 21 >= all(horarios))),
  updated_at timestamptz not null default now()
);
alter table public.mensagens_ia_clientes enable row level security;
create policy mensagens_ia_clientes_master on public.mensagens_ia_clientes for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
grant select, insert, update, delete on public.mensagens_ia_clientes to authenticated;
create trigger mensagens_ia_clientes_atualizado before update on public.mensagens_ia_clientes for each row execute function public.set_updated_at();

-- =========================================================
-- 2. Fila e sino
-- =========================================================
alter table public.notificacoes_envios drop constraint if exists notificacoes_envios_origem_check;
alter table public.notificacoes_envios add constraint notificacoes_envios_origem_check check (origem in ('lembrete','aviso','ia'));
create index if not exists notificacoes_envios_ia_org on public.notificacoes_envios(org_id, created_at desc) where origem = 'ia';
create index if not exists notificacoes_usuario_nao_lidas on public.notificacoes(user_id, created_at desc) where lida_em is null;

alter table licitaflow_lembretes.config add column if not exists ia_hora timestamptz;

-- Lembretes que saem por push também aparecem no sino.
create function licitaflow_lembretes.lembrete_no_sino() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.origem = 'lembrete' and new.org_id is not null then
    insert into public.notificacoes(org_id, user_id, tipo, titulo, mensagem, link)
      values (new.org_id, new.user_id, 'lembrete', new.titulo, new.texto, new.link);
  end if;
  return new;
end $$;
create trigger notificacoes_envios_sino after insert on public.notificacoes_envios
  for each row execute function licitaflow_lembretes.lembrete_no_sino();

-- Entrega uma mensagem a todos os membros de uma organização: sino para todos; push para quem tem
-- aparelho inscrito; e-mail/WhatsApp para quem não tem, se p_reserva.
create function licitaflow_lembretes.entregar_org(p_org uuid, p_titulo text, p_texto text, p_link text, p_refs text[], p_chave text, p_reserva boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare canal text; n integer;
begin
  select canal_reserva into canal from public.notificacoes_config where id;
  with membros as (
    select m.user_id, exists (select 1 from public.push_inscricoes s where s.user_id = m.user_id) as tem_push
    from public.memberships m
    left join public.push_agentes_preferencias pr on pr.user_id = m.user_id
    where m.org_id = p_org and m.papel <> 'leitor' and coalesce(pr.lembretes, true)
  ), sino as (
    insert into public.notificacoes(org_id, user_id, tipo, titulo, mensagem, link)
    select p_org, mb.user_id, 'ia', left(p_titulo, 120), left(p_texto, 1000), p_link from membros mb
    returning user_id
  )
  insert into public.notificacoes_envios(user_id, org_id, origem, chaves, refs, titulo, texto, link, canal)
  select mb.user_id, p_org, 'ia', array[p_chave], coalesce(p_refs, '{}'), left(p_titulo, 120), left(p_texto, 1000), p_link,
    case when mb.tem_push then 'push' else coalesce(canal, 'email') end
  from membros mb where mb.tem_push or p_reserva;
  get diagnostics n = row_count;
  -- O sino recebe mesmo quando ninguém tem push: a contagem devolvida é de envios.
  return n;
end $$;

-- =========================================================
-- 3. Análise de cada cliente
-- =========================================================
-- p_desde: oportunidades criadas depois disso; p_refs: itens já mencionados hoje (não se repetem).
create function licitaflow_lembretes.analise_ia(p_org uuid, p_agora timestamptz default now(), p_desde timestamptz default null, p_refs text[] default '{}')
returns jsonb language sql stable security definer set search_path = '' as $$
  with base as (
    select (p_agora at time zone 'America/Sao_Paulo')::date as hoje,
      coalesce(p_desde, p_agora - interval '1 day') as desde, coalesce(p_refs, '{}') as refs
  ), empresa as (
    select coalesce(nullif(e.nome_fantasia, ''), e.razao_social) as nome from public.empresas e
    where e.org_id = p_org and e.ativa order by e.created_at limit 1
  ), ops as (
    select s.id, s.objeto, s.orgao, s.uf, s.valor, s.encerramento, s.pontuacao
    from public.radar_sugestoes s, base b
    where s.org_id = p_org and s.status = 'nova' and s.created_at > b.desde
      and (s.encerramento is null or s.encerramento > p_agora)
      and not (('op:' || s.id) = any(b.refs))
  ), disputas as (
    select p.id, p.objeto, p.numero, p.orgao_nome, p.data_abertura,
      (p.data_abertura at time zone 'America/Sao_Paulo')::date as dia
    from public.processos p, base b
    where p.org_id = p_org and p.etapa in ('captacao','analise','proposta','disputa','habilitacao')
      and p.data_abertura >= p_agora - interval '1 hour'
      and (p.data_abertura at time zone 'America/Sao_Paulo')::date between b.hoje and b.hoje + 1
  ), prazos as (
    select z.id, z.tipo, z.titulo, z.data_hora
    from public.prazos z, base b
    where z.org_id = p_org and not z.concluido and z.data_hora > p_agora
      and (z.data_hora at time zone 'America/Sao_Paulo')::date = b.hoje
      and not (('pz:' || z.id) = any(b.refs))
  ), docs as (
    select d.nome, d.validade from public.documentos d, base b
    where d.org_id = p_org and d.validade between b.hoje - 30 and b.hoje + 15
      and d.categoria in ('certidao','habilitacao_juridica','qualificacao_tecnica','qualificacao_economica','declaracao')
  )
  select jsonb_build_object(
    'empresa', (select nome from empresa),
    'oportunidades', jsonb_build_object(
      'quantidade', (select count(*) from ops),
      'refs', coalesce((select jsonb_agg('op:' || x.id) from (select id from ops order by id limit 200) x), '[]'::jsonb),
      'destaques', coalesce((select jsonb_agg(jsonb_build_object('objeto', left(x.objeto, 160), 'orgao', x.orgao, 'uf', x.uf, 'valor', x.valor,
          'encerramento', to_char(x.encerramento at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')) order by x.pontuacao desc, x.id)
        from (select * from ops order by pontuacao desc, id limit 3) x), '[]'::jsonb)),
    'disputas_hoje', coalesce((select jsonb_agg(jsonb_build_object('ref', 'pr:' || x.id, 'objeto', left(x.objeto, 140), 'numero', x.numero, 'orgao', x.orgao_nome,
        'hora', to_char(x.data_abertura at time zone 'America/Sao_Paulo', 'HH24:MI')) order by x.data_abertura)
      from (select d.* from disputas d, base b where d.dia = b.hoje and not (('pr:' || d.id) = any(b.refs)) order by d.data_abertura limit 5) x), '[]'::jsonb),
    'disputas_amanha', coalesce((select jsonb_agg(jsonb_build_object('objeto', left(x.objeto, 140), 'numero', x.numero, 'orgao', x.orgao_nome,
        'hora', to_char(x.data_abertura at time zone 'America/Sao_Paulo', 'HH24:MI')) order by x.data_abertura)
      from (select d.* from disputas d, base b where d.dia = b.hoje + 1 order by d.data_abertura limit 5) x), '[]'::jsonb),
    'prazos_hoje', coalesce((select jsonb_agg(jsonb_build_object('ref', 'pz:' || x.id, 'tipo', x.tipo, 'titulo', left(x.titulo, 120),
        'hora', to_char(x.data_hora at time zone 'America/Sao_Paulo', 'HH24:MI')) order by x.data_hora)
      from (select * from prazos order by data_hora limit 5) x), '[]'::jsonb),
    'documentos', jsonb_build_object(
      'vencidos', (select count(*) from docs d, base b where d.validade < b.hoje),
      'vencendo', (select count(*) from docs d, base b where d.validade >= b.hoje),
      'lista', coalesce((select jsonb_agg(x.nome || ' (' || to_char(x.validade, 'DD/MM') || ')' order by x.validade)
        from (select d.* from docs d, base b where d.validade >= b.hoje order by d.validade limit 3) x), '[]'::jsonb),
      'ja_avisado_hoje', (select ('doc:' || to_char(b.hoje, 'YYYY-MM-DD')) = any(b.refs) from base b)),
    'configuracao', jsonb_build_object(
      'tem_empresa', exists (select 1 from public.empresas e where e.org_id = p_org),
      'tem_radar', exists (select 1 from public.empresas e where e.org_id = p_org and e.ativa and cardinality(e.palavras_chave) > 0)
        or exists (select 1 from public.radar_filtros f where f.org_id = p_org and f.ativo and cardinality(f.palavras_chave) > 0),
      'processos_ativos', (select count(*) from public.processos p where p.org_id = p_org and p.etapa not in ('homologado','perdido','desistencia')),
      'documentos', (select count(*) from public.documentos d where d.org_id = p_org),
      'alguem_com_push', exists (select 1 from public.memberships m join public.push_inscricoes s on s.user_id = m.user_id where m.org_id = p_org))
  )
$$;

-- Modelo de texto (sem IA) a partir da análise. Devolve null quando não há nada novo para dizer.
create function licitaflow_lembretes.texto_ia(a jsonb, cfg public.mensagens_ia_config, p_dica_hoje boolean, p_hoje date)
returns jsonb language plpgsql stable set search_path = '' as $$
declare linhas text[] := '{}'; refs text[] := '{}'; titulo text; link text := '/app'; n integer; d jsonb; x jsonb;
  dicas text[][]; empresa text := coalesce(nullif(a->>'empresa', ''), 'sua empresa'); dica text;
begin
  if cfg.prazos then
    for x in select * from jsonb_array_elements(a->'disputas_hoje') loop
      linhas := linhas || format('Disputa hoje às %s: %s%s.', x->>'hora', x->>'objeto', coalesce(' (' || nullif(x->>'orgao', '') || ')', ''));
      refs := refs || (x->>'ref');
      titulo := coalesce(titulo, 'Disputa hoje às ' || (x->>'hora')); link := '/app/processos';
    end loop;
    for x in select * from jsonb_array_elements(a->'prazos_hoje') loop
      linhas := linhas || format('Prazo hoje às %s: %s.', x->>'hora', x->>'titulo');
      refs := refs || (x->>'ref');
      titulo := coalesce(titulo, 'Prazo hoje às ' || (x->>'hora')); if link = '/app' then link := '/app/prazos'; end if;
    end loop;
  end if;
  n := coalesce((a->'oportunidades'->>'quantidade')::integer, 0);
  if cfg.oportunidades and n > 0 then
    d := a->'oportunidades'->'destaques'->0;
    linhas := linhas || format('%s %s no Radar para %s.%s', n, case when n = 1 then 'oportunidade nova' else 'oportunidades novas' end, empresa,
      case when d is null then '' else format(' Destaque: %s%s%s.', d->>'objeto', coalesce(' (' || nullif(d->>'uf', '') || ')', ''),
        coalesce(', até ' || nullif(d->>'encerramento', ''), '')) end);
    titulo := coalesce(titulo, format('%s %s para %s', n, case when n = 1 then 'oportunidade nova' else 'oportunidades novas' end, empresa));
    if link = '/app' then link := '/app/radar'; end if;
    refs := refs || array(select jsonb_array_elements_text(a->'oportunidades'->'refs'));
  end if;
  if cfg.documentos and not coalesce((a->'documentos'->>'ja_avisado_hoje')::boolean, false) then
    n := coalesce((a->'documentos'->>'vencendo')::integer, 0);
    if n > 0 then
      linhas := linhas || format('%s %s em até 15 dias: %s.', n, case when n = 1 then 'documento vence' else 'documentos vencem' end,
        (select string_agg(v, ', ') from jsonb_array_elements_text(a->'documentos'->'lista') v));
    end if;
    if coalesce((a->'documentos'->>'vencidos')::integer, 0) > 0 then
      linhas := linhas || format('%s %s vencido(s) no último mês. Renove para não ser inabilitado.', a->'documentos'->>'vencidos',
        case when (a->'documentos'->>'vencidos')::integer = 1 then 'documento' else 'documentos' end);
    end if;
    if n > 0 or coalesce((a->'documentos'->>'vencidos')::integer, 0) > 0 then
      refs := refs || ('doc:' || to_char(p_hoje, 'YYYY-MM-DD'));
      titulo := coalesce(titulo, 'Documentos vencendo'); if link = '/app' then link := '/app/documentos'; end if;
    end if;
  end if;
  -- Dica só quando não há outra novidade e o cliente ainda não recebeu nada hoje, conforme o que ele ainda não usa.
  if cardinality(linhas) = 0 and cfg.dicas and not p_dica_hoje then
    dicas := array[
      array[(not (a->'configuracao'->>'tem_empresa')::boolean)::text, 'Cadastre sua empresa com o CNPJ: o Radar e a Sentinela passam a trabalhar para você.', '/app/empresas'],
      array[(not (a->'configuracao'->>'tem_radar')::boolean)::text, 'Configure as palavras-chave do Radar e receba as oportunidades do seu ramo todos os dias.', '/app/agentes'],
      array[((a->'configuracao'->>'documentos')::integer = 0)::text, 'Guarde suas certidões em Documentos: o LicitaForce avisa antes de cada uma vencer.', '/app/documentos'],
      array[((a->'configuracao'->>'processos_ativos')::integer = 0)::text, 'Adicione ao Kanban os editais em que vai participar e acompanhe prazos e disputas num lugar só.', '/app/processos'],
      array[(not (a->'configuracao'->>'alguem_com_push')::boolean)::text, 'Ative as notificações no celular para saber das disputas e oportunidades na hora.', '/app/avisos'],
      array['true', 'Antes de dar o lance, consulte o histórico de preços do item: você vê quanto o órgão já pagou.', '/app/precos'],
      array['true', 'Use o Cotador para montar a cotação dos itens do edital a partir de compras parecidas.', '/app/cotador']
    ];
    -- Rotação: entre as dicas aplicáveis, a do dia.
    select w.tx, w.lk into dica, link from (
      select dicas[i][2] as tx, dicas[i][3] as lk, row_number() over (order by i) - 1 as pos, count(*) over () as total
      from generate_subscripts(dicas, 1) i where dicas[i][1] = 'true') w
    where w.pos = (p_hoje - date '2026-01-01') % w.total;
    if dica is null then return null; end if;
    return jsonb_build_object('titulo', 'Dica do LicitaForce', 'texto', dica, 'link', link,
      'refs', array['dica:' || to_char(p_hoje, 'YYYY-MM-DD')]);
  end if;
  if cardinality(linhas) = 0 then return null; end if;
  if cardinality(linhas) > 1 then titulo := format('%s novidades para %s', cardinality(linhas), empresa); end if;
  return jsonb_build_object('titulo', left(titulo, 120), 'texto', array_to_string(linhas, E'\n'), 'link', link, 'refs', refs);
end $$;

-- =========================================================
-- 4. Rotina automática (pg_cron, 1x por hora)
-- =========================================================
create function licitaflow_lembretes.preparar_ia(p_agora timestamptz default now(), p_forcar boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare cfg public.mensagens_ia_config; c licitaflow_lembretes.config; local timestamp := p_agora at time zone 'America/Sao_Paulo';
  h integer := extract(hour from local); dow integer := extract(dow from local); hoje date := local::date;
  inicio_dia timestamptz := (local::date)::timestamp at time zone 'America/Sao_Paulo'; hora timestamptz := date_trunc('hour', p_agora);
  o record; refs_hoje text[]; ja_hoje boolean; m jsonb; total integer := 0; k integer;
begin
  select * into cfg from public.mensagens_ia_config where id;
  if not found or not cfg.ativo or not (dow = any(cfg.dias)) then return 0; end if;
  select * into c from licitaflow_lembretes.config where id for update;
  if not p_forcar and c.ia_hora is not distinct from hora then return 0; end if;
  update licitaflow_lembretes.config set ia_hora = hora where id;
  for o in
    select org.id from public.organizations org
    left join public.mensagens_ia_clientes x on x.org_id = org.id
    where not org.suspensa and org.plano <> 'cancelado' and not coalesce(x.fora, false)
      and h = any(coalesce(x.horarios, cfg.horarios))
    order by org.id
  loop
    -- Itens já mencionados nas últimas 24 h (oportunidades, disputas, prazos, documentos e dica do dia) não se repetem.
    -- Disputas, prazos, documentos e dica têm a data no próprio item, então valem só para o dia.
    select coalesce(array_agg(distinct r) filter (where r is not null), '{}'),
      coalesce(bool_or(e.created_at >= inicio_dia), false) into refs_hoje, ja_hoje
    from public.notificacoes_envios e left join lateral unnest(e.refs) r on true
    where e.org_id = o.id and e.origem = 'ia' and e.created_at > least(inicio_dia, p_agora - interval '1 day') and 'auto' = any(e.chaves);
    m := licitaflow_lembretes.texto_ia(licitaflow_lembretes.analise_ia(o.id, p_agora, p_agora - interval '1 day', refs_hoje),
      cfg, ja_hoje, hoje);
    if m is null then continue; end if;
    -- Marca o envio do dia mesmo para quem não tem push (o sino sempre recebe).
    k := licitaflow_lembretes.entregar_org(o.id, m->>'titulo', m->>'texto', m->>'link',
      array(select jsonb_array_elements_text(m->'refs')), 'auto', cfg.reserva);
    if k = 0 then
      -- Ninguém com push: guarda um registro do dia para não repetir os mesmos itens no próximo horário.
      insert into public.notificacoes_envios(user_id, org_id, origem, chaves, refs, titulo, texto, link, canal, status, detalhe, enviado_em)
      select m2.user_id, o.id, 'ia', array['auto'], array(select jsonb_array_elements_text(m->'refs')), left(m->>'titulo', 120), left(m->>'texto', 1000),
        m->>'link', 'push', 'sem_contato', 'só no sino: nenhum aparelho com push', null
      from public.memberships m2 where m2.org_id = o.id and m2.papel <> 'leitor' order by m2.created_at limit 1;
    end if;
    total := total + 1;
  end loop;
  return total;
end $$;
revoke execute on function licitaflow_lembretes.preparar_ia(timestamptz, boolean), licitaflow_lembretes.texto_ia(jsonb, public.mensagens_ia_config, boolean, date),
  licitaflow_lembretes.analise_ia(uuid, timestamptz, timestamptz, text[]), licitaflow_lembretes.entregar_org(uuid, text, text, text, text[], text, boolean),
  licitaflow_lembretes.lembrete_no_sino() from public, anon, authenticated;

-- =========================================================
-- 5. Painel master
-- =========================================================
-- Prévia do que a rotina diria agora para um cliente (sem marcar nada como enviado).
create function public.admin_mensagens_ia_previa(p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg public.mensagens_ia_config; a jsonb;
begin
  perform public.exigir_admin();
  select * into cfg from public.mensagens_ia_config where id;
  a := licitaflow_lembretes.analise_ia(p_org, now(), now() - interval '1 day', '{}');
  return jsonb_build_object('analise', a, 'mensagem', licitaflow_lembretes.texto_ia(a, cfg, false, (now() at time zone 'America/Sao_Paulo')::date));
end $$;

-- Análises de vários clientes de uma vez, para a IA redigir na hora (até 40 por pedido; null = todos os ativos).
create function public.admin_mensagens_ia_analises(p_orgs uuid[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('org_id', o.id, 'nome', o.nome,
      'analise', licitaflow_lembretes.analise_ia(o.id, now(), now() - interval '3 days', '{}')) order by o.nome)
    from (select org.id, org.nome from public.organizations org
      where not org.suspensa and org.plano <> 'cancelado' and (p_orgs is null or org.id = any(p_orgs))
      order by org.nome limit 40) o), '[]'::jsonb);
end $$;

-- Envia mensagens avulsas (redigidas pela IA ou pelo master) a organizações escolhidas.
-- p_itens: [{org_id, titulo, texto, link?}]. Quem não tem push recebe pelo canal de reserva.
create function public.admin_mensagens_ia_enviar(p_itens jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare x jsonb; total integer := 0; link text;
begin
  perform public.exigir_admin();
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 200 then raise exception 'Lista de mensagens inválida'; end if;
  for x in select * from jsonb_array_elements(p_itens) loop
    if length(trim(coalesce(x->>'titulo', ''))) < 3 or length(trim(coalesce(x->>'texto', ''))) < 3 then raise exception 'Mensagem sem título ou texto'; end if;
    link := coalesce(nullif(x->>'link', ''), '/app');
    if link !~ '^/app(/[a-z0-9/_-]*)?$' then link := '/app'; end if;
    total := total + licitaflow_lembretes.entregar_org((x->>'org_id')::uuid, trim(x->>'titulo'), trim(x->>'texto'), link, '{}', 'manual', true);
  end loop;
  return total;
end $$;

-- Roda a rotina agora (botão do master), ignorando a trava da hora; respeita dias, horários e exceções.
create function public.admin_mensagens_ia_executar() returns integer
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return licitaflow_lembretes.preparar_ia(now(), true);
end $$;

revoke execute on function public.admin_mensagens_ia_previa(uuid), public.admin_mensagens_ia_analises(uuid[]),
  public.admin_mensagens_ia_enviar(jsonb), public.admin_mensagens_ia_executar() from public, anon;
grant execute on function public.admin_mensagens_ia_previa(uuid), public.admin_mensagens_ia_analises(uuid[]),
  public.admin_mensagens_ia_enviar(jsonb), public.admin_mensagens_ia_executar() to authenticated;

-- =========================================================
-- 6. Agendador: minuto 7 de cada hora, com teto de 30 s e trava própria
-- =========================================================
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'licitaflow-mensagens-ia';
    perform cron.schedule('licitaflow-mensagens-ia', '7 * * * *',
      $c$set statement_timeout = '30s'; set lock_timeout = '5s'; select licitaflow_lembretes.preparar_ia() from (select pg_try_advisory_xact_lock(73481060) livre) t where t.livre$c$);
  end if;
end $$;

COMMIT;
