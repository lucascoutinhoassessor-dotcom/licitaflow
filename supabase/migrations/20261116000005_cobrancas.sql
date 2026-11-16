BEGIN;
-- Cobranças de serviços da plataforma: separadas das faturas dos contratos dos clientes.
create table public.plataforma_cobrancas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  descricao text not null check(length(trim(descricao)) between 3 and 200),
  valor_centavos integer not null check(valor_centavos between 100 and 100000000),
  vencimento date not null,
  gateway text not null check(gateway in ('stripe','asaas','mercadopago','infinitepay')),
  status text not null default 'rascunho' check(status in ('rascunho','gerando','pendente','paga','revisao')),
  gateway_id text,
  checkout_url text,
  confirmado_em timestamptz,
  verificado_em timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index plataforma_cobrancas_org_data on public.plataforma_cobrancas(org_id,created_at desc);
create unique index plataforma_gateway_id on public.plataforma_cobrancas(gateway,gateway_id) where gateway_id is not null;
alter table public.plataforma_cobrancas enable row level security;
create policy cobrancas_leitura on public.plataforma_cobrancas for select to authenticated
  using(public.is_platform_admin() or exists(select 1 from public.memberships m where m.org_id=plataforma_cobrancas.org_id and m.user_id=auth.uid() and m.papel in ('owner','admin')));
create trigger cobrancas_auditoria after insert or update on public.plataforma_cobrancas
  for each row execute function public.auditar_administracao();
grant select on public.plataforma_cobrancas to authenticated;
grant select,update on public.plataforma_cobrancas to service_role;

create function public.admin_criar_cobranca(p_org uuid,p_descricao text,p_valor_centavos integer,p_vencimento date,p_gateway text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
  perform public.exigir_admin();
  if p_vencimento < current_date or p_vencimento is null then raise exception 'Informe vencimento atual ou futuro'; end if;
  insert into public.plataforma_cobrancas(org_id,descricao,valor_centavos,vencimento,gateway,created_by)
    values(p_org,trim(p_descricao),p_valor_centavos,p_vencimento,p_gateway,auth.uid()) returning id into v;
  return v;
end; $$;
revoke execute on function public.admin_criar_cobranca(uuid,text,integer,date,text) from public,anon;
grant execute on function public.admin_criar_cobranca(uuid,text,integer,date,text) to authenticated;
COMMIT;
