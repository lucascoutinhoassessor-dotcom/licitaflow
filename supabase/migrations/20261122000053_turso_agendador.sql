-- Agendador da coleta de dados brutos no Turso (server/turso.js).
-- O Supabase só dispara: a cada minuto o pg_cron chama /api/oportunidades?acao=turso-coletar na Vercel,
-- que lê o PNCP e grava o bruto no Turso. Nada de dado bruto passa pelo Postgres (plano Nano).
-- Fica desligado até o master ativar (docs/turso.md):
--   update licitaflow_turso.config set ativo = true, token = '<TURSO_COLETA_TOKEN>' where id;

create schema if not exists licitaflow_turso;
revoke all on schema licitaflow_turso from public, anon, authenticated;

create table licitaflow_turso.config (
  id     boolean primary key default true check (id),
  ativo  boolean not null default false,
  url    text not null default 'https://licitaflow-prod.vercel.app/api/oportunidades?acao=turso-coletar' check (url like 'https://%'),
  token  text check (token is null or length(token) between 32 and 200)
);
insert into licitaflow_turso.config default values on conflict do nothing;
revoke all on licitaflow_turso.config from public, anon, authenticated;

create function licitaflow_turso.disparar() returns boolean
language plpgsql security definer set search_path = '' as $$
declare c licitaflow_turso.config;
begin
  select * into c from licitaflow_turso.config where id;
  if not found or not c.ativo or c.token is null or to_regnamespace('net') is null then return false; end if;
  perform net.http_post(url := c.url, headers := jsonb_build_object('x-coleta', c.token, 'Content-Type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 60000);
  return true;
end $$;
revoke all on function licitaflow_turso.disparar() from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'licitaflow-turso-coleta';
    perform cron.schedule('licitaflow-turso-coleta', '* * * * *', 'select licitaflow_turso.disparar()');
  end if;
end $$;
