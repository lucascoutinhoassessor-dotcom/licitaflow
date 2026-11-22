-- LicitaFlow · E-mail da plataforma (SMTP) e aviso de "acesso liberado" após o primeiro pagamento.
-- 1) plataforma_email: servidor SMTP configurado pelo master (senha cifrada pelo servidor, nunca volta para a tela).
-- 2) assinaturas.boas_vindas_em: marca o envio do e-mail de acesso liberado (uma vez por assinatura).
-- 3) reservar_boas_vindas: usada pelo webhook (service_role). Marca e devolve destinatário e dados do e-mail;
--    devolve null se já foi enviado, se o e-mail está desligado ou se não há destinatário.
BEGIN;

create table public.plataforma_email (
  id text primary key check (id = 'smtp'),
  ativo boolean not null default false,
  host text check (host is null or host ~ '^[A-Za-z0-9.-]{3,253}$'),
  porta integer not null default 465 check (porta in (25, 465, 587, 2525)),
  usuario text check (usuario is null or length(usuario) <= 254),
  senha_cifrada text,
  remetente_nome text not null default 'LicitaFlow' check (length(remetente_nome) between 1 and 80),
  remetente_email text check (remetente_email is null or remetente_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  boas_vindas boolean not null default true,
  testado_em timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.plataforma_email(id) values ('smtp');
alter table public.plataforma_email enable row level security;
-- Sem políticas: só o servidor lê. O master vê o status por admin_email_status().
grant select, insert, update on public.plataforma_email to service_role;

alter table public.assinaturas add column boas_vindas_em timestamptz;
-- Assinaturas que já estavam pagas antes desta entrega não recebem o e-mail retroativo.
update public.assinaturas set boas_vindas_em = now() where pago_ate is not null;

create function public.admin_email_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return (select jsonb_build_object('ativo', e.ativo, 'host', e.host, 'porta', e.porta, 'usuario', e.usuario,
      'tem_senha', e.senha_cifrada is not null, 'remetente_nome', e.remetente_nome, 'remetente_email', e.remetente_email,
      'boas_vindas', e.boas_vindas, 'testado_em', e.testado_em, 'updated_at', e.updated_at,
      'enviados_30d', (select count(*) from public.assinaturas a where a.boas_vindas_em > now() - interval '30 days'
                        and a.pago_ate is not null))
    from public.plataforma_email e where e.id = 'smtp');
end; $$;

create function public.reservar_boas_vindas(p_pagamento jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.assinaturas%rowtype;
  v_ref text := p_pagamento->>'externalReference';
  v_email text; v_nome text; v_org text; v_plano text;
begin
  if not exists (select 1 from public.plataforma_email e where e.id = 'smtp' and e.ativo and e.boas_vindas and e.senha_cifrada is not null) then
    return null;
  end if;
  if v_ref ~ '^[0-9a-f-]{36}$' then select * into a from public.assinaturas where id = v_ref::uuid; end if;
  if a.id is null and p_pagamento->>'subscription' is not null then
    select * into a from public.assinaturas where gateway = 'asaas' and gateway_assinatura_id = p_pagamento->>'subscription';
  end if;
  if a.id is null or a.boas_vindas_em is not null or a.status = 'cancelada' then return null; end if;

  -- Quem contratou; na falta, quem criou a organização.
  select u.email, coalesce(nullif(u.raw_user_meta_data->>'nome',''), split_part(u.email, '@', 1)) into v_email, v_nome
    from auth.users u where u.id = coalesce(a.created_by, (select o.created_by from public.organizations o where o.id = a.org_id));
  if v_email is null then return null; end if;

  update public.assinaturas set boas_vindas_em = now() where id = a.id and boas_vindas_em is null;
  if not found then return null; end if;
  select o.nome into v_org from public.organizations o where o.id = a.org_id;
  select p.nome into v_plano from public.plataforma_planos p where p.id = a.plano_id;
  return jsonb_build_object('assinatura', a.id, 'email', v_email, 'nome', v_nome, 'organizacao', v_org,
    'plano', coalesce(v_plano, a.plano_id), 'ciclo', a.ciclo,
    'pago_ate', (select x.pago_ate from public.assinaturas x where x.id = a.id));
end; $$;

revoke execute on function public.admin_email_status() from public, anon;
revoke execute on function public.reservar_boas_vindas(jsonb) from public, anon, authenticated;
grant execute on function public.admin_email_status() to authenticated;
grant execute on function public.reservar_boas_vindas(jsonb) to service_role;

COMMIT;
