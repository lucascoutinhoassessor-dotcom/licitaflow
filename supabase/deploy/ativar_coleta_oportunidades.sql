-- Executar somente após as migrações indice_oportunidades e coleta_oportunidades.
-- Sem chaves no navegador, sem serviço externo pago, sem acesso aos dados dos clientes.
begin;
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
revoke usage on schema net from public,anon,authenticated;
revoke execute on all functions in schema net from public,anon,authenticated;
grant usage on schema net to postgres;
grant execute on all functions in schema net to postgres;
grant select,delete on net._http_response,net.http_request_queue to postgres;
update licitaflow_coleta.estado set ativo=true,ultima_varredura_em=now() where id;
select cron.schedule('licitaflow-coleta-oportunidades','10 seconds','select licitaflow_coleta.tick();');
select licitaflow_coleta.tick();
commit;
