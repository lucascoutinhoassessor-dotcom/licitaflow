-- Cron sem sobreposição (travamento do banco em 27/11/2026)
--
-- O que aconteceu (medido em cron.job_run_details):
--   26/11 13:12 UTC e 27/11 08:08 UTC, uma rodada do tick() ficou 268 s e 510 s
--   presa em "update public.oportunidades_catalogo_status ... editais_indexados =
--   (select count(*) from oportunidades_indice), editais_com_itens = (select count(*)
--   ... where itens_completos)". São duas varreduras da tabela de 235 MB num Nano
--   com ~400 MB de RAM. A varredura tira tudo da memória (swap), segura a única
--   linha de status e, a partir dali, até jobs triviais (push-agendado, turso)
--   passam a levar 10-15 s. Os jobs de minuto em minuto se empilham, as conexões
--   acabam ("job startup timeout") e o login dá 504.
--
-- O que esta migração faz:
--   1. tick(): o número de editais vem da estimativa do pg_class (sem varrer a
--      tabela). editais_com_itens fica como está (a coleta de itens no Postgres
--      está pausada desde a 056). O tick passa a ter até 8 pedidos em voo, para
--      manter o ritmo agora que roda 1x por minuto (antes, a cada 20 s, com 4).
--   2. Todo job de cron recorrente ganha statement_timeout e lock_timeout no
--      próprio comando (testado na produção: "set statement_timeout='2s'; select
--      pg_sleep(5)" no cron cancela em 2,0 s). Nenhuma rodada passa de 40 s
--      (só a limpeza, 4x por dia, pode chegar a 120 s).
--   Esta migração não muda o "active" dos jobs: em 27/11 os jobs 6, 9 e 10 foram
--   desligados à mão durante o incidente e continuam como estiverem.
--   3. As funções sem trava própria rodam atrás de pg_try_advisory_xact_lock: se a
--      rodada anterior ainda estiver ativa, a nova sai na hora.
--      (tick, tick_catalogo e tick_contratos já têm trava própria.)
--   4. Intervalos maiores e horários desencontrados: tick a cada 1 min (era 20 s),
--      catálogo e push-agendado a cada 2 min; os de 5 e 10 min não caem mais
--      todos no mesmo minuto.
--
-- O tick é editado a partir de pg_get_functiondef trocando 2 trechos; se algum não
-- aparecer exatamente 1 vez, a migração para sem mudar nada.
-- Os jobs do Termômetro federal ficam com a migração 20261127120000.

do $$
declare
  def text := pg_get_functiondef('licitaflow_coleta.tick()'::regprocedure);
  trocas text[][] := array[
    array['editais_indexados=(select count(*) from public.oportunidades_indice),editais_com_itens=(select count(*) from public.oportunidades_indice where itens_completos),',
          'editais_indexados=greatest(0,(select c.reltuples::bigint from pg_catalog.pg_class c where c.oid=''public.oportunidades_indice''::regclass)),'],
    array['least(4-voo,24-janela)', 'least(8-voo,24-janela)']
  ];
  i integer;
  n integer;
begin
  for i in 1..array_length(trocas, 1) loop
    n := (length(def) - length(replace(def, trocas[i][1], ''))) / length(trocas[i][1]);
    if n = 0 and position(trocas[i][2] in def) > 0 then
      continue; -- já aplicada
    end if;
    if n <> 1 then
      raise exception 'tick(): trecho % aparece % vezes', i, n;
    end if;
    def := replace(def, trocas[i][1], trocas[i][2]);
  end loop;
  execute def;
end $$;

do $$
declare
  -- jobname, schedule, statement_timeout, chave da trava (null = a função já tem trava), comando
  j text[];
  jobs text[][] := array[
    array['licitaflow-coleta-oportunidades', '* * * * *',    '40s', null,       'select licitaflow_coleta.tick()'],
    array['licitaflow-catalogo-precos',      '*/2 * * * *',  '40s', null,       'select licitaflow_coleta.tick_catalogo()'],
    array['licitaflow-coleta-contratos',     '*/3 * * * *',  '40s', null,       'select licitaflow_coleta.tick_contratos()'],
    array['licitaflow-turso-coleta',         '* * * * *',    '15s', '73481050', 'select licitaflow_turso.disparar()'],
    array['licitaflow-pecas-juridicas',      '1-59/5 * * * *', '15s', '73481051', 'select licitaflow_juridico.disparar()'],
    array['licitaflow-push-agentes',         '2-59/5 * * * *', '30s', '73481052', 'select licitaflow_push_agentes.disparar()'],
    array['licitaflow-lembretes',            '3-59/5 * * * *', '30s', '73481053', 'select licitaflow_lembretes.disparar()'],
    array['licitaflow-sentinela',            '4-59/10 * * * *', '15s', '73481054', 'select licitaflow_sentinela.disparar()'],
    -- A limpeza levava 40 s em média (máx. 85 s) a cada hora, varrendo os encerrados
    -- contra oportunidades_itens_indice; passa a 4x por dia, com teto de 120 s.
    array['licitaflow-limpeza-catalogo',     '23 */6 * * *', '120s', '73481055','select licitaflow_coleta.limpar_catalogo()'],
    array['licitaflow-quadro-recomendacoes', '17 * * * *',   '40s', '73481056', 'select licitaflow_quadro.analisar()']
  ];
  cmd text;
  id bigint;
begin
  if to_regclass('cron.job') is null then return; end if;
  foreach j slice 1 in array jobs loop
    select jobid into id from cron.job where jobname = j[1];
    if id is null then continue; end if;
    cmd := format('set statement_timeout = %L; set lock_timeout = %L; ', j[3], '5s');
    if j[4] is null then
      cmd := cmd || j[5];
    else
      -- A função só roda se a trava estiver livre; a trava se solta no fim da rodada.
      cmd := cmd || j[5] || format(' from (select pg_try_advisory_xact_lock(%s) livre) t where t.livre', j[4]);
    end if;
    perform cron.alter_job(id, schedule := j[2], command := cmd);
  end loop;

  -- push-agendado: comando próprio (http_post só quando há aviso a enviar).
  select jobid, command into id, cmd from cron.job where jobname = 'licitaflow-push-agendado';
  if id is not null then
    if cmd not like 'set statement_timeout%' then
      cmd := 'set statement_timeout = ''15s''; set lock_timeout = ''5s''; ' || btrim(cmd);
    end if;
    perform cron.alter_job(id, schedule := '*/2 * * * *', command := cmd);
  end if;
end $$;
