-- LicitaFlow · Processos: arquivar e escolher quais a Sentinela vigia.
--
-- - arquivado_em: processo arquivado sai do Kanban e da lista (dá para mostrar e desarquivar). Não apaga nada.
-- - monitorar: o cliente pode desligar a Sentinela num processo pelo cartão do Kanban (botão "Monitorar com IA",
--   que só aparece quando o master libera o recurso "recurso-monitorar-processo"). Padrão ligado, como era antes.
--   Processo arquivado nunca é vigiado.
BEGIN;

alter table public.processos
  add column if not exists arquivado_em timestamptz,
  add column if not exists monitorar boolean not null default true;

create or replace function licitaflow_sentinela.vigiados(p_org uuid default null)
returns table (org_id uuid, processo_id uuid, controle text)
language sql stable security definer set search_path = '' as $$
  with candidatos as (
    select p.org_id, p.id processo_id, p.pncp_controle controle,
           row_number() over (partition by p.org_id order by coalesce(p.data_abertura, p.created_at) desc, p.id) n
    from public.processos p
    where p.pncp_controle ~ '^\d{14}-1-\d{1,9}/\d{4}$'
      and p.etapa not in ('homologado', 'perdido', 'desistencia')
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
      where p.org_id = p_org and p.pncp_controle ~ '^\d{14}-1-\d{1,9}/\d{4}$' and p.etapa not in ('homologado', 'perdido', 'desistencia')
        and p.monitorar and p.arquivado_em is null
        and not exists (select 1 from licitaflow_sentinela.vigiados(p_org) w where w.processo_id = p.id)),
    'sem_controle', (select count(*) from public.processos p
      where p.org_id = p_org and p.pncp_controle is null and p.etapa not in ('homologado', 'perdido', 'desistencia')
        and p.monitorar and p.arquivado_em is null),
    'desligados', (select count(*) from public.processos p
      where p.org_id = p_org and p.pncp_controle ~ '^\d{14}-1-\d{1,9}/\d{4}$' and p.etapa not in ('homologado', 'perdido', 'desistencia')
        and not p.monitorar and p.arquivado_em is null));
end $$;

COMMIT;
