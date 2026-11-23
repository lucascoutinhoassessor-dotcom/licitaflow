-- LicitaForce · Sentinela com avisos mais completos.
-- - O histórico do processo passa a guardar, na descrição, a orientação ao licitante ("o que fazer").
-- - Os avisos devolvidos ao servidor trazem o número de controle, para o push identificar a compra.
-- Os eventos agora levam em detalhe: contexto (modalidade, número e órgão), antes, depois, categoria do documento,
-- nome limpo do documento e orientacao. Eventos antigos continuam válidos (sem esses campos).
BEGIN;

create or replace function public.sentinela_gravar(p_token text, p_itens jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it jsonb; ev jsonb; avisos jsonb := '[]'::jsonb; v record; n integer; v_orient text;
begin
  if p_token is null or p_token <> (select token from licitaflow_sentinela.config where id) then raise exception 'Token inválido'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    if it ? 'erro' then
      update licitaflow_sentinela.editais set falhas = falhas + 1, proxima_em = (it->>'proxima_em')::timestamptz, tentado_em = null
      where controle = it->>'controle';
      continue;
    end if;
    n := jsonb_array_length(coalesce(it->'eventos', '[]'::jsonb));
    update licitaflow_sentinela.editais set estado = it->'estado', verificado_em = now(), falhas = 0, tentado_em = null,
      proxima_em = (it->>'proxima_em')::timestamptz, alterado_em = case when n > 0 then now() else alterado_em end
    where controle = it->>'controle';
    for ev in select * from jsonb_array_elements(coalesce(it->'eventos', '[]'::jsonb)) loop
      v_orient := left(coalesce(ev->>'orientacao', ev->'detalhe'->>'orientacao'), 1000);
      insert into public.sentinela_eventos (controle, tipo, nivel, titulo, detalhe)
      values (it->>'controle', ev->>'tipo', coalesce(ev->>'nivel', 'medio'), left(ev->>'titulo', 300), coalesce(ev->'detalhe', '{}'::jsonb));
      -- Histórico de cada processo vigiado que acompanha este edital, com a orientação na descrição.
      for v in select * from licitaflow_sentinela.vigiados() w where w.controle = it->>'controle' loop
        insert into public.processo_eventos (org_id, processo_id, tipo, titulo, descricao, dados, origem)
        values (v.org_id, v.processo_id, 'sentinela', left('Sentinela: ' || (ev->>'titulo'), 300), v_orient,
                jsonb_build_object('nivel', ev->>'nivel', 'tipo', ev->>'tipo') || coalesce(ev->'detalhe', '{}'::jsonb), 'agente');
        avisos := avisos || jsonb_build_object('titulo', ev->>'titulo', 'nivel', ev->>'nivel', 'org_id', v.org_id,
                                               'processo_id', v.processo_id, 'controle', it->>'controle');
      end loop;
    end loop;
  end loop;
  return avisos;
end $$;

revoke execute on function public.sentinela_gravar(text, jsonb) from public, anon, authenticated;
grant execute on function public.sentinela_gravar(text, jsonb) to service_role;

COMMIT;
