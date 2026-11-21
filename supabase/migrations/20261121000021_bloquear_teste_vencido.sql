-- LicitaFlow · Teste grátis controlado pelo master: prazo em dias (vale para novos cadastros e aparece na
-- landing page) e bloqueio do acesso quando o teste vence sem plano contratado.
-- Reaproveita a suspensão: a rotina diária suspende a organização em teste vencido sem assinatura em vigor
-- (motivo "Teste grátis encerrado (automático)"). O pagamento confirmado pelo Asaas, ou o master estendendo
-- o teste ou trocando o plano, libera de novo. Suspensões manuais nunca são desfeitas automaticamente.
BEGIN;

alter table public.plataforma_politicas
  add column dias_teste integer not null default 14 check (dias_teste between 1 and 90),
  add column bloquear_teste_vencido boolean not null default true;

-- Prazo público do teste: lido pela landing page e pelo cadastro (sem login).
create function public.dias_teste_gratis() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select dias_teste from public.plataforma_politicas where id), 14);
$$;
revoke execute on function public.dias_teste_gratis() from public;
grant execute on function public.dias_teste_gratis() to anon, authenticated;
alter table public.organizations alter column trial_ate set default (current_date + public.dias_teste_gratis());

-- Altera o prazo (novos cadastros) e, se pedido, recalcula os testes em andamento a partir da data de cadastro.
create function public.admin_teste_gratis(p_dias integer, p_bloquear boolean, p_ajustar_atuais boolean default false) returns integer
language plpgsql security definer set search_path = '' as $fn$
declare v_n integer := 0;
begin
  perform public.exigir_admin();
  if p_dias is null or p_dias not between 1 and 90 then raise exception 'O teste grátis deve ter de 1 a 90 dias'; end if;
  update public.plataforma_politicas set dias_teste = p_dias, bloquear_teste_vencido = coalesce(p_bloquear, bloquear_teste_vencido) where id;
  if p_ajustar_atuais then
    update public.organizations set trial_ate = created_at::date + p_dias where plano = 'trial';
    get diagnostics v_n = row_count;
    insert into public.admin_audit(ator, acao, alvo, dados) values (auth.uid(), 'teste.ajustar_atuais', 'organizations', jsonb_build_object('dias', p_dias, 'contas', v_n));
  end if;
  return v_n;
end; $fn$;
revoke execute on function public.admin_teste_gratis(integer, boolean, boolean) from public, anon;
grant execute on function public.admin_teste_gratis(integer, boolean, boolean) to authenticated;

-- Status para o painel do master.
create function public.admin_teste_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.exigir_admin();
  return (select jsonb_build_object('dias', p.dias_teste, 'bloquear', p.bloquear_teste_vencido,
    'em_teste', (select count(*) from public.organizations where plano = 'trial' and trial_ate >= current_date and not suspensa),
    'bloqueadas', (select count(*) from public.organizations where suspensa and motivo_suspensao = 'Teste grátis encerrado (automático)'))
    from public.plataforma_politicas p where p.id);
end; $fn$;
revoke execute on function public.admin_teste_status() from public, anon;
grant execute on function public.admin_teste_status() to authenticated;

