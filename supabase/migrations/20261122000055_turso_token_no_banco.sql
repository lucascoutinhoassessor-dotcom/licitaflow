-- O token do agendador do Turso passa a existir só no banco: é gerado aqui (aleatório) e a Vercel confere
-- o cabeçalho x-coleta perguntando ao banco com a chave de serviço. Assim não há TURSO_COLETA_TOKEN para copiar.

create function public.turso_conferir_token(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.ativo and c.token is not null and c.token = p_token from licitaflow_turso.config c where c.id), false);
$$;
create function public.turso_coleta_ativa() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.ativo and c.token is not null from licitaflow_turso.config c where c.id), false);
$$;
revoke execute on function public.turso_conferir_token(text), public.turso_coleta_ativa() from public, anon, authenticated;
grant execute on function public.turso_conferir_token(text), public.turso_coleta_ativa() to service_role;

-- Gera o token (sem ligar a coleta). Para ligar: update licitaflow_turso.config set ativo = true where id;
update licitaflow_turso.config set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where id and token is null;
