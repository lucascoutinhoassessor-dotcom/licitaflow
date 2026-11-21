-- LicitaFlow · Assinaturas recorrentes pelo Asaas, faturas, webhook e controle de inadimplência.
-- O master configura o Asaas pelo painel (chave e token cifrados no servidor; o navegador nunca lê).
-- O webhook do Asaas grava faturas, libera o acesso ao pagar e marca atraso; a rotina diária suspende
-- quem passou da tolerância. Suspensão manual do master nunca é desfeita por um pagamento.
BEGIN;

-- ---------------------------------------------------------------------------
-- Credenciais e regras do gateway (somente o servidor lê os campos cifrados)
-- ---------------------------------------------------------------------------
create table public.plataforma_gateways (
  id text primary key check (id in ('asaas')),
  ativo boolean not null default false,
  ambiente text not null default 'sandbox' check (ambiente in ('sandbox','production')),
  api_key_cifrada text,
  webhook_token_cifrado text,
  dias_tolerancia integer not null default 5 check (dias_tolerancia between 0 and 60),
  bloquear_inadimplente boolean not null default true,
  conta_nome text,
  testado_em timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.plataforma_gateways(id) values ('asaas');
alter table public.plataforma_gateways enable row level security;
-- Sem políticas: clientes e master não leem a tabela diretamente. O status sai por admin_gateway_status().
grant select, insert, update on public.plataforma_gateways to service_role;
-- Auditoria sem os campos cifrados: registra apenas que a chave/token mudou.
create function public.auditar_gateway() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_audit(ator, acao, alvo, dados)
  values (auth.uid(), 'gateway.configurar', new.id, jsonb_build_object(
    'antes', to_jsonb(old) - 'api_key_cifrada' - 'webhook_token_cifrado',
    'depois', to_jsonb(new) - 'api_key_cifrada' - 'webhook_token_cifrado',
    'chave_alterada', old.api_key_cifrada is distinct from new.api_key_cifrada,
    'token_alterado', old.webhook_token_cifrado is distinct from new.webhook_token_cifrado));
  return null;
end; $$;
revoke execute on function public.auditar_gateway() from public, anon, authenticated;
create trigger gateways_audit after update on public.plataforma_gateways
  for each row execute function public.auditar_gateway();

create function public.admin_gateway_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return (select jsonb_build_object('id', g.id, 'ativo', g.ativo, 'ambiente', g.ambiente,
      'tem_chave', g.api_key_cifrada is not null, 'tem_token', g.webhook_token_cifrado is not null,
      'dias_tolerancia', g.dias_tolerancia, 'bloquear_inadimplente', g.bloquear_inadimplente,
      'conta_nome', g.conta_nome, 'testado_em', g.testado_em, 'updated_at', g.updated_at)
    from public.plataforma_gateways g where g.id = 'asaas');
end; $$;

-- Regras de cobrança que não envolvem segredo: o master altera direto pelo banco.
create function public.admin_regras_cobranca(p_dias integer, p_bloquear boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  update public.plataforma_gateways set dias_tolerancia = p_dias, bloquear_inadimplente = p_bloquear, updated_at = now() where id = 'asaas';
end; $$;

-- ---------------------------------------------------------------------------
-- Assinaturas e faturas
-- ---------------------------------------------------------------------------
create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  plano_id text not null references public.plataforma_planos(id),
  ciclo text not null check (ciclo in ('mensal','anual')),
  valor_centavos integer not null check (valor_centavos between 100 and 1000000000),
  forma text not null default 'UNDEFINED' check (forma in ('UNDEFINED','BOLETO','PIX','CREDIT_CARD')),
  status text not null default 'pendente' check (status in ('pendente','ativa','atrasada','cancelada')),
  gateway text not null default 'asaas' check (gateway in ('asaas')),
  gateway_cliente_id text,
  gateway_assinatura_id text,
  documento text check (documento ~ '^([0-9]{11}|[0-9]{14})$'),
  proximo_vencimento date,
  pago_ate date,
  link_pagamento text check (link_pagamento is null or link_pagamento like 'https://%'),
  reservado_em timestamptz,
  erro text,
  cancelada_em timestamptz,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create unique index assinaturas_gateway_id on public.assinaturas(gateway, gateway_assinatura_id) where gateway_assinatura_id is not null;
-- No máximo uma assinatura em vigor por organização.
create unique index assinaturas_uma_por_org on public.assinaturas(org_id) where status <> 'cancelada';
create index assinaturas_status on public.assinaturas(status, proximo_vencimento);
create trigger assinaturas_updated_at before update on public.assinaturas for each row execute function public.set_updated_at();
create trigger assinaturas_audit after insert or update on public.assinaturas for each row execute function public.auditar_administracao();

create table public.assinatura_faturas (
  id uuid primary key default gen_random_uuid(),
  assinatura_id uuid not null references public.assinaturas(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  gateway_pagamento_id text not null unique,
  valor_centavos integer not null check (valor_centavos >= 0),
  valor_liquido_centavos integer check (valor_liquido_centavos >= 0),
  status text not null check (status in ('pendente','paga','atrasada','cancelada','estornada')),
  vencimento date,
  pago_em timestamptz,
  forma text,
  link text check (link is null or link like 'https://%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index faturas_org on public.assinatura_faturas(org_id, vencimento desc);
create index faturas_status on public.assinatura_faturas(status, vencimento);
create trigger faturas_updated_at before update on public.assinatura_faturas for each row execute function public.set_updated_at();

-- Eventos recebidos do gateway: idempotência e histórico para o master.
create table public.gateway_eventos (
  id text primary key,
  gateway text not null default 'asaas',
  evento text not null,
  recebido_em timestamptz not null default now(),
  resultado text,
  payload jsonb not null default '{}'::jsonb
);
create index gateway_eventos_data on public.gateway_eventos(recebido_em desc);

alter table public.assinaturas enable row level security;
alter table public.assinatura_faturas enable row level security;
alter table public.gateway_eventos enable row level security;

-- Dono e administradores enxergam a assinatura mesmo com a conta suspensa (para regularizar).
create function public.pode_gerir_cobranca(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.papel in ('owner','admin'));
$$;
create policy assinaturas_leitura on public.assinaturas for select to authenticated using (public.pode_gerir_cobranca(org_id));
create policy faturas_leitura on public.assinatura_faturas for select to authenticated using (public.pode_gerir_cobranca(org_id));
create policy eventos_leitura on public.gateway_eventos for select to authenticated using (public.is_platform_admin());
grant select on public.assinaturas, public.assinatura_faturas, public.gateway_eventos to authenticated;
grant select, insert, update on public.assinaturas, public.assinatura_faturas, public.gateway_eventos to service_role;
grant delete on public.gateway_eventos to service_role;

-- Prepara a assinatura: confere permissão e calcula o valor pelo catálogo (nunca pelo navegador).
-- O servidor cria cliente e assinatura no Asaas em seguida e grava os identificadores.
create function public.preparar_assinatura(p_org uuid, p_plano text, p_ciclo text, p_forma text, p_documento text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_valor integer; v_ativo boolean; v_doc text := regexp_replace(coalesce(p_documento,''), '\D', '', 'g');
begin
  if not public.pode_gerir_cobranca(p_org) then raise exception 'Somente o dono ou um administrador da organização contrata o plano'; end if;
  if p_ciclo not in ('mensal','anual') then raise exception 'Ciclo inválido'; end if;
  if p_forma not in ('UNDEFINED','BOLETO','PIX','CREDIT_CARD') then raise exception 'Forma de pagamento inválida'; end if;
  if length(v_doc) not in (11,14) then raise exception 'Informe CPF ou CNPJ válido para a cobrança'; end if;
  select case when p_ciclo = 'anual' then p.anual_centavos else p.mensal_centavos end, p.ativo into v_valor, v_ativo
    from public.plataforma_planos p where p.id = p_plano and p.id not in ('trial','cancelado');
  if v_valor is null then raise exception 'Plano indisponível'; end if;
  if not v_ativo and not public.is_platform_admin() then raise exception 'Plano indisponível'; end if;
  if v_valor < 100 then raise exception 'Plano sem valor para cobrança'; end if;
  if exists (select 1 from public.assinaturas a where a.org_id = p_org and a.status <> 'cancelada'
             and (a.gateway_assinatura_id is not null or a.reservado_em > now() - interval '2 minutes')) then
    raise exception 'Já existe uma assinatura em vigor. Troque o plano ou cancele a atual.';
  end if;
  -- Rascunho abandonado (sem assinatura criada no gateway) dá lugar ao novo pedido.
  update public.assinaturas set status = 'cancelada', cancelada_em = now(), motivo_cancelamento = 'Substituída por novo pedido'
    where org_id = p_org and status <> 'cancelada' and gateway_assinatura_id is null;
  insert into public.assinaturas(org_id, plano_id, ciclo, valor_centavos, forma, documento, created_by)
    values (p_org, p_plano, p_ciclo, v_valor, p_forma, v_doc, auth.uid()) returning id into v_id;
  return v_id;
end; $$;

-- Mapeia o status do pagamento no Asaas para a fatura.
create function public.asaas_status_fatura(p_evento text, p_status text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_evento = 'PAYMENT_DELETED' then 'cancelada'
    when p_evento in ('PAYMENT_REFUNDED','PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_PARTIALLY_REFUNDED') then 'estornada'
    when p_evento in ('PAYMENT_CONFIRMED','PAYMENT_RECEIVED','PAYMENT_RECEIVED_IN_CASH') then 'paga'
    when p_evento = 'PAYMENT_OVERDUE' then 'atrasada'
    when p_status in ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH') then 'paga'
    when p_status = 'OVERDUE' then 'atrasada'
    when p_status in ('REFUNDED','REFUND_REQUESTED','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL') then 'estornada'
    when p_status = 'DELETED' then 'cancelada'
    else 'pendente' end;
$$;

-- Processa um pagamento recebido do Asaas (webhook ou sincronização). Somente o servidor chama.
create function public.processar_pagamento_asaas(p_evento text, p_pagamento jsonb) returns text
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
      suspensa = case when motivo_suspensao = 'Pagamento em atraso (automático)' then false else suspensa end,
      motivo_suspensao = case when motivo_suspensao = 'Pagamento em atraso (automático)' then null else motivo_suspensao end
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

-- Assinatura encerrada no Asaas (excluída/inativada pelo painel do provedor).
create function public.encerrar_assinatura_gateway(p_gateway_id text, p_motivo text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  update public.assinaturas set status = 'cancelada', cancelada_em = now(), motivo_cancelamento = left(coalesce(p_motivo,'Encerrada no gateway'), 300)
    where gateway = 'asaas' and gateway_assinatura_id = p_gateway_id and status <> 'cancelada';
  return case when found then 'assinatura encerrada' else 'ignorado' end;
end; $$;

-- Rotina diária: suspende quem passou da tolerância. Retorna quantas contas foram suspensas.
create function public.rotina_cobranca() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_dias integer; v_bloquear boolean; v_n integer;
begin
  select dias_tolerancia, bloquear_inadimplente into v_dias, v_bloquear from public.plataforma_gateways where id = 'asaas';
  if not coalesce(v_bloquear, false) then return 0; end if;
  update public.organizations o set suspensa = true, motivo_suspensao = 'Pagamento em atraso (automático)'
    where not o.suspensa and exists (
      select 1 from public.assinaturas a join public.assinatura_faturas f on f.assinatura_id = a.id
      where a.org_id = o.id and a.status = 'atrasada' and f.status = 'atrasada' and f.vencimento < current_date - v_dias);
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

create function public.admin_rotina_cobranca() returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  perform public.exigir_admin();
  v := public.rotina_cobranca();
  insert into public.admin_audit(ator, acao, alvo, dados) values (auth.uid(), 'cobranca.rotina', 'assinaturas', jsonb_build_object('suspensas', v));
  return v;
end; $$;

-- ---------------------------------------------------------------------------
-- Painéis do master
-- ---------------------------------------------------------------------------
create function public.admin_financeiro() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_mrr bigint; v_ativas bigint;
begin
  perform public.exigir_admin();
  select coalesce(sum(case when ciclo = 'anual' then valor_centavos / 12.0 else valor_centavos end), 0)::bigint, count(*)
    into v_mrr, v_ativas from public.assinaturas where status = 'ativa';
  return jsonb_build_object(
    'mrr', v_mrr,
    'arr', v_mrr * 12,
    'ticket_medio', case when v_ativas > 0 then v_mrr / v_ativas else 0 end,
    'mrr_em_risco', (select coalesce(sum(case when ciclo = 'anual' then valor_centavos / 12.0 else valor_centavos end), 0)::bigint from public.assinaturas where status = 'atrasada'),
    'assinaturas', (select jsonb_build_object(
        'ativas', count(*) filter (where status = 'ativa'), 'atrasadas', count(*) filter (where status = 'atrasada'),
        'pendentes', count(*) filter (where status = 'pendente' and gateway_assinatura_id is not null),
        'canceladas_30d', count(*) filter (where status = 'cancelada' and cancelada_em > now() - interval '30 days' and gateway_assinatura_id is not null),
        'novas_30d', count(*) filter (where created_at > now() - interval '30 days' and status in ('ativa','atrasada')))
      from public.assinaturas),
    'recebido_mes', (select coalesce(sum(valor_centavos), 0) from public.assinatura_faturas where status = 'paga' and pago_em >= date_trunc('month', now()))
      + (select coalesce(sum(valor_centavos), 0) from public.plataforma_cobrancas where status = 'paga' and confirmado_em >= date_trunc('month', now())),
    'liquido_mes', (select coalesce(sum(coalesce(valor_liquido_centavos, valor_centavos)), 0) from public.assinatura_faturas where status = 'paga' and pago_em >= date_trunc('month', now())),
    'a_receber', (select coalesce(sum(valor_centavos), 0) from public.assinatura_faturas where status = 'pendente'),
    'inadimplente', (select coalesce(sum(valor_centavos), 0) from public.assinatura_faturas where status = 'atrasada'),
    'clientes_inadimplentes', (select count(distinct org_id) from public.assinatura_faturas where status = 'atrasada'),
    'suspensas_por_atraso', (select count(*) from public.organizations where suspensa and motivo_suspensao = 'Pagamento em atraso (automático)'),
    'receita_12m', (select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'),
        'assinaturas', (select coalesce(sum(valor_centavos), 0) from public.assinatura_faturas f where f.status = 'paga' and date_trunc('month', f.pago_em) = m),
        'avulsas', (select coalesce(sum(valor_centavos), 0) from public.plataforma_cobrancas c where c.status = 'paga' and date_trunc('month', c.confirmado_em) = m)) order by m), '[]'::jsonb)
      from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m),
    'por_plano', (select coalesce(jsonb_agg(x order by x.mrr desc), '[]'::jsonb) from (
        select p.id plano, p.nome, count(a.id) ativas,
          coalesce(sum(case when a.ciclo = 'anual' then a.valor_centavos / 12.0 else a.valor_centavos end), 0)::bigint mrr
        from public.plataforma_planos p join public.assinaturas a on a.plano_id = p.id and a.status = 'ativa' group by p.id, p.nome) x),
    'trials', (select jsonb_build_object('ativos', count(*) filter (where trial_ate >= current_date),
        'vencendo_7d', count(*) filter (where trial_ate between current_date and current_date + 7),
        'vencidos_sem_plano', count(*) filter (where trial_ate < current_date))
      from public.organizations o where o.plano = 'trial' and not o.suspensa
        and not exists (select 1 from public.assinaturas a where a.org_id = o.id and a.status in ('ativa','atrasada'))),
    'gateway', (select jsonb_build_object('ativo', ativo, 'ambiente', ambiente, 'dias_tolerancia', dias_tolerancia, 'bloquear_inadimplente', bloquear_inadimplente)
      from public.plataforma_gateways where id = 'asaas')
  );
end; $$;

create function public.admin_assinaturas() returns table (
  id uuid, org_id uuid, org_nome text, dono_email text, plano_id text, plano_nome text, ciclo text, valor_centavos integer,
  forma text, status text, proximo_vencimento date, pago_ate date, link_pagamento text, gateway_assinatura_id text,
  erro text, created_at timestamptz, cancelada_em timestamptz, faturas_atrasadas bigint, total_pago bigint, suspensa boolean
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return query
  select a.id, a.org_id, o.nome, (select u.email::text from public.memberships m join auth.users u on u.id = m.user_id where m.org_id = o.id and m.papel = 'owner' limit 1),
    a.plano_id, p.nome, a.ciclo, a.valor_centavos, a.forma, a.status, a.proximo_vencimento, a.pago_ate, a.link_pagamento, a.gateway_assinatura_id,
    a.erro, a.created_at, a.cancelada_em,
    (select count(*) from public.assinatura_faturas f where f.assinatura_id = a.id and f.status = 'atrasada'),
    (select coalesce(sum(f.valor_centavos), 0)::bigint from public.assinatura_faturas f where f.assinatura_id = a.id and f.status = 'paga'),
    o.suspensa
  from public.assinaturas a join public.organizations o on o.id = a.org_id join public.plataforma_planos p on p.id = a.plano_id
  where a.gateway_assinatura_id is not null or a.status <> 'cancelada'
  order by case a.status when 'atrasada' then 0 when 'pendente' then 1 when 'ativa' then 2 else 3 end, a.created_at desc
  limit 500;
end; $$;

-- Melhores clientes: receita paga, tempo de casa e uso real da plataforma.
create function public.admin_ranking_clientes() returns table (
  org_id uuid, nome text, plano text, total_pago bigint, meses_pagos bigint, processos bigint, usuarios bigint,
  ultimo_acesso timestamptz, assinatura_status text, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return query
  select o.id, o.nome, o.plano,
    ((select coalesce(sum(f.valor_centavos), 0) from public.assinatura_faturas f where f.org_id = o.id and f.status = 'paga')
      + (select coalesce(sum(c.valor_centavos), 0) from public.plataforma_cobrancas c where c.org_id = o.id and c.status = 'paga'))::bigint,
    (select count(*) from public.assinatura_faturas f where f.org_id = o.id and f.status = 'paga'),
    (select count(*) from public.processos x where x.org_id = o.id),
    (select count(*) from public.memberships m where m.org_id = o.id),
    (select max(u.last_sign_in_at) from public.memberships m join auth.users u on u.id = m.user_id where m.org_id = o.id),
    (select a.status from public.assinaturas a where a.org_id = o.id order by (a.status = 'cancelada'), a.created_at desc limit 1),
    o.created_at
  from public.organizations o
  order by 4 desc, 6 desc, o.created_at
  limit 100;
end; $$;

-- Agenda a rotina diária às 8h de Brasília (11h UTC), só onde o pg_cron existe.
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'licitaflow-rotina-cobranca';
    perform cron.schedule('licitaflow-rotina-cobranca', '0 11 * * *', 'select public.rotina_cobranca()');
  end if;
end $$;

revoke execute on function public.admin_gateway_status() from public, anon;
revoke execute on function public.admin_regras_cobranca(integer, boolean) from public, anon;
revoke execute on function public.pode_gerir_cobranca(uuid) from public, anon;
revoke execute on function public.preparar_assinatura(uuid, text, text, text, text) from public, anon;
revoke execute on function public.processar_pagamento_asaas(text, jsonb) from public, anon, authenticated;
revoke execute on function public.encerrar_assinatura_gateway(text, text) from public, anon, authenticated;
revoke execute on function public.rotina_cobranca() from public, anon, authenticated;
revoke execute on function public.admin_rotina_cobranca() from public, anon;
revoke execute on function public.admin_financeiro() from public, anon;
revoke execute on function public.admin_assinaturas() from public, anon;
revoke execute on function public.admin_ranking_clientes() from public, anon;
grant execute on function public.admin_gateway_status(), public.admin_regras_cobranca(integer, boolean), public.pode_gerir_cobranca(uuid),
  public.preparar_assinatura(uuid, text, text, text, text), public.admin_rotina_cobranca(), public.admin_financeiro(),
  public.admin_assinaturas(), public.admin_ranking_clientes() to authenticated;
grant execute on function public.processar_pagamento_asaas(text, jsonb), public.encerrar_assinatura_gateway(text, text),
  public.rotina_cobranca(), public.pode_gerir_cobranca(uuid) to service_role;

COMMIT;
