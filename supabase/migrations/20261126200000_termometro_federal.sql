-- LicitaForce · Termômetro de Pagamento para órgãos federais: dias entre a liquidação (o órgão atesta a nota) e o
-- pagamento (ordem bancária ao fornecedor), por unidade gestora (UG = UASG do PNCP).
-- - Fonte: arquivo diário "Despesas" do Portal da Transparência (CGU), sem chave. O servidor lê cada dia
--   (server/termometroFederal.js) e manda as liquidações e os pagamentos a fornecedor PJ (aplicação direta).
-- - Casamento pelo empenho: cada pagamento quita a liquidação aberta mais antiga daquele empenho (FIFO).
--   As notas do mesmo empenho no mesmo dia contam como uma liquidação.
-- - Quando a liquidação veio do Contratos.gov.br, a observação traz o mês do serviço: mede também os dias entre o
--   fim desse mês e o pagamento.
-- - Liquidação sem pagamento por 150 dias sai da fila (pode ter sido paga por outro meio ou cancelada).
BEGIN;

-- Liquidações ainda sem pagamento casado. ug = 6 primeiros dígitos do empenho.
create table licitaflow_termometro.fed_pendente (
  empenho     text not null,
  dia         date not null,
  competencia date,             -- último dia do mês do serviço, quando a observação traz
  primary key (empenho, dia)
);
create index fed_pendente_dia on licitaflow_termometro.fed_pendente (dia);
alter table licitaflow_termometro.fed_pendente enable row level security;

-- Resumo por UG e mês do pagamento.
create table public.termometro_federal (
  ug        text not null check (ug ~ '^\d{6}$'),
  mes       date not null,
  n         integer not null default 0,   -- pagamentos casados com liquidação
  soma_dias integer not null default 0,   -- soma dos dias liquidação → pagamento
  ate5      integer not null default 0,   -- pagos em até 5 dias
  ate15     integer not null default 0,   -- de 6 a 15 dias
  ate30     integer not null default 0,   -- de 16 a 30 dias
  acima30   integer not null default 0,   -- mais de 30 dias
  nc        integer not null default 0,   -- casados que tinham o mês do serviço
  soma_c    integer not null default 0,   -- soma dos dias entre o fim do mês do serviço e o pagamento
  c60       integer not null default 0,   -- pagos mais de 60 dias depois do fim do mês do serviço
  primary key (ug, mes)
);
alter table public.termometro_federal enable row level security;
create policy termometro_federal_ler on public.termometro_federal for select to authenticated using (true);
grant select on public.termometro_federal to authenticated;

-- Nome e órgão de cada UG (do arquivo de pagamentos).
create table public.termometro_federal_ug (
  ug                text primary key check (ug ~ '^\d{6}$'),
  nome              text not null,
  nome_busca        text not null,
  orgao_codigo      text,
  orgao             text,
  orgao_sup_codigo  text,
  orgao_sup         text,
  atualizado_em     timestamptz not null default now()
);
create index termometro_federal_ug_orgao on public.termometro_federal_ug (orgao_codigo);
alter table public.termometro_federal_ug enable row level security;
create policy termometro_federal_ug_ler on public.termometro_federal_ug for select to authenticated using (true);
grant select on public.termometro_federal_ug to authenticated;

