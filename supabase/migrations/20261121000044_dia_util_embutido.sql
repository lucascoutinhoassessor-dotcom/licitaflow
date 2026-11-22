-- LicitaFlow · "Só dias úteis" deixava a busca de oportunidades passar do limite de 8 s (erro 57014).
-- A função tinha "set search_path" e um FROM, e o Postgres não embute funções assim: ela era
-- chamada linha a linha. Medido na produção em 21/11/2026, para as ~38 mil abertas:
-- 1.958 ms com a função antiga, 89 ms com a mesma regra escrita como expressão.
-- Agora o corpo é uma única expressão, sem SET, e o planejador a embute na consulta.
-- Só usa funções e operadores do pg_catalog, que vem sempre antes no search_path.
create or replace function public.oportunidades_dia_util(p timestamptz) returns boolean
language sql stable parallel safe as $$
 select extract(isodow from (p at time zone 'America/Sao_Paulo')) between 1 and 5
    and to_char(p at time zone 'America/Sao_Paulo','MM-DD') <> all('{01-01,04-21,05-01,09-07,10-12,11-02,11-15,11-20,12-25}'::text[])
$$;
alter function public.oportunidades_dia_util(timestamptz) reset all;
revoke all on function public.oportunidades_dia_util(timestamptz) from public,anon;
grant execute on function public.oportunidades_dia_util(timestamptz) to authenticated;
