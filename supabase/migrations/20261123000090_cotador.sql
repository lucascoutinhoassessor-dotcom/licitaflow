-- LicitaForce · Agente Cotador: monta a cotação dos itens de um processo.
-- - Importa os itens do edital do PNCP (número, descrição, unidade, quantidade, valor estimado do órgão).
-- - Casa cada item com o catálogo do governo e guarda o preço de mercado (Painel de Preços, últimos 12 meses).
-- - Com custo e margem, calcula o preço-limite e sugere o preço proposto; baixa a planilha da proposta.
-- Não usa IA. Limite do plano (chave "cotador" em limites_ia): processos cotados por mês. Cada processo conta
-- uma vez por mês, na primeira importação ou pesquisa de preço (registrado em ia_uso, custo zero).
BEGIN;

alter table public.processo_itens
  add column if not exists catalogo_tipo text check (catalogo_tipo in ('M', 'S')),
  add column if not exists catalogo_codigo integer,
  add column if not exists catalogo_nome text,
  add column if not exists mercado jsonb,            -- {unidade, n, minimo, maximo, media, mediana, consultado_em, outra_unidade}
  add column if not exists preco_proposto_unit numeric(16, 4),
  add column if not exists origem text not null default 'manual' check (origem in ('manual', 'edital'));

-- O agente aparece explicitamente em todos os planos (nunca em aberto).
update public.plataforma_planos set limites_ia = limites_ia || jsonb_build_object('cotador',
  case id when 'trial' then to_jsonb(3) when 'essencial' then to_jsonb(20) when 'profissional' then to_jsonb(100)
          when 'assessoria' then 'null'::jsonb else to_jsonb(0) end);

-- Para o app: registra que o processo está sendo cotado neste mês (uma vez por processo/mês) e confere o limite.
create function public.cotador_usar(p_processo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_lim jsonb; v_usadas integer;
begin
  select org_id into v_org from public.processos where id = p_processo;
  if v_org is null or not public.can_write(v_org) then raise exception 'Acesso negado'; end if;
  if not licitaflow_sentinela.agentes_liberados(v_org) then raise exception 'Os agentes de IA ainda não estão liberados para a sua conta.'; end if;
  v_lim := public.ia_limite_efetivo(v_org, 'cotador');
  if exists (select 1 from public.ia_uso where org_id = v_org and agente = 'cotador' and referencia = p_processo::text and nova
             and created_at >= public.ia_inicio_mes()) then
    return v_lim || jsonb_build_object('usadas', public.ia_usos_mes(v_org, 'cotador'), 'contou', false);
  end if;
  v_usadas := public.ia_usos_mes(v_org, 'cotador');
  if v_lim->'limite' = '0'::jsonb then raise exception 'O seu plano não inclui o Cotador.'; end if;
  if jsonb_typeof(v_lim->'limite') = 'number' and v_usadas >= (v_lim->>'limite')::int then
    raise exception 'A sua organização já cotou % processos neste mês (limite do plano). O limite renova no dia 1º.', v_usadas;
  end if;
  insert into public.ia_uso (org_id, user_id, agente, referencia, nova) values (v_org, auth.uid(), 'cotador', p_processo::text, true);
  return v_lim || jsonb_build_object('usadas', v_usadas + 1, 'contou', true);
end $$;

revoke execute on function public.cotador_usar(uuid) from public, anon;
grant execute on function public.cotador_usar(uuid) to authenticated;

-- Uso por agente: Cotador conta processos cotados no mês (como o Leitor, tipo mensal); Sentinela e Radar seguem simultâneos.
-- (ia_uso_resumo já trata qualquer agente mensal pelo ia_usos_mes; nada a mudar.)

-- Selo no cartão do Kanban: itens com preço de mercado pesquisado.
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
        then jsonb_build_object('estado', 'ativo', 'motivo', 'Encontrado pelo Radar', 'lido_em', rs.created_at) end,
      'cotador', case when ct.itens > 0 and ct.cotados > 0
        then jsonb_build_object('estado', 'ativo', 'motivo', 'Preço de mercado em ' || ct.cotados || ' de ' || ct.itens || ' itens') end
    )))
    from public.processos p
    left join licitaflow_sentinela.vigiados(p_org) w on w.processo_id = p.id
    left join licitaflow_sentinela.editais e on e.controle = p.pncp_controle
    left join public.ia_leituras_edital l on l.controle = p.pncp_controle
    left join lateral (select s.id, s.created_at from public.radar_sugestoes s where s.processo_id = p.id limit 1) rs on true
    left join lateral (select count(*)::int itens, count(*) filter (where i.mercado is not null)::int cotados
                       from public.processo_itens i where i.processo_id = p.id) ct on true
    where p.org_id = p_org), '{}'::jsonb);
end $$;

COMMIT;
