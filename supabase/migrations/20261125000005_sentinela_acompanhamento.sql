-- Acompanhamento verificável e cruzamento do resultado público com a empresa do processo.
BEGIN;
alter table licitaflow_sentinela.editais add column ultimo_erro text;

-- Preserva a seleção e o bloqueio concorrente do lote existente.
alter function public.sentinela_lote(text, integer) set schema licitaflow_sentinela;
create function public.sentinela_lote(p_token text, p_limite integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare lote jsonb;
begin
  lote := licitaflow_sentinela.sentinela_lote(p_token, p_limite);
  return (select coalesce(jsonb_agg(x.item || jsonb_build_object('falhas', e.falhas)), '[]'::jsonb)
    from jsonb_array_elements(lote) x(item)
    join licitaflow_sentinela.editais e on e.controle = x.item->>'controle');
end
$$;

alter function public.sentinela_gravar(text, jsonb) set schema licitaflow_sentinela;
create function public.sentinela_gravar(p_token text, p_itens jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare avisos jsonb; it jsonb;
begin
  avisos := licitaflow_sentinela.sentinela_gravar(p_token, p_itens);
  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    update licitaflow_sentinela.editais set ultimo_erro = left(it->>'erro', 500) where controle = it->>'controle';
    if not (it ? 'erro') then
      insert into public.processo_eventos (org_id, processo_id, tipo, titulo, descricao, dados, origem)
      select w.org_id, w.processo_id, 'sentinela', 'Sentinela: acompanhamento iniciado',
        'Primeira consulta concluída. Situação e documentos registrados para acompanhar as próximas publicações do órgão.',
        jsonb_build_object('nivel', 'baixo', 'tipo', 'inicio', 'controle', w.controle), 'agente'
      from licitaflow_sentinela.vigiados() w where w.controle = it->>'controle'
        and not exists (select 1 from public.processo_eventos h where h.processo_id = w.processo_id
          and h.tipo = 'sentinela' and h.dados->>'tipo' = 'inicio' and h.dados->>'controle' = w.controle);
    end if;
  end loop;
  return avisos;
end $$;

alter function public.sentinela_resumo(uuid) set schema licitaflow_sentinela;
create function public.sentinela_resumo(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare resumo jsonb; lista jsonb;
begin
  -- A função original verifica associação à organização antes de qualquer leitura.
  resumo := licitaflow_sentinela.sentinela_resumo(p_org);
  select coalesce(jsonb_agg(v.item || jsonb_build_object(
    'proxima_em', e.proxima_em, 'falhas', coalesce(e.falhas, 0), 'ultimo_erro', e.ultimo_erro,
    'documentos', coalesce(jsonb_array_length(e.estado->'arquivos'), 0), 'existe_resultado', coalesce((e.estado->>'existe_resultado')::boolean, false),
    'empresa_nome', emp.razao_social, 'empresa_cnpj', emp.cnpj,
    'resultados_consultados_em', e.estado->>'resultados_consultados_em',
    'resultados_parcial', coalesce((e.estado->>'resultados_parcial')::boolean, false),
    'resultados_erro', e.estado->>'resultados_erro',
    'historico', coalesce((select jsonb_agg(h.item order by h.ord)
      from jsonb_array_elements(coalesce(e.estado->'historico', '[]'::jsonb)) with ordinality h(item, ord) where h.ord <= 5), '[]'::jsonb),
    'historico_erro', e.estado->>'historico_erro',
    'historico_parcial', coalesce((e.estado->>'historico_parcial')::boolean, false),
    'resultados_cliente', coalesce((select jsonb_agg(r.item) from jsonb_array_elements(coalesce(e.estado->'resultados', '[]'::jsonb)) r(item)
      where upper(regexp_replace(r.item->>'cnpj', '[^a-zA-Z0-9]', '', 'g')) = upper(regexp_replace(emp.cnpj, '[^a-zA-Z0-9]', '', 'g'))), '[]'::jsonb)
  ) order by v.ord), '[]'::jsonb) into lista
  from jsonb_array_elements(resumo->'vigiados') with ordinality v(item, ord)
  join public.processos p on p.id = (v.item->>'processo_id')::uuid and p.org_id = p_org
  left join public.empresas emp on emp.id = p.empresa_id and emp.org_id = p.org_id
  left join licitaflow_sentinela.editais e on e.controle = v.item->>'controle';
  return resumo || jsonb_build_object('vigiados', lista);
end $$;

-- Não exibir um selo verde após uma falha ou quando o agendador deixou de verificar.
alter function public.agentes_estado_processos(uuid) set schema licitaflow_sentinela;
create function public.agentes_estado_processos(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare estados jsonb; p record; status jsonb;
begin
  estados := licitaflow_sentinela.agentes_estado_processos(p_org);
  for p in select pr.id, e.* from public.processos pr join licitaflow_sentinela.editais e on e.controle = pr.pncp_controle where pr.org_id = p_org loop
    status := estados->p.id::text->'sentinela';
    if status->>'estado' in ('ativo', 'na_fila', 'falha') then
      if p.falhas > 0 or p.estado->>'resultados_erro' is not null or p.estado->>'historico_erro' is not null then
        status := status || jsonb_build_object('estado', 'falha', 'motivo', coalesce(p.ultimo_erro, p.estado->>'resultados_erro', p.estado->>'historico_erro', 'Falha na última consulta ao PNCP'));
      elsif p.proxima_em < now() - interval '30 minutes' then
        status := status || jsonb_build_object('estado', 'parado', 'motivo', 'Verificação atrasada; aguardando o agendador');
      end if;
      estados := jsonb_set(estados, array[p.id::text, 'sentinela'], status);
    end if;
  end loop;
  return estados;
end $$;

revoke execute on function public.sentinela_lote(text, integer), public.sentinela_gravar(text, jsonb) from public, anon, authenticated;
grant execute on function public.sentinela_lote(text, integer), public.sentinela_gravar(text, jsonb) to service_role;
revoke execute on function public.sentinela_resumo(uuid), public.agentes_estado_processos(uuid) from public, anon;
grant execute on function public.sentinela_resumo(uuid), public.agentes_estado_processos(uuid) to authenticated;
revoke execute on all functions in schema licitaflow_sentinela from public, anon, authenticated;
-- Os acompanhamentos existentes entram na próxima rodada para preencher os novos dados.
update licitaflow_sentinela.editais e set proxima_em = least(e.proxima_em, now())
where exists (select 1 from licitaflow_sentinela.vigiados() v where v.controle = e.controle);
COMMIT;
