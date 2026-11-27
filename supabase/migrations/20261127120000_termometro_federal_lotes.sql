-- LicitaForce · Termômetro federal em lotes.
-- Em 27/11/2026 a gravação de um dia inteiro (~1,3 MB numa chamada) estourou o tempo na máquina Nano. As chamadas
-- desistiam, mas a consulta seguia no banco; com o agendamento de carga a cada 5 min, elas se acumularam e ajudaram a
-- derrubar o banco. Agora o servidor manda cada dia em lotes pequenos (tudo de um empenho no mesmo lote) e o banco
-- guarda o último lote gravado (recursos.federal_parte = 'AAAAMMDD:k', k = lotes já gravados daquele dia).
-- O dia só conta como lido (recursos.federal) no último lote. Lote repetido ou fora de ordem é recusado sem gravar.
BEGIN;

drop function if exists public.termometro_federal_dia(text, text, jsonb, jsonb, jsonb);

create function public.termometro_federal_dia(p_token text, p_dia text, p_liq jsonb, p_pag jsonb, p_ugs jsonb,
  p_parte integer default 0, p_partes integer default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ult text; v_parte text; v_feitos integer; v_casados integer;
begin
  if p_token is null or p_token <> (select token from licitaflow_termometro.config where id) then raise exception 'Token inválido'; end if;
  if p_dia !~ '^\d{8}$' then raise exception 'Dia inválido'; end if;
  if p_partes < 1 or p_parte < 0 or p_parte >= p_partes then raise exception 'Lote inválido'; end if;
  select recursos->>'federal', recursos->>'federal_parte' into v_ult, v_parte from licitaflow_termometro.config where id for update;
  if v_ult is not null and p_dia <= v_ult then return jsonb_build_object('situacao', 'já gravado'); end if;
  if v_parte is not null and split_part(v_parte, ':', 1) <> p_dia then raise exception 'Termine o dia % antes de gravar %', split_part(v_parte, ':', 1), p_dia; end if;
  v_feitos := case when v_parte is not null then split_part(v_parte, ':', 2)::integer else 0 end;
  if p_parte < v_feitos then return jsonb_build_object('situacao', 'já gravado'); end if;
  if p_parte > v_feitos then raise exception 'Lote fora de ordem: esperado %, veio %', v_feitos, p_parte; end if;

  insert into public.termometro_federal_ug (ug, nome, nome_busca, orgao_codigo, orgao, orgao_sup_codigo, orgao_sup, atualizado_em)
  select u->>0, u->>1, public.oportunidades_normalizar(u->>1), nullif(u->>2, ''), nullif(u->>3, ''), nullif(u->>4, ''), nullif(u->>5, ''), now()
  from jsonb_array_elements(coalesce(p_ugs, '[]'::jsonb)) u
  where (u->>0) ~ '^\d{6}$' and coalesce(u->>1, '') <> ''
  on conflict (ug) do update set nome = excluded.nome, nome_busca = excluded.nome_busca, orgao_codigo = excluded.orgao_codigo,
    orgao = excluded.orgao, orgao_sup_codigo = excluded.orgao_sup_codigo, orgao_sup = excluded.orgao_sup, atualizado_em = now();

  insert into licitaflow_termometro.fed_pendente (empenho, dia, competencia)
  select l->>0, (l->>1)::date, (l->>2)::date
  from jsonb_array_elements(coalesce(p_liq, '[]'::jsonb)) l
  where (l->>0) ~ '^\d{15}NE\d{6}$' and (l->>1) ~ '^\d{4}-\d{2}-\d{2}$'
  on conflict (empenho, dia) do update set competencia = greatest(licitaflow_termometro.fed_pendente.competencia, excluded.competencia);

  -- FIFO: o k-ésimo pagamento de um empenho no dia quita a k-ésima liquidação aberta mais antiga desse empenho.
  with pag as (
    select p->>0 as empenho, (p->>1)::date as dia, row_number() over (partition by p->>0 order by p->>1, ord) as k
    from jsonb_array_elements(coalesce(p_pag, '[]'::jsonb)) with ordinality as x(p, ord)
    where (p->>0) ~ '^\d{15}NE\d{6}$' and (p->>1) ~ '^\d{4}-\d{2}-\d{2}$'
  ), pend as (
    select f.empenho, f.dia, f.competencia, row_number() over (partition by f.empenho order by f.dia) as k
    from licitaflow_termometro.fed_pendente f
    where f.empenho in (select empenho from pag) and f.dia <= to_date(p_dia, 'YYYYMMDD')
  ), par as (
    select pend.empenho, pend.dia as dia_liq, pend.competencia, pag.dia as dia_pag
    from pag join pend on pend.empenho = pag.empenho and pend.k = pag.k
    where pag.dia >= pend.dia
  ), apaga as (
    delete from licitaflow_termometro.fed_pendente f using par
    where f.empenho = par.empenho and f.dia = par.dia_liq
    returning par.*
  ), med as (
    select left(empenho, 6) as ug, date_trunc('month', dia_pag)::date as mes, (dia_pag - dia_liq) as d,
           case when competencia is null then null else greatest(dia_pag - competencia, 0) end as c
    from apaga
  ), soma as (
    insert into public.termometro_federal as t (ug, mes, n, soma_dias, ate5, ate15, ate30, acima30, nc, soma_c, c60)
    select ug, mes, count(*), sum(d), count(*) filter (where d <= 5), count(*) filter (where d between 6 and 15),
           count(*) filter (where d between 16 and 30), count(*) filter (where d > 30),
           count(c), coalesce(sum(c), 0), count(*) filter (where c > 60)
    from med group by ug, mes
    on conflict (ug, mes) do update set n = t.n + excluded.n, soma_dias = t.soma_dias + excluded.soma_dias,
      ate5 = t.ate5 + excluded.ate5, ate15 = t.ate15 + excluded.ate15, ate30 = t.ate30 + excluded.ate30,
      acima30 = t.acima30 + excluded.acima30, nc = t.nc + excluded.nc, soma_c = t.soma_c + excluded.soma_c, c60 = t.c60 + excluded.c60
  )
  select count(*) into v_casados from med;

  if p_parte + 1 < p_partes then
    update licitaflow_termometro.config set recursos = recursos || jsonb_build_object('federal_parte', p_dia || ':' || (p_parte + 1)) where id;
  else
    delete from licitaflow_termometro.fed_pendente where dia < to_date(p_dia, 'YYYYMMDD') - 150;
    delete from public.termometro_federal where mes < (date_trunc('month', to_date(p_dia, 'YYYYMMDD')) - interval '12 months')::date;
    update licitaflow_termometro.config set recursos = (recursos - 'federal_parte') || jsonb_build_object('federal', p_dia) where id;
  end if;
  return jsonb_build_object('casados', v_casados);
end $$;

revoke execute on function public.termometro_federal_dia(text, text, jsonb, jsonb, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.termometro_federal_dia(text, text, jsonb, jsonb, jsonb, integer, integer) to service_role;

-- A carga volta por um agendamento de madrugada: de hora em hora, da 0h às 6h de Brasília (3h–9h UTC). Cada rodada lê
-- até 3 dias em lotes, então a carga atrasada anda ~21 dias por noite e, em dia, cada rodada só confere se saiu dia novo.
-- O agendamento foi tirado da produção em 27/11/2026 durante a queda; esta migração o recria.
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname in ('licitaflow-termometro-federal', 'licitaflow-termometro-federal-carga');
    perform cron.schedule('licitaflow-termometro-federal', '0 3-9 * * *', 'select licitaflow_termometro.disparar_federal()');
  end if;
end $$;

COMMIT;
