-- Rastreio de engajamento por aparelho (app instalado, permissão de notificações, push ativo),
-- lembretes automáticos de pendências e canal de reserva (e-mail/WhatsApp) para quem não recebe push.
-- O banco decide quem recebe o quê; a Vercel (api/push, ação "lembretes") só entrega o que foi reservado.
BEGIN;

-- =========================================================
-- 1. Rastreio por aparelho
-- =========================================================
create table public.usuario_aparelhos (
  user_id uuid not null references auth.users(id) on delete cascade,
  aparelho text not null check (aparelho ~ '^[A-Za-z0-9-]{8,64}$'),
  plataforma text not null default '' check (length(plataforma) <= 60),
  instalado boolean not null default false,
  instalado_em timestamptz,
  permissao text not null default 'default' check (permissao in ('default','granted','denied','sem-suporte')),
  push_ativo boolean not null default false,
  primeiro_acesso_em timestamptz not null default now(),
  ultimo_acesso_em timestamptz not null default now(),
  primary key (user_id, aparelho)
);
create index usuario_aparelhos_acesso on public.usuario_aparelhos(ultimo_acesso_em desc);
alter table public.usuario_aparelhos enable row level security;
create policy usuario_aparelhos_ler on public.usuario_aparelhos for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));
grant select on public.usuario_aparelhos to authenticated;

create table public.engajamento_eventos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  aparelho text,
  plataforma text not null default '',
  evento text not null check (evento in ('primeiro_acesso','app_instalado','push_permitido','push_negado','push_permissao_removida','push_ativado','push_desativado')),
  created_at timestamptz not null default now()
);
create index engajamento_eventos_data on public.engajamento_eventos(created_at desc);
create index engajamento_eventos_usuario on public.engajamento_eventos(user_id, created_at desc);
alter table public.engajamento_eventos enable row level security;
create policy engajamento_eventos_master on public.engajamento_eventos for select to authenticated using ((select public.is_platform_admin()));
grant select on public.engajamento_eventos to authenticated;

-- O próprio app informa o estado do aparelho; eventos só nascem quando algo muda.
create function public.registrar_aparelho(p_aparelho text, p_instalado boolean, p_permissao text, p_push boolean, p_plataforma text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); a public.usuario_aparelhos; perm text; plat text := left(coalesce(p_plataforma, ''), 60);
begin
  if uid is null then raise exception 'Entre na sua conta'; end if;
  if p_aparelho is null or p_aparelho !~ '^[A-Za-z0-9-]{8,64}$' then raise exception 'Aparelho inválido'; end if;
  perm := case when p_permissao in ('default','granted','denied','sem-suporte') then p_permissao else 'default' end;
  select * into a from public.usuario_aparelhos where user_id = uid and aparelho = p_aparelho for update;
  if not found then
    insert into public.usuario_aparelhos(user_id, aparelho, plataforma, instalado, instalado_em, permissao, push_ativo)
      values (uid, p_aparelho, plat, coalesce(p_instalado, false), case when p_instalado then now() end, perm, coalesce(p_push, false));
    if not exists (select 1 from public.engajamento_eventos where user_id = uid) then
      insert into public.engajamento_eventos(user_id, aparelho, plataforma, evento) values (uid, p_aparelho, plat, 'primeiro_acesso');
    end if;
    if p_instalado then insert into public.engajamento_eventos(user_id, aparelho, plataforma, evento) values (uid, p_aparelho, plat, 'app_instalado'); end if;
    if perm = 'granted' then insert into public.engajamento_eventos(user_id, aparelho, plataforma, evento) values (uid, p_aparelho, plat, 'push_permitido');
    elsif perm = 'denied' then insert into public.engajamento_eventos(user_id, aparelho, plataforma, evento) values (uid, p_aparelho, plat, 'push_negado'); end if;
    if p_push then insert into public.engajamento_eventos(user_id, aparelho, plataforma, evento) values (uid, p_aparelho, plat, 'push_ativado'); end if;
    return;
  end if;
  -- Navegador comum não sabe dizer se o app foi desinstalado: "instalado" só passa de falso para verdadeiro.
  if coalesce(p_instalado, false) and not a.instalado then
    insert into public.engajamento_eventos(user_id, aparelho, plataforma, evento) values (uid, p_aparelho, plat, 'app_instalado');
  end if;
  if perm <> a.permissao and perm <> 'sem-suporte' then
    insert into public.engajamento_eventos(user_id, aparelho, plataforma, evento) values (uid, p_aparelho, plat,
      case perm when 'granted' then 'push_permitido' when 'denied' then 'push_negado' else 'push_permissao_removida' end);
  end if;
  if coalesce(p_push, false) <> a.push_ativo then
    insert into public.engajamento_eventos(user_id, aparelho, plataforma, evento) values (uid, p_aparelho, plat, case when p_push then 'push_ativado' else 'push_desativado' end);
  end if;
  update public.usuario_aparelhos set plataforma = plat, instalado = a.instalado or coalesce(p_instalado, false),
    instalado_em = coalesce(a.instalado_em, case when p_instalado then now() end), permissao = perm,
    push_ativo = coalesce(p_push, false), ultimo_acesso_em = now()
    where user_id = uid and aparelho = p_aparelho;
