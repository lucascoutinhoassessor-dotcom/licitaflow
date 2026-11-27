-- Checkout transparente e oferta de teste opcional. Preserva os testes já concedidos.
BEGIN;
alter table public.plataforma_politicas add column teste_gratis_ativo boolean not null default true;
alter table public.assinatura_faturas add column pagamento_iniciado_em timestamptz;

create or replace function public.dias_teste_gratis() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when teste_gratis_ativo then dias_teste else 0 end from public.plataforma_politicas where id), 14);
$$;

-- A assinatura antiga com 3 parâmetros dá lugar à nova, sem ambiguidades no PostgREST.
drop function public.admin_teste_gratis(integer, boolean, boolean);
create function public.admin_teste_gratis(p_dias integer, p_bloquear boolean, p_ajustar_atuais boolean default false, p_ativo boolean default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; v_ativo boolean;
begin
  perform public.exigir_admin();
  if p_dias is null or p_dias not between 1 and 90 then raise exception 'O teste grátis deve ter de 1 a 90 dias'; end if;
  update public.plataforma_politicas set dias_teste=p_dias,
    bloquear_teste_vencido=coalesce(p_bloquear,bloquear_teste_vencido),
    teste_gratis_ativo=coalesce(p_ativo,teste_gratis_ativo) where id returning teste_gratis_ativo into v_ativo;
  if coalesce(p_ajustar_atuais,false) and v_ativo then
    update public.organizations set trial_ate=created_at::date+p_dias where plano='trial';
    get diagnostics v_n = row_count;
    insert into public.admin_audit(ator,acao,alvo,dados) values(auth.uid(),'teste.ajustar_atuais','organizations',jsonb_build_object('dias',p_dias,'contas',v_n));
  end if;
  insert into public.admin_audit(ator,acao,alvo,dados) values(auth.uid(),'teste.configurar','plataforma_politicas',jsonb_build_object('ativo',v_ativo,'dias',p_dias,'bloquear',p_bloquear));
  return v_n;
end; $$;
revoke execute on function public.admin_teste_gratis(integer,boolean,boolean,boolean) from public,anon;
grant execute on function public.admin_teste_gratis(integer,boolean,boolean,boolean) to authenticated;

create or replace function public.admin_teste_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return (select jsonb_build_object('ativo',p.teste_gratis_ativo,'dias',p.dias_teste,'bloquear',p.bloquear_teste_vencido,
    'em_teste',(select count(*) from public.organizations where plano='trial' and trial_ate>=current_date and not suspensa),
    'bloqueadas',(select count(*) from public.organizations where suspensa and motivo_suspensao='Teste grátis encerrado (automático)'))
    from public.plataforma_politicas p where p.id);
end; $$;

-- O bloqueio é aplicado no banco na criação, inclusive se alguém contornar a interface.
create or replace function public.criar_organizacao(p_nome text, p_tipo text default 'fornecedor') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_dias integer;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  v_dias := public.dias_teste_gratis();
  insert into public.organizations(nome,tipo,created_by,plano,trial_ate,suspensa,motivo_suspensao)
    values(trim(p_nome),p_tipo,auth.uid(),case when v_dias>0 then 'trial' else 'cancelado' end,
      current_date+case when v_dias>0 then v_dias else -1 end,v_dias=0,
      case when v_dias=0 then 'Contratação pendente (automático)' end) returning id into v_org;
  insert into public.memberships(org_id,user_id,papel) values(v_org,auth.uid(),'owner');
  return v_org;
end; $$;

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
      suspensa = case when motivo_suspensao in ('Pagamento em atraso (automático)','Teste grátis encerrado (automático)','Contratação pendente (automático)') then false else suspensa end,
      motivo_suspensao = case when motivo_suspensao in ('Pagamento em atraso (automático)','Teste grátis encerrado (automático)','Contratação pendente (automático)') then null else motivo_suspensao end
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


-- A liberação manual no master também funciona para quem nasceu sem teste.
create or replace function public.liberar_teste_regularizado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.suspensa and old.suspensa and new.motivo_suspensao in ('Teste grátis encerrado (automático)','Contratação pendente (automático)')
     and new.plano <> 'cancelado' and (new.plano <> 'trial' or new.trial_ate >= current_date) then
    new.suspensa := false; new.motivo_suspensao := null;
  end if;
  return new;
end; $$;
COMMIT;
