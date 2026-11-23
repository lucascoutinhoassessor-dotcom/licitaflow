-- Marca LicitaForce: os agendadores passam a chamar a API pelo endereço novo (licitaforce-app.vercel.app).
-- O endereço antigo continua no ar, então nada quebra se esta migração atrasar.

do $$
begin
  if to_regclass('licitaflow_juridico.config') is not null then
    alter table licitaflow_juridico.config alter column url set default 'https://licitaforce-app.vercel.app/api/juridico?acao=coletar';
    update licitaflow_juridico.config set url = replace(url, 'https://licitaflow-prod.vercel.app/', 'https://licitaforce-app.vercel.app/')
      where url like 'https://licitaflow-prod.vercel.app/%';
  end if;
  if to_regclass('licitaflow_sentinela.config') is not null then
    alter table licitaflow_sentinela.config alter column url set default 'https://licitaforce-app.vercel.app/api/agentes?agente=sentinela&acao=verificar';
    update licitaflow_sentinela.config set url = replace(url, 'https://licitaflow-prod.vercel.app/', 'https://licitaforce-app.vercel.app/')
      where url like 'https://licitaflow-prod.vercel.app/%';
  end if;
  if to_regclass('licitaflow_turso.config') is not null then
    alter table licitaflow_turso.config alter column url set default 'https://licitaforce-app.vercel.app/api/oportunidades?acao=turso-coletar';
    update licitaflow_turso.config set url = replace(url, 'https://licitaflow-prod.vercel.app/', 'https://licitaforce-app.vercel.app/')
      where url like 'https://licitaflow-prod.vercel.app/%';
  end if;
end; $$;

-- Push agendado: mesma regra de 20261121000031, só com o endereço novo.
do $$
begin
  if to_regclass('cron.job') is not null and to_regnamespace('net') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'licitaflow-push-agendado';
    perform cron.schedule('licitaflow-push-agendado', '* * * * *', $c$
      select net.http_post(
        url := 'https://licitaforce-app.vercel.app/api/push',
        body := '{"acao":"agendados"}'::jsonb,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 30000)
      where exists(select 1 from public.plataforma_avisos
                   where enviar_push and ativo and push_enviado_em is null
                     and publicar_em <= now() and publicar_em > now() - interval '1 day')
    $c$);
  end if;
end; $$;
