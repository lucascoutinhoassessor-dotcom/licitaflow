-- O resumo diário das IAs (push das 8h) também fica no sino: quando o primeiro aparelho de uma pessoa
-- confirma a entrega, entra uma notificação para ela naquele dia (a fila tem uma linha por aparelho).
-- Radar e Sentinela registram no sino pelo servidor (server/pushAgentes.js → registrarNoSino).
create function licitaflow_push_agentes.resumo_no_sino() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.enviado_em is not null and old.enviado_em is null and not exists (
    select 1 from public.notificacoes n
    where n.user_id = new.user_id and n.org_id = new.org_id and n.tipo = 'agentes'
      and n.created_at >= (new.dia::timestamp at time zone 'America/Sao_Paulo')
  ) then
    insert into public.notificacoes(org_id, user_id, tipo, titulo, mensagem, link)
    values (new.org_id, new.user_id, 'agentes', left(coalesce(new.payload->>'titulo', 'Suas IAs'), 120),
      left(coalesce(new.payload->>'texto', ''), 1000), coalesce(new.payload->>'url', '/app/agentes'));
  end if;
  return new;
end $$;
revoke execute on function licitaflow_push_agentes.resumo_no_sino() from public, anon, authenticated;
create trigger fila_resumo_no_sino after update of enviado_em on licitaflow_push_agentes.fila
  for each row execute function licitaflow_push_agentes.resumo_no_sino();
