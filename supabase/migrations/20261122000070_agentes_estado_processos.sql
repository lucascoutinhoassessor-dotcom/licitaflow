-- LicitaForce · Estado real dos agentes de IA em cada processo (para o cartão do Kanban e a lista).
-- O cartão não pode deduzir sozinho se um agente está trabalhando: depende do módulo "agentes" liberado,
-- do limite do plano (ou exceção do cliente), da opção do processo e do que o agente já fez.
--
-- agentes_estado_processos(p_org) → { "<processo_id>": { "<agente>": {estado, motivo, ...} } }
-- estado:
--   ativo         → o agente está trabalhando neste processo (Sentinela: já verificou o edital)
--   na_fila       → ligado e dentro do limite, aguardando a primeira execução
--   falha         → ligado, mas a fonte não respondeu nas últimas tentativas
--   parado        → o cliente quer, mas algo impede (módulo não liberado, plano não inclui, fora do limite)
--   desligado     → o cliente desligou neste processo
--   indisponivel  → não se aplica (sem edital do PNCP, arquivado, encerrado)
-- Agente sem nada a mostrar no processo não aparece na chave do processo.
-- Para um agente novo: acrescentar o bloco dele no jsonb_build_object abaixo, com os mesmos estados.
BEGIN;

create function public.agentes_estado_processos(p_org uuid) returns jsonb
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
        then jsonb_build_object('estado', 'ativo', 'motivo', 'Edital lido pela IA', 'lido_em', l.created_at) end
    )))
    from public.processos p
    left join licitaflow_sentinela.vigiados(p_org) w on w.processo_id = p.id
    left join licitaflow_sentinela.editais e on e.controle = p.pncp_controle
    left join public.ia_leituras_edital l on l.controle = p.pncp_controle
    where p.org_id = p_org), '{}'::jsonb);
end $$;

revoke execute on function public.agentes_estado_processos(uuid) from public, anon;
grant execute on function public.agentes_estado_processos(uuid) to authenticated;

COMMIT;
