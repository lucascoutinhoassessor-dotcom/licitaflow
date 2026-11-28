-- Asaas com duas contas guardadas: teste (sandbox) e produção. O master escolhe qual está em uso.
-- As colunas antigas (api_key_cifrada / webhook_token_cifrado) continuam espelhando o ambiente em uso,
-- para o código já publicado seguir funcionando até o deploy novo.
BEGIN;

alter table public.plataforma_gateways
  add column if not exists api_key_sandbox_cifrada text,
  add column if not exists api_key_production_cifrada text,
  add column if not exists webhook_token_sandbox_cifrado text,
  add column if not exists webhook_token_production_cifrado text;

create or replace function public.auditar_gateway() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ocultas text[] := array['api_key_cifrada','webhook_token_cifrado','api_key_sandbox_cifrada','api_key_production_cifrada','webhook_token_sandbox_cifrado','webhook_token_production_cifrado'];
begin
  insert into public.admin_audit(ator, acao, alvo, dados)
  values (auth.uid(), 'gateway.configurar', new.id, jsonb_build_object(
    'antes', to_jsonb(old) - v_ocultas,
    'depois', to_jsonb(new) - v_ocultas,
    'chave_alterada', old.api_key_cifrada is distinct from new.api_key_cifrada
      or old.api_key_sandbox_cifrada is distinct from new.api_key_sandbox_cifrada
      or old.api_key_production_cifrada is distinct from new.api_key_production_cifrada,
    'token_alterado', old.webhook_token_cifrado is distinct from new.webhook_token_cifrado
      or old.webhook_token_sandbox_cifrado is distinct from new.webhook_token_sandbox_cifrado
      or old.webhook_token_production_cifrado is distinct from new.webhook_token_production_cifrado));
  return null;
end; $$;
revoke execute on function public.auditar_gateway() from public, anon, authenticated;

-- A chave e o token atuais pertencem ao ambiente marcado hoje.
update public.plataforma_gateways set
  api_key_sandbox_cifrada = coalesce(api_key_sandbox_cifrada, case when ambiente = 'sandbox' then api_key_cifrada end),
  api_key_production_cifrada = coalesce(api_key_production_cifrada, case when ambiente = 'production' then api_key_cifrada end),
  webhook_token_sandbox_cifrado = coalesce(webhook_token_sandbox_cifrado, case when ambiente = 'sandbox' then webhook_token_cifrado end),
  webhook_token_production_cifrado = coalesce(webhook_token_production_cifrado, case when ambiente = 'production' then webhook_token_cifrado end)
where id = 'asaas';

create or replace function public.admin_gateway_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return (select jsonb_build_object('id', g.id, 'ativo', g.ativo, 'ambiente', g.ambiente,
      'tem_chave', g.api_key_cifrada is not null, 'tem_token', g.webhook_token_cifrado is not null,
      'ambientes', jsonb_build_object(
        'sandbox', jsonb_build_object('tem_chave', g.api_key_sandbox_cifrada is not null, 'tem_token', g.webhook_token_sandbox_cifrado is not null),
        'production', jsonb_build_object('tem_chave', g.api_key_production_cifrada is not null, 'tem_token', g.webhook_token_production_cifrado is not null)),
      'dias_tolerancia', g.dias_tolerancia, 'bloquear_inadimplente', g.bloquear_inadimplente,
      'conta_nome', g.conta_nome, 'testado_em', g.testado_em, 'updated_at', g.updated_at)
    from public.plataforma_gateways g where g.id = 'asaas');
end; $$;
revoke execute on function public.admin_gateway_status() from public, anon;
grant execute on function public.admin_gateway_status() to authenticated;

COMMIT;