-- Para o servidor: grava um dia. p_liq: [[empenho, 'AAAA-MM-DD', competência|null]]; p_pag: [[empenho, 'AAAA-MM-DD']];
-- p_ugs: [[ug, nome, código órgão, órgão, código órgão superior, órgão superior]]. p_dia: 'AAAAMMDD'.
-- Só aceita dia posterior ao último gravado (repetir um dia dobraria a contagem).
create function public.termometro_federal_dia(p_token text, p_dia text, p_liq jsonb, p_pag jsonb, p_ugs jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ult text; v_casados integer;
begin
  if p_token is null or p_token <> (select token from licitaflow_termometro.config where id) then raise exception 'Token inválido'; end if;
  if p_dia !~ '^\d{8}$' then raise exception 'Dia inválido'; end if;
  select recursos->>'federal' into v_ult from licitaflow_termometro.config where id for update;
  if v_ult is not null and p_dia <= v_ult then return jsonb_build_object('situacao', 'já gravado'); end if;

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

  delete from licitaflow_termometro.fed_pendente where dia < to_date(p_dia, 'YYYYMMDD') - 150;
  delete from public.termometro_federal where mes < (date_trunc('month', to_date(p_dia, 'YYYYMMDD')) - interval '12 months')::date;
  update licitaflow_termometro.config set recursos = recursos || jsonb_build_object('federal', p_dia) where id;
  return jsonb_build_object('casados', v_casados);
end $$;

-- Resumo dos últimos 3 meses fechados + o mês corrente, por UG e pelo órgão inteiro (todas as UGs do órgão).
create function public.termometro_federal_consulta(p_ugs text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ini as (select (date_trunc('month', current_date) - interval '3 months')::date as m),
  alvo as (select u.* from public.termometro_federal_ug u where u.ug = any(p_ugs)),
  por_ug as (
    select t.ug, sum(n) n, sum(soma_dias) soma_dias, sum(ate5) ate5, sum(ate15) ate15, sum(ate30) ate30, sum(acima30) acima30,
           sum(nc) nc, sum(soma_c) soma_c, sum(c60) c60
    from public.termometro_federal t, ini where t.ug = any(p_ugs) and t.mes >= ini.m group by t.ug
  ),
  por_orgao as (
    select u.orgao_codigo, sum(n) n, sum(soma_dias) soma_dias, sum(ate5) ate5, sum(ate15) ate15, sum(ate30) ate30, sum(acima30) acima30,
           sum(nc) nc, sum(soma_c) soma_c, sum(c60) c60
    from public.termometro_federal t join public.termometro_federal_ug u on u.ug = t.ug, ini
    where u.orgao_codigo in (select orgao_codigo from alvo) and t.mes >= ini.m group by u.orgao_codigo
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'ug', a.ug, 'nome', a.nome, 'orgao_codigo', a.orgao_codigo, 'orgao', a.orgao, 'orgao_sup', a.orgao_sup,
    'dados', to_jsonb(pu) - 'ug', 'dados_orgao', to_jsonb(po) - 'orgao_codigo')), '[]'::jsonb)
  from alvo a left join por_ug pu on pu.ug = a.ug left join por_orgao po on po.orgao_codigo = a.orgao_codigo
$$;

-- Último dia lido do Portal (para a tela dizer "dados até …").
create function public.termometro_federal_posicao() returns text
language sql stable security definer set search_path = '' as $$
  select recursos->>'federal' from licitaflow_termometro.config where id
$$;

create function licitaflow_termometro.disparar_federal() returns boolean
language plpgsql security definer set search_path = '' as $$
declare c licitaflow_termometro.config;
begin
  select * into c from licitaflow_termometro.config where id;
  if not c.ativo or to_regnamespace('net') is null then return false; end if;
  perform net.http_get(url := replace(c.url, 'acao=atualizar', 'acao=federal'), headers := jsonb_build_object('x-coleta', c.token), timeout_milliseconds := 290000);
  return true;
end $$;

revoke execute on function public.termometro_federal_dia(text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.termometro_federal_dia(text, text, jsonb, jsonb, jsonb) to service_role;
revoke execute on function public.termometro_federal_consulta(text[]), public.termometro_federal_posicao() from public, anon;
grant execute on function public.termometro_federal_consulta(text[]), public.termometro_federal_posicao() to authenticated;
revoke execute on all functions in schema licitaflow_termometro from public, anon, authenticated;

-- Agenda: todo dia às 7h de Brasília (10h UTC). O Portal publica cada dia com alguns dias de atraso;
-- a rodada lê tudo o que saiu desde a última.
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'licitaflow-termometro-federal';
    perform cron.schedule('licitaflow-termometro-federal', '0 10 * * *', 'select licitaflow_termometro.disparar_federal()');
  end if;
end $$;

COMMIT;
