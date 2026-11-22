-- O banco do Supabase chegou a 472 MB de 500 MB (oportunidades_itens_indice: 148 MB). Os itens passaram a ser
-- coletados no Turso (server/turso.js), então o coletor do Postgres para de buscar itens.
-- Não mexe no tick: bloqueia os jobs de itens (o tick só pega "not bloqueado") e guarda quais foram, para religar.
-- As pesquisas do Postgres continuam usando os itens que já estão guardados.
--
-- Para religar:
--   drop trigger if exists jobs_itens_pausados on licitaflow_coleta.jobs;
--   update licitaflow_coleta.jobs j set bloqueado = false from licitaflow_turso.itens_pausados p where p.id = j.id;
--   delete from licitaflow_turso.itens_pausados;

create table if not exists licitaflow_turso.itens_pausados (id bigint primary key);
revoke all on licitaflow_turso.itens_pausados from public, anon, authenticated;

-- Jobs de itens novos (o coletor cria um quando um edital muda) já nascem bloqueados.
create or replace function licitaflow_turso.bloquear_job_itens() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'itens' and not new.bloqueado and not new.concluido then
    new.bloqueado := true;
    insert into licitaflow_turso.itens_pausados(id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function licitaflow_turso.bloquear_job_itens() from public, anon, authenticated;

drop trigger if exists jobs_itens_pausados on licitaflow_coleta.jobs;
create trigger jobs_itens_pausados before insert on licitaflow_coleta.jobs
  for each row execute function licitaflow_turso.bloquear_job_itens();

-- Os pendentes de agora (os que já estão em voo terminam normalmente).
with pausar as (
  update licitaflow_coleta.jobs set bloqueado = true
   where tipo = 'itens' and not concluido and not bloqueado and request_id is null
  returning id
)
insert into licitaflow_turso.itens_pausados(id) select id from pausar on conflict do nothing;
