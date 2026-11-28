-- Localizar edital: a busca por número dava "Não foi possível localizar o edital" (27/11/2026).
--
-- A função era SECURITY INVOKER. Com a RLS de oportunidades_indice (política oportunidades_ler), o Postgres não usa
-- índices de expressão cujas funções não são "leakproof" (regexp_replace, split_part, substring, ->>). Medido na
-- produção como authenticated: Seq Scan nos ~59 mil editais, com regexp sobre o JSON de cada um, em cada uma das partes
-- da busca. Passava dos 8 s (statement_timeout do papel authenticated) e o app mostrava o erro genérico.
-- Como postgres, o mesmo plano usa oportunidades_numero_compra, oportunidades_codigo_origem e oportunidades_uasg.
--
-- A função passa a rodar como dona (SECURITY DEFINER). A checagem da política continua dentro dela: auth.uid() is
-- null → 'Autenticação necessária'. search_path já é '' e só authenticated pode executar.
alter function public.localizar_edital(text, text) security definer;
revoke all on function public.localizar_edital(text, text) from public, anon;
grant execute on function public.localizar_edital(text, text) to authenticated;
