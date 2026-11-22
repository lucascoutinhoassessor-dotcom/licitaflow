-- LicitaFlow · Exclusão de planos do catálogo pelo master.
-- Só exclui planos sem uso: nenhuma organização no plano e nenhuma assinatura (de qualquer status) apontando para ele.
-- 'trial' e 'cancelado' são planos do sistema e nunca podem ser excluídos. A exclusão fica na auditoria.
BEGIN;

drop trigger if exists planos_audit on public.plataforma_planos;
create trigger planos_audit after insert or update or delete on public.plataforma_planos
  for each row execute function public.auditar_administracao();

create function public.admin_excluir_plano(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_orgs bigint; v_assinaturas bigint;
begin
  perform public.exigir_admin();
  if p_id in ('trial', 'cancelado') then
    raise exception 'O plano "%" é do sistema e não pode ser excluído.', p_id;
  end if;
  -- Trava o plano para que ninguém o contrate enquanto a exclusão acontece.
  perform 1 from public.plataforma_planos where id = p_id for update;
  if not found then raise exception 'Plano não encontrado.'; end if;
  select count(*) into v_orgs from public.organizations where plano = p_id;
  select count(*) into v_assinaturas from public.assinaturas where plano_id = p_id;
  if v_orgs > 0 or v_assinaturas > 0 then
    raise exception 'Plano em uso (% cliente(s), % assinatura(s) no histórico). Mova os clientes para outro plano ou apenas oculte este plano.', v_orgs, v_assinaturas;
  end if;
  delete from public.plataforma_planos where id = p_id;
end; $$;

revoke execute on function public.admin_excluir_plano(text) from public, anon;
grant execute on function public.admin_excluir_plano(text) to authenticated;

COMMIT;
