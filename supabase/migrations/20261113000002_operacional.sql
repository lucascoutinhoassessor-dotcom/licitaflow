-- LicitaFlow · 0002 · Núcleo operacional, radar, agentes e auditoria
-- Toda tabela de negócio carrega org_id e usa RLS padrão (is_member / can_write).

-- =========================================================
-- Processos licitatórios
-- =========================================================
create table public.processos (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  empresa_id          uuid not null references public.empresas (id) on delete cascade,
  modalidade          text not null default 'pregao_eletronico' check (modalidade in (
                        'pregao_eletronico', 'dispensa_eletronica', 'concorrencia_eletronica',
                        'pregao_presencial', 'dispensa', 'inexigibilidade', 'concorrencia', 'outra')),
  etapa               text not null default 'captacao' check (etapa in (
                        'captacao', 'analise', 'proposta', 'disputa', 'habilitacao',
                        'recurso', 'homologado', 'perdido', 'desistencia')),
  numero              text,                -- nº do pregão/dispensa
  objeto              text not null,
  orgao_nome          text,
  orgao_cnpj          text,
  uasg                text,
  uf                  text,
  municipio           text,
  portal              text,                -- compras.gov.br, BLL, Licitações-e, BNC...
  link_edital         text,
  pncp_controle       text,                -- numeroControlePNCP
  valor_estimado      numeric(16, 2),
  valor_proposto      numeric(16, 2),
  valor_adjudicado    numeric(16, 2),
  data_publicacao     timestamptz,
  data_abertura       timestamptz,         -- sessão pública / início da disputa
  data_limite_proposta timestamptz,
  prioridade          text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  responsavel_id      uuid references auth.users (id) on delete set null,
  motivo_perda        text,
  observacoes         text,
  situacao_pncp       text,                -- última situação lida pelo Sentinela
  monitorar           boolean not null default true,
  created_by          uuid references auth.users (id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index processos_org_etapa_idx on public.processos (org_id, etapa);
create index processos_empresa_idx on public.processos (empresa_id);
create index processos_abertura_idx on public.processos (org_id, data_abertura);
create unique index processos_pncp_uniq on public.processos (empresa_id, pncp_controle) where pncp_controle is not null;

create table public.processo_itens (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  processo_id      uuid not null references public.processos (id) on delete cascade,
  numero_item      integer,
  lote             text,
  descricao        text not null,
  unidade          text,
  quantidade       numeric(16, 4) not null default 1,
  valor_ref_unit   numeric(16, 4),        -- valor estimado pelo órgão
  custo_unit       numeric(16, 4),        -- custo do fornecedor
  margem_min_pct   numeric(6, 2),         -- margem mínima aceita
  preco_limite_unit numeric(16, 4),       -- menor lance aceitável
  lance_final_unit numeric(16, 4),
  marca_modelo     text,
  fornecedor_nome  text,
  resultado        text check (resultado in ('ganho', 'perdido', 'fracassado', 'deserto', 'cancelado')),
  colocacao        integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index processo_itens_proc_idx on public.processo_itens (processo_id);

create table public.processo_eventos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  processo_id  uuid not null references public.processos (id) on delete cascade,
  tipo         text not null default 'nota',  -- nota, etapa, situacao_pncp, documento, alerta, agente
  titulo       text not null,
  descricao    text,
  dados        jsonb not null default '{}'::jsonb,
  origem       text not null default 'usuario' check (origem in ('usuario', 'sistema', 'agente')),
  autor_id     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index processo_eventos_proc_idx on public.processo_eventos (processo_id, created_at desc);

-- =========================================================
-- Prazos e tarefas
-- =========================================================
create table public.prazos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  empresa_id    uuid references public.empresas (id) on delete cascade,
  processo_id   uuid references public.processos (id) on delete cascade,
  contrato_id   uuid,  -- FK adicionada após contratos
  tipo          text not null default 'outro' check (tipo in (
                  'sessao', 'proposta', 'esclarecimento', 'impugnacao', 'recurso', 'contrarrazoes',
                  'habilitacao', 'amostra', 'entrega', 'assinatura', 'vigencia', 'certidao', 'outro')),
  titulo        text not null,
  data_hora     timestamptz not null,
  concluido     boolean not null default false,
  concluido_em  timestamptz,
  responsavel_id uuid references auth.users (id) on delete set null,
  avisar_dias   integer[] not null default '{3,1,0}',
  origem        text not null default 'usuario' check (origem in ('usuario', 'sistema', 'agente')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index prazos_org_data_idx on public.prazos (org_id, data_hora) where not concluido;

create table public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  processo_id    uuid references public.processos (id) on delete cascade,
  titulo         text not null,
  descricao      text,
  status         text not null default 'aberta' check (status in ('aberta', 'em_andamento', 'concluida')),
  vencimento     timestamptz,
  responsavel_id uuid references auth.users (id) on delete set null,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tarefas_org_idx on public.tarefas (org_id, status);

-- =========================================================
-- Documentos e certidões (habilitação)
-- =========================================================
create table public.documentos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  empresa_id    uuid references public.empresas (id) on delete cascade,
  processo_id   uuid references public.processos (id) on delete cascade,
  categoria     text not null default 'outro' check (categoria in (
                  'certidao', 'habilitacao_juridica', 'qualificacao_tecnica', 'qualificacao_economica',
                  'declaracao', 'edital', 'anexo_edital', 'proposta', 'ata', 'contrato', 'nota_fiscal', 'outro')),
  tipo          text,           -- ex.: CND Federal, FGTS, CNDT, Estadual, Municipal, Falência
  nome          text not null,
  numero        text,
  emissao       date,
  validade      date,
  storage_path  text,           -- {org_id}/... no bucket "arquivos"
  tamanho_bytes bigint,
  mime_type     text,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index documentos_org_validade_idx on public.documentos (org_id, validade);
create index documentos_empresa_idx on public.documentos (empresa_id);
create index documentos_processo_idx on public.documentos (processo_id);

-- =========================================================
-- Pós-pregão: contratos/atas, empenhos, entregas, faturas
-- =========================================================
create table public.contratos (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  processo_id    uuid references public.processos (id) on delete set null,
  tipo           text not null default 'contrato' check (tipo in ('contrato', 'ata_registro_preco', 'empenho_direto')),
  numero         text,
  orgao_nome     text,
  orgao_cnpj     text,
  objeto         text,
  valor_total    numeric(16, 2),
  inicio_vigencia date,
  fim_vigencia   date,
  status         text not null default 'ativo' check (status in ('ativo', 'suspenso', 'encerrado', 'rescindido')),
  gestor_orgao   text,
  observacoes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index contratos_org_idx on public.contratos (org_id, status);

alter table public.prazos
  add constraint prazos_contrato_fk foreign key (contrato_id) references public.contratos (id) on delete cascade;

create table public.empenhos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  contrato_id   uuid references public.contratos (id) on delete cascade,
  processo_id   uuid references public.processos (id) on delete set null,
  numero        text not null,
  data_emissao  date,
  valor         numeric(16, 2) not null default 0,
  prazo_entrega date,
  status        text not null default 'recebido' check (status in ('recebido', 'em_producao', 'entregue_parcial', 'entregue', 'cancelado')),
  observacoes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index empenhos_org_idx on public.empenhos (org_id, status);

create table public.entregas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  empenho_id   uuid references public.empenhos (id) on delete cascade,
  data_entrega date,
  descricao    text,
  valor        numeric(16, 2),
  status       text not null default 'agendada' check (status in ('agendada', 'entregue', 'recusada', 'aceita')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.faturas (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  empenho_id       uuid references public.empenhos (id) on delete set null,
  contrato_id      uuid references public.contratos (id) on delete set null,
  numero_nf        text,
  orgao_cnpj       text,            -- usado pelo Termômetro de Pagamento (agregado)
  data_emissao     date,
  valor            numeric(16, 2) not null default 0,
  vencimento       date,
  data_pagamento   date,
  status           text not null default 'emitida' check (status in ('emitida', 'atestada', 'liquidada', 'paga', 'cancelada')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index faturas_org_idx on public.faturas (org_id, status);

-- =========================================================
-- Radar de oportunidades (PNCP)
-- =========================================================
-- Cache global e público de contratações do PNCP (sem org_id).
create table public.oportunidades (
  id                 uuid primary key default gen_random_uuid(),
  pncp_controle      text not null unique,   -- numeroControlePNCP
  modalidade_id      integer,
  modalidade_nome    text,
  objeto             text not null,
  orgao_cnpj         text,
  orgao_nome         text,
  unidade_nome       text,
  uasg               text,
  uf                 text,
  municipio          text,
  valor_estimado     numeric(16, 2),
  data_publicacao    timestamptz,
  data_abertura      timestamptz,
  data_encerramento  timestamptz,
  situacao           text,
  link_sistema       text,
  srp                boolean,
  dados              jsonb not null default '{}'::jsonb,
  busca              tsvector generated always as (
                       to_tsvector('portuguese', coalesce(objeto, '') || ' ' || coalesce(orgao_nome, ''))
                     ) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index oportunidades_busca_idx on public.oportunidades using gin (busca);
create index oportunidades_pub_idx on public.oportunidades (data_publicacao desc);
create index oportunidades_uf_idx on public.oportunidades (uf);

create table public.radar_filtros (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  empresa_id       uuid not null references public.empresas (id) on delete cascade,
  nome             text not null,
  palavras_chave   text[] not null default '{}',
  palavras_excluir text[] not null default '{}',
  modalidades      integer[] not null default '{6,8}',  -- PNCP: 6 = pregão eletrônico, 8 = dispensa
  ufs              text[] not null default '{}',
  valor_min        numeric(16, 2),
  valor_max        numeric(16, 2),
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index radar_filtros_org_idx on public.radar_filtros (org_id) where ativo;

create table public.oportunidade_matches (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  empresa_id       uuid not null references public.empresas (id) on delete cascade,
  oportunidade_id  uuid not null references public.oportunidades (id) on delete cascade,
  filtro_id        uuid references public.radar_filtros (id) on delete set null,
  nota_aderencia   integer check (nota_aderencia between 0 and 100),  -- dada pela IA
  justificativa    text,
  status           text not null default 'nova' check (status in ('nova', 'vista', 'descartada', 'convertida')),
  processo_id      uuid references public.processos (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (empresa_id, oportunidade_id)
);
create index matches_org_status_idx on public.oportunidade_matches (org_id, status, created_at desc);

-- =========================================================
-- Agentes, notificações e auditoria
-- =========================================================
create table public.agentes_config (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  empresa_id  uuid references public.empresas (id) on delete cascade,
  agente      text not null check (agente in ('radar', 'leitor', 'cotador', 'juridico', 'sentinela', 'termometro')),
  ativo       boolean not null default false,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (org_id, empresa_id, agente)
);

create table public.agente_execucoes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  agente       text not null,
  alvo_tipo    text,      -- processo, documento, oportunidade...
  alvo_id      uuid,
  status       text not null default 'executando' check (status in ('executando', 'sucesso', 'erro')),
  resumo       text,
  resultado    jsonb not null default '{}'::jsonb,
  erro         text,
  tokens_in    integer,
  tokens_out   integer,
  iniciado_em  timestamptz not null default now(),
  concluido_em timestamptz
);
create index agente_exec_org_idx on public.agente_execucoes (org_id, iniciado_em desc);

create table public.notificacoes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete cascade,   -- null = toda a organização
  tipo        text not null,      -- prazo, certidao, oportunidade, situacao, agente
  titulo      text not null,
  mensagem    text,
  link        text,
  lida_em     timestamptz,
  enviado_email    boolean not null default false,
  enviado_whatsapp boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notificacoes_user_idx on public.notificacoes (org_id, user_id, created_at desc);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  org_id      uuid not null,   -- sem FK: precisa aceitar logs gerados durante o delete em cascata da organização
  user_id     uuid,
  tabela      text not null,
  registro_id uuid,
  acao        text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  antes       jsonb,
  depois      jsonb,
  created_at  timestamptz not null default now()
);
create index audit_org_idx on public.audit_log (org_id, created_at desc);

-- =========================================================
-- Triggers padrão: updated_at, auditoria e consistência de org_id
-- =========================================================
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (org_id, user_id, tabela, registro_id, acao, antes, depois)
  values (
    coalesce(new.org_id, old.org_id),
    auth.uid(),
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- Garante que registros filhos pertençam à mesma organização do processo.
create or replace function public.check_processo_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.processo_id is not null and not exists (
    select 1 from public.processos p where p.id = new.processo_id and p.org_id = new.org_id
  ) then
    raise exception 'processo não pertence à organização';
  end if;
  return new;
end;
$$;

create or replace function public.check_empresa_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.empresa_id is not null and not exists (
    select 1 from public.empresas e where e.id = new.empresa_id and e.org_id = new.org_id
  ) then
    raise exception 'empresa não pertence à organização';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  -- updated_at
  foreach t in array array[
    'processos', 'processo_itens', 'prazos', 'tarefas', 'documentos', 'contratos', 'empenhos',
    'entregas', 'faturas', 'oportunidades', 'radar_filtros', 'oportunidade_matches', 'agentes_config'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;

  -- auditoria
  foreach t in array array['processos', 'processo_itens', 'documentos', 'contratos', 'empenhos', 'faturas', 'empresas'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_trigger()',
                   t || '_audit', t);
  end loop;

  -- consistência processo -> org
  foreach t in array array['processo_itens', 'processo_eventos', 'prazos', 'tarefas', 'documentos', 'contratos', 'empenhos'] loop
    execute format('create trigger %I before insert or update of processo_id, org_id on public.%I for each row execute function public.check_processo_org()',
                   t || '_proc_org', t);
  end loop;

  -- consistência empresa -> org
  foreach t in array array['processos', 'prazos', 'documentos', 'contratos', 'radar_filtros', 'oportunidade_matches', 'agentes_config'] loop
    execute format('create trigger %I before insert or update of empresa_id, org_id on public.%I for each row execute function public.check_empresa_org()',
                   t || '_emp_org', t);
  end loop;
end;
$$;

-- Registra mudança de etapa na linha do tempo automaticamente.
create or replace function public.log_mudanca_etapa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.etapa is distinct from old.etapa then
    insert into public.processo_eventos (org_id, processo_id, tipo, titulo, dados, origem, autor_id)
    values (new.org_id, new.id, 'etapa', 'Etapa alterada',
            jsonb_build_object('de', old.etapa, 'para', new.etapa), 'sistema', auth.uid());
  end if;
  return new;
end;
$$;

create trigger processos_log_etapa after update of etapa on public.processos
  for each row execute function public.log_mudanca_etapa();

-- =========================================================
-- RLS
-- =========================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'processos', 'processo_itens', 'processo_eventos', 'prazos', 'tarefas', 'documentos',
    'contratos', 'empenhos', 'entregas', 'faturas', 'radar_filtros', 'oportunidade_matches'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member(org_id))', t || '_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write(org_id))', t || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id))', t || '_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_write(org_id))', t || '_del', t);
  end loop;
end;
$$;

-- oportunidades: leitura para qualquer usuário autenticado; escrita só pelo service role (Edge Functions)
alter table public.oportunidades enable row level security;
create policy oportunidades_sel on public.oportunidades for select to authenticated using (true);

-- agentes_config: membros leem, owner/admin configuram
alter table public.agentes_config enable row level security;
create policy agcfg_sel on public.agentes_config for select to authenticated using (public.is_member(org_id));
create policy agcfg_ins on public.agentes_config for insert to authenticated with check (public.has_role(org_id, array['owner', 'admin']));
create policy agcfg_upd on public.agentes_config for update to authenticated
  using (public.has_role(org_id, array['owner', 'admin'])) with check (public.has_role(org_id, array['owner', 'admin']));
create policy agcfg_del on public.agentes_config for delete to authenticated using (public.has_role(org_id, array['owner', 'admin']));

-- agente_execucoes: só leitura (escrita via service role)
alter table public.agente_execucoes enable row level security;
create policy agexec_sel on public.agente_execucoes for select to authenticated using (public.is_member(org_id));

-- notificacoes: do próprio usuário ou da organização inteira
alter table public.notificacoes enable row level security;
create policy notif_sel on public.notificacoes for select to authenticated
  using (public.is_member(org_id) and (user_id is null or user_id = auth.uid()));
create policy notif_upd on public.notificacoes for update to authenticated
  using (public.is_member(org_id) and (user_id is null or user_id = auth.uid()))
  with check (public.is_member(org_id) and (user_id is null or user_id = auth.uid()));

-- audit_log: owner/admin leem
alter table public.audit_log enable row level security;
create policy audit_sel on public.audit_log for select to authenticated using (public.has_role(org_id, array['owner', 'admin']));

-- =========================================================
-- Storage: bucket privado "arquivos", caminho {org_id}/...
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', false, 52428800)  -- 50 MB
on conflict (id) do nothing;

create policy arquivos_sel on storage.objects for select to authenticated
  using (bucket_id = 'arquivos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy arquivos_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos' and public.can_write(((storage.foldername(name))[1])::uuid));
create policy arquivos_upd on storage.objects for update to authenticated
  using (bucket_id = 'arquivos' and public.can_write(((storage.foldername(name))[1])::uuid));
create policy arquivos_del on storage.objects for delete to authenticated
  using (bucket_id = 'arquivos' and public.can_write(((storage.foldername(name))[1])::uuid));