end $$;
revoke execute on function public.registrar_aparelho(text, boolean, text, boolean, text) from public, anon;
grant execute on function public.registrar_aparelho(text, boolean, text, boolean, text) to authenticated;

-- =========================================================
-- 2. Preferências do usuário (mesma tabela das IAs)
-- =========================================================
-- A tabela nasce em 20261125000010_push_agentes.sql (aplicada na produção antes desta).
do $$ begin
  if to_regclass('public.push_agentes_preferencias') is not null then
    alter table public.push_agentes_preferencias
      add column if not exists lembretes boolean not null default true,
      add column if not exists canal_reserva boolean not null default true;
  end if;
end $$;

-- =========================================================
-- 3. Configuração do master: canal de reserva, horário e WhatsApp
-- =========================================================
create table public.notificacoes_config (
  id boolean primary key default true check (id),
  ativo boolean not null default true,
  canal_reserva text not null default 'email' check (canal_reserva in ('email','whatsapp','email_whatsapp')),
  hora smallint not null default 9 check (hora between 7 and 21),
  whatsapp_ativo boolean not null default false,
  whatsapp_phone_id text check (whatsapp_phone_id is null or whatsapp_phone_id ~ '^[0-9]{5,30}$'),
  whatsapp_token_cifrado text,
  whatsapp_template text not null default 'aviso_licitaforce' check (whatsapp_template ~ '^[a-z0-9_]{1,250}$'),
  whatsapp_idioma text not null default 'pt_BR' check (whatsapp_idioma ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  whatsapp_testado_em timestamptz,
  updated_at timestamptz not null default now(),
  check (not whatsapp_ativo or (whatsapp_phone_id is not null and whatsapp_token_cifrado is not null))
);
insert into public.notificacoes_config default values;
alter table public.notificacoes_config enable row level security;
create policy notificacoes_config_ler on public.notificacoes_config for select to authenticated using ((select public.is_platform_admin()));
create policy notificacoes_config_editar on public.notificacoes_config for update to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
-- O token do WhatsApp nunca sai do servidor: o master não lê nem grava essa coluna pelo navegador.
revoke all on public.notificacoes_config from authenticated, anon;
grant select (id, ativo, canal_reserva, hora, whatsapp_ativo, whatsapp_phone_id, whatsapp_template, whatsapp_idioma, whatsapp_testado_em, updated_at)
  on public.notificacoes_config to authenticated;
grant update (ativo, canal_reserva, hora, whatsapp_ativo, updated_at) on public.notificacoes_config to authenticated;
grant select, update on public.notificacoes_config to service_role;
create trigger notificacoes_config_atualizado before update on public.notificacoes_config for each row execute function public.set_updated_at();

-- =========================================================
-- 4. Regras de lembrete (textos e frequência editáveis no master)
-- =========================================================
create table public.lembretes_regras (
  chave text primary key check (chave in ('push_permitir','app_instalar','telefone_cadastrar','empresa_cadastrar','radar_configurar','documento_vencendo','prazo_proximo','tarefa_atrasada')),
  ativo boolean not null default true,
  titulo text not null check (length(trim(titulo)) between 3 and 80),
  texto text not null check (length(trim(texto)) between 3 and 400),
  intervalo_dias integer not null default 3 check (intervalo_dias between 1 and 60),
  antecedencia_dias integer not null default 0 check (antecedencia_dias between 0 and 60),
  ordem smallint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.lembretes_regras(chave, titulo, texto, intervalo_dias, antecedencia_dias, ordem) values
  ('prazo_proximo', 'Prazo chegando', '{nome}, prazo nas próximas horas: {itens}.', 1, 1, 1),
  ('documento_vencendo', 'Documentos vencendo', '{qtd} documento(s) de {empresa} vencem em até {dias} dias: {itens}. Renove para não ficar inabilitado.', 3, 7, 2),
  ('tarefa_atrasada', 'Tarefas atrasadas', '{nome}, você tem {qtd} tarefa(s) atrasada(s): {itens}.', 2, 0, 3),
  ('empresa_cadastrar', 'Cadastre sua empresa', '{nome}, cadastre o CNPJ da sua empresa para o Radar começar a buscar licitações para você.', 3, 0, 4),
  ('radar_configurar', 'Configure o Radar', '{nome}, informe as palavras-chave de {empresa} para o Radar encontrar licitações do seu ramo todos os dias.', 5, 0, 5),
  ('push_permitir', 'Ative as notificações', '{nome}, ative as notificações do LicitaForce no celular para receber prazos, oportunidades e avisos na hora.', 7, 0, 6),
  ('app_instalar', 'Instale o app LicitaForce', '{nome}, instale o LicitaForce na tela inicial do celular: abre mais rápido e recebe os alertas mesmo fechado.', 14, 0, 7),
  ('telefone_cadastrar', 'Cadastre seu celular', '{nome}, cadastre seu celular no perfil para receber alertas urgentes de prazos e disputas.', 14, 0, 8);
alter table public.lembretes_regras enable row level security;
create policy lembretes_regras_ler on public.lembretes_regras for select to authenticated using ((select public.is_platform_admin()));
create policy lembretes_regras_editar on public.lembretes_regras for update to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
revoke all on public.lembretes_regras from authenticated, anon;
grant select on public.lembretes_regras to authenticated;
grant update (ativo, titulo, texto, intervalo_dias, antecedencia_dias, updated_at) on public.lembretes_regras to authenticated;
create trigger lembretes_regras_atualizado before update on public.lembretes_regras for each row execute function public.set_updated_at();

-- =========================================================
-- 5. Fila de envio (e histórico) de lembretes e avisos pelo canal de reserva
-- =========================================================
create table public.notificacoes_envios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  origem text not null check (origem in ('lembrete','aviso')),
  chaves text[] not null default '{}',
  refs text[] not null default '{}',
  aviso_id uuid references public.plataforma_avisos(id) on delete set null,
  titulo text not null,
  texto text not null,
  link text not null default '/app',
  canal text not null check (canal in ('push','email','whatsapp','email_whatsapp')),
  status text not null default 'pendente' check (status in ('pendente','enviado','parcial','falhou','sem_contato')),
  detalhe text,
  tentativas integer not null default 0,
  proxima_em timestamptz not null default now(),
  reserva uuid,
  created_at timestamptz not null default now(),
  enviado_em timestamptz
);
create index notificacoes_envios_pendentes on public.notificacoes_envios(proxima_em) where status = 'pendente';
create index notificacoes_envios_usuario on public.notificacoes_envios(user_id, created_at desc);
create index notificacoes_envios_data on public.notificacoes_envios(created_at desc);
create index notificacoes_envios_aviso on public.notificacoes_envios(aviso_id);
alter table public.notificacoes_envios enable row level security;
create policy notificacoes_envios_master on public.notificacoes_envios for select to authenticated using ((select public.is_platform_admin()));
revoke all on public.notificacoes_envios from authenticated, anon;
grant select on public.notificacoes_envios to authenticated;

-- Avisos do master: quem não tem push recebe pelo canal de reserva.
alter table public.plataforma_avisos
  add column if not exists canal_reserva boolean not null default false,
  add column if not exists reserva_enfileirada_em timestamptz;

create function public.admin_aviso_reserva(p_aviso uuid, p_reserva boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  update public.plataforma_avisos set canal_reserva = coalesce(p_reserva, false) where id = p_aviso and reserva_enfileirada_em is null;
end $$;
revoke execute on function public.admin_aviso_reserva(uuid, boolean) from public, anon;
grant execute on function public.admin_aviso_reserva(uuid, boolean) to authenticated;

-- =========================================================
-- 6. Preparação (no banco) e agendador
-- =========================================================
create schema licitaflow_lembretes;
revoke all on schema licitaflow_lembretes from public, anon, authenticated;
create table licitaflow_lembretes.config (
  id boolean primary key default true check (id),
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  url text not null default 'https://licitaforce-app.vercel.app/api/push',
  preparado_hora timestamptz
);
insert into licitaflow_lembretes.config default values;
alter table licitaflow_lembretes.config enable row level security;

create function licitaflow_lembretes.texto(modelo text, nome text, empresa text, qtd bigint, itens text, dias integer)
returns text language sql immutable set search_path = '' as $$
  select left(replace(replace(replace(replace(replace(modelo,
    '{nome}', coalesce(nullif(split_part(trim(coalesce(nome, '')), ' ', 1), ''), 'Olá')),
    '{empresa}', coalesce(nullif(trim(empresa), ''), 'sua empresa')),
    '{qtd}', coalesce(qtd, 0)::text),
    '{itens}', coalesce(itens, '')),
    '{dias}', coalesce(dias, 0)::text), 900)
$$;

-- Monta os lembretes devidos. Diários saem na hora escolhida pelo master; prazos são conferidos a cada hora (7h–21h).
create function licitaflow_lembretes.preparar(p_forcar boolean default false, p_agora timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare cfg public.notificacoes_config; h integer := extract(hour from p_agora at time zone 'America/Sao_Paulo'); diario boolean; n integer;
begin
  select * into cfg from public.notificacoes_config where id;
  if not p_forcar and (not cfg.ativo or h < 7 or h > 21) then return 0; end if;
  diario := p_forcar or h = cfg.hora;
  with regras as (select * from public.lembretes_regras where ativo),
  membros as (
    select m.user_id, m.org_id, m.papel, o.nome as org_nome, p.nome, p.telefone
    from public.memberships m
    join public.organizations o on o.id = m.org_id and not o.suspensa and o.plano <> 'cancelado'
    join public.profiles p on p.id = m.user_id
    left join public.push_agentes_preferencias pr on pr.user_id = m.user_id
    where m.papel <> 'leitor' and coalesce(pr.lembretes, true)
  ),
  itens as (
    -- Itens por pessoa (valem para todas as organizações dela): um só por usuário.
    (select distinct on (mb.user_id) mb.user_id, mb.org_id, 'push_permitir'::text as chave, null::text as ref, '/app/avisos'::text as link, mb.nome, mb.org_nome as empresa, null::bigint as qtd, null::text as lista, null::integer as dias
      from membros mb where diario and not exists (select 1 from public.push_inscricoes s where s.user_id = mb.user_id) order by mb.user_id, mb.org_id)
    union all
    (select distinct on (mb.user_id) mb.user_id, mb.org_id, 'app_instalar', null, '/app', mb.nome, mb.org_nome, null, null, null
      from membros mb where diario and not exists (select 1 from public.usuario_aparelhos a where a.user_id = mb.user_id and a.instalado) order by mb.user_id, mb.org_id)
    union all
    (select distinct on (mb.user_id) mb.user_id, mb.org_id, 'telefone_cadastrar', null, '/app/configuracoes', mb.nome, mb.org_nome, null, null, null
      from membros mb where diario and length(regexp_replace(coalesce(mb.telefone, ''), '\D', '', 'g')) < 10 order by mb.user_id, mb.org_id)
    union all
    select mb.user_id, mb.org_id, 'empresa_cadastrar', null, '/app/empresas', mb.nome, mb.org_nome, null, null, null
      from membros mb where diario and mb.papel in ('owner','admin') and not exists (select 1 from public.empresas e where e.org_id = mb.org_id)
    union all
    select mb.user_id, mb.org_id, 'radar_configurar', null, '/app/agentes', mb.nome,
        (select coalesce(e.nome_fantasia, e.razao_social) from public.empresas e where e.org_id = mb.org_id and e.ativa order by e.created_at limit 1), null, null, null
      from membros mb where diario and mb.papel in ('owner','admin')
        and exists (select 1 from public.empresas e where e.org_id = mb.org_id and e.ativa)
        and not exists (select 1 from public.empresas e where e.org_id = mb.org_id and cardinality(e.palavras_chave) > 0)
        and not exists (select 1 from public.radar_filtros f where f.org_id = mb.org_id and f.ativo and cardinality(f.palavras_chave) > 0)
    union all
    select mb.user_id, mb.org_id, 'documento_vencendo', null, '/app/documentos', mb.nome, mb.org_nome, d.qtd, d.lista, r.antecedencia_dias
      from membros mb join regras r on r.chave = 'documento_vencendo'
      cross join lateral (
        select count(*) as qtd, string_agg(x.nome || ' (' || to_char(x.validade, 'DD/MM') || ')', ', ' order by x.validade) filter (where x.rn <= 3) as lista
        from (select doc.nome, doc.validade, row_number() over (order by doc.validade) as rn from public.documentos doc
          where doc.org_id = mb.org_id and doc.validade between (p_agora at time zone 'America/Sao_Paulo')::date
            and (p_agora at time zone 'America/Sao_Paulo')::date + r.antecedencia_dias
            and doc.categoria in ('certidao','habilitacao_juridica','qualificacao_tecnica','qualificacao_economica','declaracao')) x
      ) d
      where diario and mb.papel in ('owner','admin','membro') and d.qtd > 0
    union all
    select mb.user_id, mb.org_id, 'prazo_proximo', pz.id::text, '/app/prazos', mb.nome, mb.org_nome, 1,
        pz.titulo || ' (' || to_char(pz.data_hora at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || ')', r.antecedencia_dias
      from public.prazos pz join regras r on r.chave = 'prazo_proximo'
      join membros mb on mb.org_id = pz.org_id and (pz.responsavel_id = mb.user_id or (pz.responsavel_id is null and mb.papel in ('owner','admin','membro')))
      where not pz.concluido and pz.data_hora > p_agora and pz.data_hora <= p_agora + make_interval(days => greatest(r.antecedencia_dias, 1))
    union all
    select mb.user_id, mb.org_id, 'tarefa_atrasada', null, '/app/processos', mb.nome, mb.org_nome, t.qtd, t.lista, null
      from membros mb cross join lateral (
        select count(*) as qtd, string_agg(x.titulo, ', ' order by x.vencimento) filter (where x.rn <= 3) as lista
        from (select tf.titulo, tf.vencimento, row_number() over (order by tf.vencimento) as rn from public.tarefas tf
          where tf.org_id = mb.org_id and tf.status <> 'concluida' and tf.vencimento < p_agora
            and (tf.responsavel_id = mb.user_id or (tf.responsavel_id is null and tf.created_by = mb.user_id))) x
      ) t
      where diario and t.qtd > 0
  ),
  devidos as (
    select i.*, r.titulo, r.ordem, licitaflow_lembretes.texto(r.texto, i.nome, i.empresa, i.qtd, i.lista, i.dias) as frase
    from itens i join regras r on r.chave = i.chave
    where not exists (select 1 from public.notificacoes_envios e where e.user_id = i.user_id and e.origem = 'lembrete'
      and i.chave = any(e.chaves) and (i.ref is null or i.ref = any(e.refs))
      and e.created_at > p_agora - make_interval(days => r.intervalo_dias) + interval '30 minutes')
  ),
  por_usuario as (
    select d.user_id, (array_agg(d.org_id order by d.ordem))[1] as org_id, array_agg(distinct d.chave) as chaves,
      coalesce(array_agg(d.ref) filter (where d.ref is not null), '{}') as refs, count(*) as total,
      (array_agg(d.titulo order by d.ordem))[1] as titulo1, (array_agg(d.frase order by d.ordem))[1] as frase1,
      string_agg('• ' || d.frase, E'\n' order by d.ordem) as frases, (array_agg(d.link order by d.ordem))[1] as link
    from devidos d group by d.user_id
  )
  insert into public.notificacoes_envios(user_id, org_id, origem, chaves, refs, titulo, texto, link, canal)
  select u.user_id, u.org_id, 'lembrete', u.chaves, u.refs,
    case when u.total = 1 then u.titulo1 else 'Você tem ' || u.total || ' pendências no LicitaForce' end,
    case when u.total = 1 then u.frase1 else u.frases end, u.link,
    case when exists (select 1 from public.push_inscricoes s where s.user_id = u.user_id) then 'push' else cfg.canal_reserva end
  from por_usuario u;
  get diagnostics n = row_count;
  return n;
end $$;

-- Avisos do master com canal de reserva: entra na fila de quem não tem nenhum aparelho com push.
create function licitaflow_lembretes.enfileirar_avisos() returns integer
language plpgsql security definer set search_path = '' as $$
declare cfg public.notificacoes_config; a record; n integer := 0; k integer;
begin
  select * into cfg from public.notificacoes_config where id;
  for a in select id, titulo, texto, org_id, org_ids from public.plataforma_avisos
    where canal_reserva and ativo and reserva_enfileirada_em is null and publicar_em <= now() and publicar_em > now() - interval '2 days'
      and (expira_em is null or expira_em > now())
    order by publicar_em limit 5 for update skip locked loop
    insert into public.notificacoes_envios(user_id, org_id, origem, aviso_id, titulo, texto, link, canal)
      select distinct on (m.user_id) m.user_id, m.org_id, 'aviso', a.id, a.titulo, left(a.texto, 1000), '/app/avisos', cfg.canal_reserva
      from public.memberships m join public.organizations o on o.id = m.org_id and not o.suspensa
      left join public.push_agentes_preferencias pr on pr.user_id = m.user_id
      where coalesce(pr.canal_reserva, true)
        and (coalesce(cardinality(a.org_ids), 0) = 0 or m.org_id = any(a.org_ids))
        and (a.org_id is null or m.org_id = a.org_id)
        and not exists (select 1 from public.push_inscricoes s where s.user_id = m.user_id)
      order by m.user_id, m.org_id;
    get diagnostics k = row_count;
    n := n + k;
    update public.plataforma_avisos set reserva_enfileirada_em = now() where id = a.id;
  end loop;
  return n;
end $$;

create function licitaflow_lembretes.disparar() returns void
language plpgsql security definer set search_path = '' as $$
declare c licitaflow_lembretes.config; hora timestamptz := date_trunc('hour', now());
begin
  select * into c from licitaflow_lembretes.config where id for update;
  perform licitaflow_lembretes.enfileirar_avisos();
  if c.preparado_hora is distinct from hora then
    perform licitaflow_lembretes.preparar();
    update licitaflow_lembretes.config set preparado_hora = hora where id;
  end if;
  delete from public.notificacoes_envios where created_at < now() - interval '180 days';
  if to_regnamespace('net') is not null and exists (select 1 from public.notificacoes_envios where status = 'pendente' and proxima_em <= now()) then
    perform net.http_post(url := c.url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-coleta', c.token),
      body := '{"acao":"lembretes"}'::jsonb, timeout_milliseconds := 60000);
  end if;
end $$;
revoke execute on function licitaflow_lembretes.preparar(boolean, timestamptz), licitaflow_lembretes.enfileirar_avisos(), licitaflow_lembretes.disparar(),
  licitaflow_lembretes.texto(text, text, text, bigint, text, integer) from public, anon, authenticated;

-- =========================================================
-- 7. Entrega (Vercel, com o token privado do agendador)
-- =========================================================
create function public.lembretes_autorizar(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or not exists (select 1 from licitaflow_lembretes.config where id and token = p_token)
    then raise exception 'Token inválido' using errcode = '28000'; end if;
end $$;

create function public.notificacoes_lote(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare resultado jsonb;
begin
  perform public.lembretes_autorizar(p_token);
  with candidatos as (
    select e.id from public.notificacoes_envios e
    where e.status = 'pendente' and e.proxima_em <= now()
    order by e.proxima_em, e.id limit 30 for update of e skip locked
  ), reservados as (
    update public.notificacoes_envios e set reserva = gen_random_uuid(), proxima_em = now() + interval '10 minutes', tentativas = e.tentativas + 1
    from candidatos c where e.id = c.id returning e.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reserva', r.reserva, 'canal', r.canal, 'titulo', r.titulo, 'texto', r.texto,
      'link', r.link, 'tentativas', r.tentativas, 'nome', p.nome, 'email', coalesce(nullif(p.email, ''), u.email), 'telefone', p.telefone,
      'inscricoes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
        from public.push_inscricoes s where s.user_id = r.user_id), '[]'::jsonb))), '[]'::jsonb)
    into resultado from reservados r join auth.users u on u.id = r.user_id left join public.profiles p on p.id = r.user_id;
  return resultado;
end $$;

-- p_status: enviado | parcial | falhou | sem_contato | tentar (falha temporária: volta para a fila até 3 tentativas)
create function public.notificacoes_concluir(p_token text, p_id uuid, p_reserva uuid, p_status text, p_detalhe text default null, p_mortas uuid[] default null)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.notificacoes_envios;
begin
  perform public.lembretes_autorizar(p_token);
  select * into e from public.notificacoes_envios where id = p_id and reserva = p_reserva and status = 'pendente' for update;
  if not found then return; end if;
  if p_mortas is not null then delete from public.push_inscricoes where user_id = e.user_id and id = any(p_mortas); end if;
  if p_status = 'tentar' and e.tentativas < 3 then
    update public.notificacoes_envios set reserva = null, detalhe = left(p_detalhe, 300), proxima_em = now() + interval '15 minutes' * e.tentativas where id = p_id;
  else
    update public.notificacoes_envios set reserva = null, detalhe = left(p_detalhe, 300),
      status = case when p_status in ('enviado','parcial','sem_contato') then p_status else 'falhou' end,
      enviado_em = case when p_status in ('enviado','parcial') then now() end
      where id = p_id;
  end if;
end $$;

-- Teste do WhatsApp pelo master marca a data do teste.
revoke execute on function public.lembretes_autorizar(text), public.notificacoes_lote(text), public.notificacoes_concluir(text, uuid, uuid, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.lembretes_autorizar(text), public.notificacoes_lote(text), public.notificacoes_concluir(text, uuid, uuid, text, text, uuid[]) to service_role;

-- =========================================================
-- 8. Painel master
-- =========================================================
create function public.admin_engajamento_usuarios() returns table (
  user_id uuid, nome text, email text, telefone boolean, organizacoes text, aparelhos integer, instalado boolean, instalado_em timestamptz,
  permissao text, push_ativo boolean, ultimo_acesso_em timestamptz, ultimo_envio_em timestamptz, ultimo_envio_canal text, ultimo_envio_status text,
  lembretes boolean, canal_reserva boolean, criado_em timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return query
  select u.id, p.nome, coalesce(nullif(p.email, ''), u.email)::text, length(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')) >= 10,
    (select string_agg(o.nome, ', ' order by o.nome) from public.memberships m join public.organizations o on o.id = m.org_id where m.user_id = u.id),
    (select count(*)::integer from public.usuario_aparelhos a where a.user_id = u.id),
    exists (select 1 from public.usuario_aparelhos a where a.user_id = u.id and a.instalado),
    (select min(a.instalado_em) from public.usuario_aparelhos a where a.user_id = u.id),
    case when exists (select 1 from public.usuario_aparelhos a where a.user_id = u.id and a.permissao = 'granted') then 'permitiu'
      when exists (select 1 from public.usuario_aparelhos a where a.user_id = u.id and a.permissao = 'denied') then 'negou'
      when exists (select 1 from public.usuario_aparelhos a where a.user_id = u.id) then 'nao_respondeu' else 'sem_registro' end,
    exists (select 1 from public.push_inscricoes s where s.user_id = u.id),
    greatest(u.last_sign_in_at, (select max(a.ultimo_acesso_em) from public.usuario_aparelhos a where a.user_id = u.id)),
    ev.created_at, ev.canal, ev.status,
    coalesce(pr.lembretes, true), coalesce(pr.canal_reserva, true), u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.push_agentes_preferencias pr on pr.user_id = u.id
  left join lateral (select e.created_at, e.canal, e.status from public.notificacoes_envios e where e.user_id = u.id order by e.created_at desc limit 1) ev on true
  where exists (select 1 from public.memberships m where m.user_id = u.id)
  order by u.created_at desc
  limit 2000;
end $$;

create function public.admin_engajamento_historico(p_limite integer default 100) returns table (
  tipo text, quando timestamptz, user_id uuid, nome text, descricao text, canal text, status text, detalhe text
) language plpgsql stable security definer set search_path = '' as $$
declare lim integer := greatest(1, least(coalesce(p_limite, 100), 300));
begin
  perform public.exigir_admin();
  return query
  (select 'evento'::text, ev.created_at, ev.user_id, p.nome, ev.evento || case when ev.plataforma <> '' then ' · ' || ev.plataforma else '' end, null::text, null::text, null::text
    from public.engajamento_eventos ev left join public.profiles p on p.id = ev.user_id order by ev.created_at desc limit lim)
  union all
  (select 'envio'::text, e.created_at, e.user_id, p.nome, e.titulo, e.canal, e.status, e.detalhe
    from public.notificacoes_envios e left join public.profiles p on p.id = e.user_id order by e.created_at desc limit lim)
  order by 2 desc limit lim;
end $$;

-- Gera agora os lembretes devidos (ignora o horário configurado; respeita frequência e preferências).
create function public.admin_lembretes_executar() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.exigir_admin();
  n := licitaflow_lembretes.preparar(true);
  perform licitaflow_lembretes.disparar();
  return n;
end $$;
revoke execute on function public.admin_engajamento_usuarios(), public.admin_engajamento_historico(integer), public.admin_lembretes_executar() from public, anon;
grant execute on function public.admin_engajamento_usuarios(), public.admin_engajamento_historico(integer), public.admin_lembretes_executar() to authenticated;

do $$ begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule('licitaflow-lembretes', '*/5 * * * *', 'select licitaflow_lembretes.disparar()');
  end if;
end $$;
COMMIT;
