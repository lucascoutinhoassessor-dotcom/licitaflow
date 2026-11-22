-- LicitaFlow · Kanban: etapa pronta "Concluído" e colunas criadas pelo cliente.
--
-- - Etapa nova 'concluido' (final, depois de "Ganho"): contrato entregue/encerrado. Igual às outras finais,
--   a Sentinela não vigia processo concluído.
-- - processo_colunas: colunas extras que cada organização cria no Kanban (nome, cor, ordem). Um processo numa
--   coluna do cliente guarda coluna_id; a etapa oficial continua a mesma (relatórios e Sentinela seguem a etapa).
--   Ao mover para uma coluna padrão, coluna_id volta a null. Apagar a coluna devolve os cartões à etapa deles.
BEGIN;

alter table public.processos drop constraint if exists processos_etapa_check;
alter table public.processos add constraint processos_etapa_check check (etapa in (
  'captacao', 'analise', 'proposta', 'disputa', 'habilitacao', 'recurso', 'homologado', 'concluido', 'perdido', 'desistencia'));

create table if not exists public.processo_colunas (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  nome       text not null check (length(btrim(nome)) between 1 and 40),
  cor        text not null default '#64748b' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  ordem      integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists processo_colunas_org on public.processo_colunas (org_id, ordem);
alter table public.processo_colunas enable row level security;
create policy processo_colunas_sel on public.processo_colunas for select to authenticated using (public.is_member(org_id));
create policy processo_colunas_ins on public.processo_colunas for insert to authenticated with check (public.can_write(org_id));
create policy processo_colunas_upd on public.processo_colunas for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy processo_colunas_del on public.processo_colunas for delete to authenticated using (public.can_write(org_id));
grant select, insert, update, delete on public.processo_colunas to authenticated;

alter table public.processos add column if not exists coluna_id uuid references public.processo_colunas (id) on delete set null;
create index if not exists processos_coluna on public.processos (coluna_id) where coluna_id is not null;

-- Sentinela: 'concluido' também é etapa encerrada.
create or replace function licitaflow_sentinela.vigiados(p_org uuid default null)
returns table (org_id uuid, processo_id uuid, controle text)
language sql stable security definer set search_path = '' as $$
  with candidatos as (
    select p.org_id, p.id processo_id, p.pncp_controle controle,
           row_number() over (partition by p.org_id order by coalesce(p.data_abertura, p.created_at) desc, p.id) n
    from public.processos p
    where p.pncp_controle ~ '^\d{14}-1-\d{1,9}/\d{4}$'
      and p.etapa not in ('homologado', 'concluido', 'perdido', 'desistencia')
      and p.monitorar and p.arquivado_em is null
      and (p_org is null or p.org_id = p_org)
      and licitaflow_sentinela.agentes_liberados(p.org_id)
  )
  select c.org_id, c.processo_id, c.controle from candidatos c
  where coalesce((public.ia_limite_efetivo(c.org_id, 'sentinela')->>'limite')::int, 2147483647) >= c.n
$$;

create or replace function public.sentinela_resumo(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'Acesso negado'; end if;
  return jsonb_build_object(
    'liberado', licitaflow_sentinela.agentes_liberados(p_org),
    'limite', public.ia_limite_efetivo(p_org, 'sentinela'),
    'vigiados', coalesce((select jsonb_agg(jsonb_build_object('processo_id', p.id, 'objeto', p.objeto, 'numero', p.numero, 'controle', p.pncp_controle,
        'verificado_em', e.verificado_em, 'situacao', e.estado->>'situacao', 'encerramento', e.estado->>'encerramento', 'alterado_em', e.alterado_em)
        order by coalesce(p.data_abertura, p.created_at) desc)
      from licitaflow_sentinela.vigiados(p_org) w join public.processos p on p.id = w.processo_id
      left join licitaflow_sentinela.editais e on e.controle = w.controle), '[]'::jsonb),
    'fora_do_limite', (select count(*) from public.processos p
      where p.org_id = p_org and p.pncp_controle ~ '^\d{14}-1-\d{1,9}/\d{4}$' and p.etapa not in ('homologado', 'concluido', 'perdido', 'desistencia')
        and p.monitorar and p.arquivado_em is null
        and not exists (select 1 from licitaflow_sentinela.vigiados(p_org) w where w.processo_id = p.id)),
    'sem_controle', (select count(*) from public.processos p
      where p.org_id = p_org and p.pncp_controle is null and p.etapa not in ('homologado', 'concluido', 'perdido', 'desistencia')
        and p.monitorar and p.arquivado_em is null),
    'desligados', (select count(*) from public.processos p
      where p.org_id = p_org and p.pncp_controle ~ '^\d{14}-1-\d{1,9}/\d{4}$' and p.etapa not in ('homologado', 'concluido', 'perdido', 'desistencia')
        and not p.monitorar and p.arquivado_em is null));
end $$;

COMMIT;
