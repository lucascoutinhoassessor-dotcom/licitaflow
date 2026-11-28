-- Links das mensagens da IA apontavam para telas que não existem (404 ao tocar em "Abrir"):
-- /app/radar → /app/agentes/radar, /app/precos → /app/historico-precos, /app/cotador → /app/agentes/cotador.
-- Reescreve só esses trechos da função de texto e conserta o que já foi gravado no sino e na fila.
do $$
declare d text; novo text;
begin
  d := pg_get_functiondef('licitaflow_lembretes.texto_ia(jsonb, public.mensagens_ia_config, boolean, date)'::regprocedure);
  novo := replace(replace(replace(d,
    '''/app/radar''', '''/app/agentes/radar'''),
    '''/app/precos''', '''/app/historico-precos'''),
    '''/app/cotador''', '''/app/agentes/cotador''');
  if novo = d or novo like '%''/app/radar''%' or novo like '%''/app/precos''%' or novo like '%''/app/cotador''%' then
    raise exception 'Links da função texto_ia não encontrados para troca';
  end if;
  execute novo;
end $$;

update public.notificacoes set link = case link
    when '/app/radar' then '/app/agentes/radar' when '/app/precos' then '/app/historico-precos' when '/app/cotador' then '/app/agentes/cotador' end
  where link in ('/app/radar', '/app/precos', '/app/cotador');
update public.notificacoes_envios set link = case link
    when '/app/radar' then '/app/agentes/radar' when '/app/precos' then '/app/historico-precos' when '/app/cotador' then '/app/agentes/cotador' end
  where link in ('/app/radar', '/app/precos', '/app/cotador');
