-- LicitaForce · Radar: busca mais rápida.
-- Na produção (banco Nano, em swap), a busca da 080 levou 22 s para "papel" (1.548 editais abertos), porque lia as
-- linhas grandes de oportunidades_indice de todos os candidatos antes de ordenar. O "Buscar agora" passa pelo
-- limite de 8 s das chamadas do app e falharia.
-- Agora segue o mesmo caminho da tela de Oportunidades: candidatos pelos índices GIN, filtro/ordem/limite na tabela
-- enxuta (oportunidades_busca) e só depois lê as linhas grandes, no máximo 60 (medido: 2,8 s).
-- Depois da primeira busca da empresa, só olha os editais publicados desde a última (com 2 dias de folga).
BEGIN;

create or replace function licitaflow_radar.buscar(p_empresa uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  e public.empresas; p public.radar_perfis; q tsquery; q_ex tsquery; kw text; r record; n integer := 0;
  no_objeto text[]; nos_itens text[]; pts integer; motivos jsonb; v_desde timestamptz;
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
  -- Perfil alterado depois da última busca: olha todos os abertos de novo.
  select case when x.executado_em > coalesce(p.updated_at, '-infinity'::timestamptz) then x.executado_em - interval '2 days' end
    into v_desde from licitaflow_radar.execucoes x where x.empresa_id = p_empresa;

  for r in
    with candidatos as materialized (
      select controle from public.oportunidades_indice where busca @@ q
      union select controle from public.oportunidades_indice where busca_itens @@ q
    ), excluidos as materialized (
      select controle from public.oportunidades_indice where q_ex is not null and busca @@ q_ex
    ), base as materialized (
      select b.controle, b.encerramento from public.oportunidades_busca b
      where b.controle in (select controle from candidatos)
        and coalesce(b.situacao, 1) = 1
        and b.encerramento >= now() + make_interval(hours => coalesce(p.antecedencia_horas, 24))
        and (v_desde is null or b.publicacao >= v_desde)
        and (coalesce(cardinality(p.ufs), 0) = 0 or b.uf = any(p.ufs))
        and (coalesce(cardinality(p.modalidades), 0) = 0 or b.modalidade = any(p.modalidades))
        and (p.valor_min is null or b.valor >= p.valor_min)
        and (p.valor_max is null or coalesce(b.valor, 0) <= p.valor_max)
        and not exists (select 1 from excluidos x where x.controle = b.controle)
        and not exists (select 1 from public.radar_sugestoes s where s.empresa_id = p_empresa and s.controle = b.controle)
      order by b.encerramento
      limit 60
    )
    select i.controle, i.objeto, i.orgao_nome, i.uf, i.modalidade, i.valor, i.publicacao, i.encerramento, i.compra, i.busca_itens
    from base join public.oportunidades_indice i on i.controle = base.controle
    order by base.encerramento
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

revoke execute on function licitaflow_radar.buscar(uuid) from public, anon, authenticated;

COMMIT;
