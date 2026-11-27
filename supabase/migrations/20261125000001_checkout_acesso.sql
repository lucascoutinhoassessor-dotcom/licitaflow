-- Bloqueio efetivo por data, independente do cron; zero dias desativa novos testes.
BEGIN;
alter table public.plataforma_politicas drop constraint plataforma_politicas_dias_teste_check;
alter table public.plataforma_politicas add constraint plataforma_politicas_dias_teste_check check (dias_teste between 0 and 90);
update public.plataforma_politicas set bloquear_teste_vencido = true where id;

create or replace function public.teste_encerrado(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organizations o cross join public.plataforma_politicas p
    where o.id = p_org and p.id and o.plano = 'trial'
      and o.trial_ate < (now() at time zone 'America/Sao_Paulo')::date
      and (p.bloquear_teste_vencido or p.dias_teste = 0)
      and not exists (select 1 from public.assinaturas a where a.org_id = o.id
        and a.status in ('ativa','atrasada') and a.pago_ate >= (now() at time zone 'America/Sao_Paulo')::date)
  );
$$;
revoke all on function public.teste_encerrado(uuid) from public, anon;
grant execute on function public.teste_encerrado(uuid) to authenticated;

create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.organizations o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid() and not o.suspensa and not public.teste_encerrado(o.id));
$$;
create or replace function public.has_role(p_org uuid, p_papeis text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.organizations o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid() and m.papel = any(p_papeis)
      and not o.suspensa and not public.teste_encerrado(o.id));
$$;

-- Retorna o bloqueio efetivo mesmo antes de a rotina diária persistir a suspensão.
create function public.minhas_organizacoes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object('papel', m.papel,
    'suspensa', o.suspensa or public.teste_encerrado(o.id),
    'motivo_suspensao', case when not o.suspensa and public.teste_encerrado(o.id)
      then 'Teste grátis encerrado (automático)' else o.motivo_suspensao end) order by m.created_at), '[]'::jsonb)
  from public.memberships m join public.organizations o on o.id = m.org_id where m.user_id = auth.uid();
$$;
revoke all on function public.minhas_organizacoes() from public, anon;
grant execute on function public.minhas_organizacoes() to authenticated;

create function public.preparar_prazo_teste() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.plano = 'trial' and public.dias_teste_gratis() = 0 then
    new.trial_ate := (now() at time zone 'America/Sao_Paulo')::date - 1;
  end if;
  return new;
end; $$;
revoke all on function public.preparar_prazo_teste() from public, anon, authenticated;
create trigger organizations_prazo_teste before insert on public.organizations for each row execute function public.preparar_prazo_teste();

create or replace function public.admin_teste_gratis(p_dias integer, p_bloquear boolean, p_ajustar_atuais boolean default false) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0;
begin
  perform public.exigir_admin();
  if p_dias is null or p_dias not between 0 and 90 then raise exception 'Informe de 0 a 90 dias (0 desativa o teste grátis)'; end if;
  update public.plataforma_politicas set dias_teste = p_dias, bloquear_teste_vencido = coalesce(p_bloquear, true) where id;
  if p_ajustar_atuais then
    update public.organizations set trial_ate = (created_at at time zone 'America/Sao_Paulo')::date + p_dias - case when p_dias = 0 then 1 else 0 end where plano = 'trial';
    get diagnostics v_n = row_count;
  end if;
  insert into public.admin_audit(ator,acao,alvo,dados) values(auth.uid(),'teste.configurar','plataforma_politicas',jsonb_build_object('dias',p_dias,'bloquear',p_bloquear,'ajustadas',v_n));
  perform public.rotina_cobranca();
  return v_n;
end; $$;

-- Senha aleatória de compras novas: cifrada no servidor e removida depois do envio.
create table public.checkout_acessos (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  senha_cifrada text not null,
  created_at timestamptz not null default now()
);
alter table public.checkout_acessos enable row level security;
grant select, insert, delete on public.checkout_acessos to service_role;

create or replace function public.reservar_boas_vindas(p_pagamento jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.assinaturas%rowtype; v_usuario uuid; v_email text; v_nome text;
begin
  if not exists(select 1 from public.plataforma_email where id='smtp' and ativo and boas_vindas and senha_cifrada is not null) then return null; end if;
  select s.* into a from public.assinaturas s join public.assinatura_faturas f on f.assinatura_id=s.id
    where f.gateway_pagamento_id=p_pagamento->>'id' and f.status='paga';
  if a.id is null or a.boas_vindas_em is not null or a.status='cancelada' or a.pago_ate < (now() at time zone 'America/Sao_Paulo')::date then return null; end if;
  if exists(select 1 from public.organizations where id=a.org_id and suspensa) then return null; end if;
  select m.user_id into v_usuario from public.memberships m where m.org_id=a.org_id
    and m.papel in ('owner','admin') order by (m.user_id=a.created_by) desc, (m.papel='owner') desc, m.created_at limit 1;
  select u.email, u.raw_user_meta_data->>'nome' into v_email,v_nome from auth.users u where u.id=v_usuario;
  if v_email is null then return null; end if;
  update public.assinaturas set boas_vindas_em=now() where id=a.id and boas_vindas_em is null;
  if not found then return null; end if;
  return jsonb_build_object('assinatura',a.id,'org_id',a.org_id,'email',v_email,'nome',v_nome,
    'organizacao',(select nome from public.organizations where id=a.org_id),
    'plano',(select nome from public.plataforma_planos where id=a.plano_id),'ciclo',a.ciclo,'pago_ate',a.pago_ate);
end; $$;
COMMIT;
