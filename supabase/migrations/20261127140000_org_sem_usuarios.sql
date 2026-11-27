-- Organização que fica sem nenhum usuário (login excluído, último membro removido) é tratada na hora,
-- para Usuários e Organizações no master nunca divergirem:
--  * sem histórico de dinheiro → excluída junto com os dados (tentativas de checkout canceladas não contam);
--  * com faturas, cobranças ou assinatura paga/no gateway → fica, suspensa como "Sem usuários (automático)",
--    para preservar o financeiro (essas tabelas bloqueiam a exclusão de propósito).
BEGIN;
create or replace function public.org_sem_membros(p_org uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_nome text;
begin
  select nome into v_nome from public.organizations where id = p_org for update;
  if not found or exists (select 1 from public.memberships where org_id = p_org) then return null; end if;

  if exists (select 1 from public.assinatura_faturas where org_id = p_org)
     or exists (select 1 from public.plataforma_cobrancas where org_id = p_org)
     or exists (select 1 from public.assinaturas where org_id = p_org
                and (gateway_assinatura_id is not null or pago_ate is not null or status in ('ativa','atrasada'))) then
    update public.organizations set suspensa = true, motivo_suspensao = 'Sem usuários (automático)'
      where id = p_org and not (suspensa and motivo_suspensao = 'Sem usuários (automático)');
    insert into public.admin_audit(ator, acao, alvo, dados)
      values (auth.uid(), 'org.sem_usuarios_suspensa', 'organizations', jsonb_build_object('org', p_org, 'nome', v_nome));
    return 'suspensa';
  end if;

  begin
    delete from public.assinaturas where org_id = p_org;
    delete from public.organizations where id = p_org;
  exception when foreign_key_violation then
    -- Algum registro protegido ainda aponta para ela: suspende em vez de travar a exclusão do usuário.
    update public.organizations set suspensa = true, motivo_suspensao = 'Sem usuários (automático)' where id = p_org;
    insert into public.admin_audit(ator, acao, alvo, dados)
      values (auth.uid(), 'org.sem_usuarios_suspensa', 'organizations', jsonb_build_object('org', p_org, 'nome', v_nome));
    return 'suspensa';
  end;
  insert into public.admin_audit(ator, acao, alvo, dados)
    values (auth.uid(), 'org.sem_usuarios_excluida', 'organizations', jsonb_build_object('org', p_org, 'nome', v_nome));
  return 'excluida';
end; $$;
revoke execute on function public.org_sem_membros(uuid) from public, anon, authenticated;

create or replace function public.trg_org_sem_membros() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.org_sem_membros(old.org_id);
  return null;
end; $$;

drop trigger if exists org_sem_membros on public.memberships;
create trigger org_sem_membros after delete on public.memberships
  for each row execute function public.trg_org_sem_membros();

-- Acerta o que já ficou para trás.
select public.org_sem_membros(o.id) from public.organizations o
  where not exists (select 1 from public.memberships m where m.org_id = o.id);
COMMIT;
