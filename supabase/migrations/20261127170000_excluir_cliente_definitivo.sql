-- LicitaForce · Master: exclusão definitiva de uma organização (contas de teste).
--
-- A exclusão normal preserva a organização que tem histórico financeiro (assinaturas, faturas e cobranças
-- avulsas usam "on delete restrict" de propósito). Para testes do checkout, o master precisa apagar tudo
-- e liberar o e-mail. Esta função apaga o financeiro da organização e a própria organização (o restante
-- sai por "on delete cascade"). As assinaturas no Asaas são canceladas antes pelo servidor (api/pagamentos).
-- Só o master executa, e fica registrado em admin_audit.
BEGIN;

create or replace function public.admin_excluir_org_definitivo(p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_nome text; v_ass integer; v_fat integer; v_cob integer; r record;
begin
  perform public.exigir_admin();
  select nome into v_nome from public.organizations where id = p_org for update;
  if not found then raise exception 'Organização não encontrada'; end if;

  -- Cupons usados pela organização voltam a ter o uso disponível.
  for r in delete from public.cupom_resgates where org_id = p_org returning cupom loop
    update public.cupons set usos = greatest(usos - 1, 0) where codigo = r.cupom;
  end loop;
  delete from public.assinatura_faturas where org_id = p_org; get diagnostics v_fat = row_count;
  delete from public.assinaturas where org_id = p_org; get diagnostics v_ass = row_count;
  delete from public.plataforma_cobrancas where org_id = p_org; get diagnostics v_cob = row_count;
  delete from public.organizations where id = p_org;

  insert into public.admin_audit(ator, acao, alvo, dados) values (auth.uid(), 'org.excluir_definitivo', 'organizations',
    jsonb_build_object('org', p_org, 'nome', v_nome, 'assinaturas', v_ass, 'faturas', v_fat, 'cobrancas', v_cob));
  return jsonb_build_object('nome', v_nome, 'assinaturas', v_ass, 'faturas', v_fat, 'cobrancas', v_cob);
end; $$;

revoke execute on function public.admin_excluir_org_definitivo(uuid) from public, anon;
grant execute on function public.admin_excluir_org_definitivo(uuid) to authenticated;

COMMIT;
