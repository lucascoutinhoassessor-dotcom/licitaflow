-- LicitaFlow · Palavra-chave na busca de oportunidades usando o índice GIN.
-- Depois da migration 45, "notebook" levava 1,1 s como postgres, mas estourava 8 s (57014) pelo app.
-- Motivo: com RLS, o Postgres não usa como condição de índice um operador que não é "leakproof"
-- (o @@ do tsvector não é). Para o role authenticated a busca por termo virava seq scan da tabela inteira,
-- lendo o tsvector de cada linha. As políticas dessas tabelas só exigem usuário logado, então esta função
-- (security definer, mesma exigência de login) devolve os controles que casam com o termo pelo índice.

create or replace function public.oportunidades_controles_termos(p_q tsquery,p_itens boolean) returns setof text
language sql stable security definer set search_path='' rows 500 as $$
 select controle from public.oportunidades_indice where p_q is not null and (select auth.uid()) is not null and busca @@ p_q
 union
 select controle from public.oportunidades_indice where p_itens and p_q is not null and (select auth.uid()) is not null and busca_itens @@ p_q
$$;
revoke all on function public.oportunidades_controles_termos(tsquery,boolean) from public,anon;
grant execute on function public.oportunidades_controles_termos(tsquery,boolean) to authenticated;

-- Troca só os dois trechos de busca por termo, partindo da definição que está no banco
-- (a produção guarda o corpo sem os comentários). Para se algum trecho não aparecer exatamente uma vez.
do $migra$
declare d text:=pg_get_functiondef('public.buscar_oportunidades(jsonb,integer,integer)'::regprocedure);
 a1 text:='select controle from public.oportunidades_indice where busca @@ q
  union select controle from public.oportunidades_indice where busca_itens @@ q';
 -- "t(controle)": uma função setof text devolve a coluna com o nome da própria função.
 b1 text:='select controle from public.oportunidades_controles_termos(q,true) t(controle)';
 a2 text:='select controle from public.oportunidades_indice where q_ex is not null and busca @@ q_ex';
 b2 text:='select controle from public.oportunidades_controles_termos(q_ex,false) t(controle)';
begin
 if (length(d)-length(replace(d,a1,'')))/length(a1)<>1 then raise exception 'trecho de candidatos não encontrado exatamente uma vez';end if;
 if (length(d)-length(replace(d,a2,'')))/length(a2)<>1 then raise exception 'trecho de excluídos não encontrado exatamente uma vez';end if;
 execute replace(replace(d,a1,b1),a2,b2);
end $migra$;