create or replace function public.processar_pagamento_asaas(p_evento text, p_pagamento jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  a public.assinaturas%rowtype;
  v_ref text := p_pagamento->>'externalReference';
  v_status text := public.asaas_status_fatura(p_evento, p_pagamento->>'status');
  v_valor integer := round(coalesce((p_pagamento->>'value')::numeric, 0) * 100);
  v_venc date := nullif(p_pagamento->>'dueDate','')::date;
  v_pago date := coalesce(nullif(p_pagamento->>'clientPaymentDate',''), nullif(p_pagamento->>'paymentDate',''), nullif(p_pagamento->>'confirmedDate',''))::date;
  v_ate date;
begin
  if p_pagamento->>'id' is null then return 'ignorado: pagamento sem id'; end if;
  if v_ref ~ '^[0-9a-f-]{36}$' then select * into a from public.assinaturas where id = v_ref::uuid; end if;
  if a.id is null and p_pagamento->>'subscription' is not null then
    select * into a from public.assinaturas where gateway = 'asaas' and gateway_assinatura_id = p_pagamento->>'subscription';
  end if;

  if a.id is null then
    -- Cobrança avulsa feita por link do Asaas: confere valor e link antes de dar baixa.
    if v_status = 'paga' and v_ref ~ '^[0-9a-f-]{36}$' then
      update public.plataforma_cobrancas c set status = 'paga', confirmado_em = now(), verificado_em = now()
        where c.id = v_ref::uuid and c.gateway = 'asaas' and c.status <> 'paga' and c.valor_centavos = v_valor
          and (c.gateway_id is null or c.gateway_id = p_pagamento->>'paymentLink');
      if found then return 'avulsa paga'; end if;
    end if;
    return 'ignorado: sem assinatura';
  end if;

  insert into public.assinatura_faturas(assinatura_id, org_id, gateway_pagamento_id, valor_centavos, valor_liquido_centavos, status, vencimento, pago_em, forma, link)
  values (a.id, a.org_id, p_pagamento->>'id', v_valor, round(nullif(p_pagamento->>'netValue','')::numeric * 100), v_status, v_venc,
          case when v_status = 'paga' then coalesce(v_pago::timestamptz, now()) end, p_pagamento->>'billingType', nullif(p_pagamento->>'invoiceUrl',''))
  on conflict (gateway_pagamento_id) do update set
    valor_centavos = excluded.valor_centavos, valor_liquido_centavos = coalesce(excluded.valor_liquido_centavos, assinatura_faturas.valor_liquido_centavos),
    -- Fatura paga só volta atrás por estorno ou exclusão; reenvios antigos não "despagam".
    status = case when assinatura_faturas.status = 'paga' and excluded.status in ('pendente','atrasada') then 'paga' else excluded.status end,
    vencimento = excluded.vencimento, pago_em = coalesce(excluded.pago_em, assinatura_faturas.pago_em),
    forma = excluded.forma, link = coalesce(excluded.link, assinatura_faturas.link);

  if a.status = 'cancelada' then return 'fatura registrada (assinatura cancelada)'; end if;

  if v_status = 'paga' then
    v_ate := case when a.ciclo = 'anual' then coalesce(v_venc, current_date) + interval '1 year' else coalesce(v_venc, current_date) + interval '1 month' end;
    update public.assinaturas set
      status = case when exists (select 1 from public.assinatura_faturas f where f.assinatura_id = a.id and f.status = 'atrasada') then 'atrasada' else 'ativa' end,
      pago_ate = greatest(coalesce(pago_ate, v_ate), v_ate), proximo_vencimento = v_ate, erro = null
      where id = a.id;
    -- Libera o acesso: aplica o plano e desfaz apenas a suspensão automática por atraso.
    update public.organizations set plano = a.plano_id,
      suspensa = case when motivo_suspensao in ('Pagamento em atraso (automático)','Teste grátis encerrado (automático)') then false else suspensa end,
      motivo_suspensao = case when motivo_suspensao in ('Pagamento em atraso (automático)','Teste grátis encerrado (automático)') then null else motivo_suspensao end
      where id = a.org_id;
    return 'acesso liberado';
  elsif v_status = 'atrasada' then
    update public.assinaturas set status = 'atrasada' where id = a.id and status in ('ativa','pendente');
    return 'em atraso';
  elsif v_status in ('cancelada','estornada') then
    update public.assinaturas set status = 'ativa'
      where id = a.id and status = 'atrasada' and not exists (select 1 from public.assinatura_faturas f where f.assinatura_id = a.id and f.status = 'atrasada');
    return 'fatura ' || v_status;
  end if;
  if a.proximo_vencimento is null or v_venc > a.proximo_vencimento then
    update public.assinaturas set proximo_vencimento = v_venc where id = a.id and (proximo_vencimento is null or proximo_vencimento < v_venc);
  end if;
  return 'fatura registrada';
end; $$;

create or replace function public.rotina_cobranca() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_dias integer; v_bloquear boolean; v_teste boolean; v_n integer := 0; v_m integer;
begin
  select dias_tolerancia, bloquear_inadimplente into v_dias, v_bloquear from public.plataforma_gateways where id = 'asaas';
  select bloquear_teste_vencido into v_teste from public.plataforma_politicas where id;
  -- Libera quem regularizou: teste estendido, plano trocado pelo master ou assinatura em vigor.
  update public.organizations o set suspensa = false, motivo_suspensao = null
    where o.suspensa and o.motivo_suspensao = 'Teste grátis encerrado (automático)'
      and (not coalesce(v_teste, false) or o.plano <> 'trial' or o.trial_ate >= current_date
           or exists (select 1 from public.assinaturas a where a.org_id = o.id and a.status in ('ativa','atrasada')));
  if coalesce(v_bloquear, false) then
    update public.organizations o set suspensa = true, motivo_suspensao = 'Pagamento em atraso (automático)'
      where not o.suspensa and exists (
        select 1 from public.assinaturas a join public.assinatura_faturas f on f.assinatura_id = a.id
        where a.org_id = o.id and a.status = 'atrasada' and f.status = 'atrasada' and f.vencimento < current_date - v_dias);
    get diagnostics v_m = row_count; v_n := v_n + v_m;
  end if;
  if coalesce(v_teste, false) then
    update public.organizations o set suspensa = true, motivo_suspensao = 'Teste grátis encerrado (automático)'
      where not o.suspensa and o.plano = 'trial' and o.trial_ate < current_date
        and not exists (select 1 from public.assinaturas a where a.org_id = o.id and a.status in ('ativa','atrasada'));
    get diagnostics v_m = row_count; v_n := v_n + v_m;
  end if;
  return v_n;
end; $$;

-- O master estende o teste ou troca o plano pela ficha: libera na hora, sem esperar a rotina.
create or replace function public.liberar_teste_regularizado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.suspensa and old.suspensa and new.motivo_suspensao = 'Teste grátis encerrado (automático)'
     and (new.plano <> 'trial' or new.trial_ate >= current_date) then
    new.suspensa := false; new.motivo_suspensao := null;
  end if;
  return new;
end; $$;
revoke execute on function public.liberar_teste_regularizado() from public, anon, authenticated;
create trigger organizations_liberar_teste before update on public.organizations
  for each row execute function public.liberar_teste_regularizado();

COMMIT;
