BEGIN;
-- Relacionamento entre clientes e a administração, sem acesso cruzado entre organizações.
create table public.suporte_chamados (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  criado_por uuid references auth.users(id) on delete set null,
  assunto text not null check(length(trim(assunto)) between 3 and 160),
  tipo text not null check(tipo in ('suporte','sugestao')),
  status text not null default 'aberto' check(status in ('aberto','em_andamento','aguardando_cliente','resolvido','fechado')),
  prioridade text not null default 'normal' check(prioridade in ('baixa','normal','alta','urgente')),
  nao_lido_master boolean not null default true,
  nao_lido_cliente boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suporte_chamados_fila on public.suporte_chamados(status,updated_at desc);
create index suporte_chamados_org on public.suporte_chamados(org_id,updated_at desc);
create table public.suporte_mensagens (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.suporte_chamados(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  autor_nome text not null,
  equipe boolean not null,
  texto text not null check(length(trim(texto)) between 2 and 10000),
  created_at timestamptz not null default now()
);
create index suporte_mensagens_chamado on public.suporte_mensagens(chamado_id,created_at);
alter table public.suporte_chamados enable row level security;
alter table public.suporte_mensagens enable row level security;

create function public.pode_acessar_chamado(p_chamado uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_platform_admin() or exists(
    select 1 from public.suporte_chamados c join public.memberships m on m.org_id=c.org_id
    where c.id=p_chamado and m.user_id=auth.uid() and (c.criado_por=auth.uid() or m.papel in ('owner','admin'))
  );
$$;
create policy chamados_select on public.suporte_chamados for select to authenticated using(public.pode_acessar_chamado(id));
create policy mensagens_select on public.suporte_mensagens for select to authenticated using(public.pode_acessar_chamado(chamado_id));
grant select on public.suporte_chamados,public.suporte_mensagens to authenticated;
create trigger chamados_atualizados before update on public.suporte_chamados for each row execute function public.set_updated_at();
create trigger chamados_audit after insert or update on public.suporte_chamados for each row execute function public.auditar_administracao();

create function public.abrir_chamado(p_org uuid,p_assunto text,p_texto text,p_tipo text default 'suporte')
returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid; nome text;
begin
  if auth.uid() is null or not exists(select 1 from public.memberships where org_id=p_org and user_id=auth.uid()) then raise exception 'Acesso negado à organização'; end if;
  if (select count(*) from public.suporte_chamados where criado_por=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Limite de novos chamados atingido. Aguarde antes de abrir outro.'; end if;
  select coalesce(nullif(p.nome,''),u.email,'Cliente') into nome from auth.users u left join public.profiles p on p.id=u.id where u.id=auth.uid();
  insert into public.suporte_chamados(org_id,criado_por,assunto,tipo) values(p_org,auth.uid(),trim(p_assunto),p_tipo) returning id into v;
  insert into public.suporte_mensagens(chamado_id,autor_id,autor_nome,equipe,texto) values(v,auth.uid(),nome,false,trim(p_texto));
  return v;
end; $$;

create function public.responder_chamado(p_chamado uuid,p_texto text) returns void
language plpgsql security definer set search_path='' as $$
declare atual text; admin boolean; nome text;
begin
  if auth.uid() is null or not public.pode_acessar_chamado(p_chamado) then raise exception 'Acesso negado ao chamado'; end if;
  select status into atual from public.suporte_chamados where id=p_chamado for update;
  if atual is null then raise exception 'Chamado não encontrado'; end if;
  if atual='fechado' then raise exception 'Chamado fechado. A equipe precisa reabri-lo antes de receber mensagens.'; end if;
  if (select count(*) from public.suporte_mensagens where autor_id=auth.uid() and created_at>now()-interval '1 hour')>=100 then raise exception 'Limite de mensagens atingido. Aguarde antes de enviar outra.'; end if;
  admin := public.is_platform_admin();
  select coalesce(nullif(p.nome,''),u.email,'Usuário') into nome from auth.users u left join public.profiles p on p.id=u.id where u.id=auth.uid();
  insert into public.suporte_mensagens(chamado_id,autor_id,autor_nome,equipe,texto) values(p_chamado,auth.uid(),nome,admin,trim(p_texto));
  update public.suporte_chamados set nao_lido_master=not admin,nao_lido_cliente=admin,
    status=case when admin then 'aguardando_cliente' else 'aberto' end where id=p_chamado;
end; $$;

create function public.marcar_chamado_lido(p_chamado uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.pode_acessar_chamado(p_chamado) then raise exception 'Acesso negado'; end if;
  if public.is_platform_admin() then update public.suporte_chamados set nao_lido_master=false where id=p_chamado;
  else update public.suporte_chamados set nao_lido_cliente=false where id=p_chamado; end if;
end; $$;

create function public.admin_atualizar_chamado(p_chamado uuid,p_status text,p_prioridade text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.exigir_admin();
  update public.suporte_chamados set status=p_status,prioridade=p_prioridade where id=p_chamado;
  if not found then raise exception 'Chamado não encontrado'; end if;
end; $$;

create table public.plataforma_avisos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check(length(trim(titulo)) between 3 and 160),
  texto text not null check(length(trim(texto)) between 3 and 5000),
  org_id uuid references public.organizations(id) on delete cascade,
  ativo boolean not null default true,
  expira_em timestamptz,
  created_at timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null
);
create index avisos_org_data on public.plataforma_avisos(org_id,created_at desc);
alter table public.plataforma_avisos enable row level security;
create policy avisos_select on public.plataforma_avisos for select to authenticated using(
  public.is_platform_admin() or (ativo and (expira_em is null or expira_em>now()) and exists(
    select 1 from public.memberships m where m.user_id=auth.uid() and (plataforma_avisos.org_id is null or plataforma_avisos.org_id=m.org_id)
  ))
);
create table public.aviso_leituras (
  aviso_id uuid not null references public.plataforma_avisos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lido_em timestamptz not null default now(),
  primary key(aviso_id,user_id)
);
alter table public.aviso_leituras enable row level security;
create policy leituras_select on public.aviso_leituras for select to authenticated using(user_id=auth.uid() or public.is_platform_admin());
create policy leituras_insert on public.aviso_leituras for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.plataforma_avisos a where a.id=aviso_id));
grant select on public.plataforma_avisos,public.aviso_leituras to authenticated;
grant insert on public.aviso_leituras to authenticated;
create trigger avisos_audit after insert or update on public.plataforma_avisos for each row execute function public.auditar_administracao();

create function public.admin_publicar_aviso(p_titulo text,p_texto text,p_org uuid default null,p_expira_em timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
  perform public.exigir_admin();
  if p_expira_em is not null and p_expira_em<=now() then raise exception 'A expiração deve ser futura'; end if;
  insert into public.plataforma_avisos(titulo,texto,org_id,expira_em,criado_por) values(trim(p_titulo),trim(p_texto),p_org,p_expira_em,auth.uid()) returning id into v;
  return v;
end; $$;
create function public.admin_arquivar_aviso(p_aviso uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.exigir_admin();
  update public.plataforma_avisos set ativo=false where id=p_aviso;
  if not found then raise exception 'Aviso não encontrado'; end if;
end; $$;

create function public.admin_relatorio_operacao() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'por_etapa',coalesce((select jsonb_agg(x) from (select etapa,count(*) quantidade from public.processos group by etapa order by count(*) desc) x),'[]'::jsonb),
    'por_modalidade',coalesce((select jsonb_agg(x) from (select modalidade,count(*) quantidade from public.processos group by modalidade order by count(*) desc) x),'[]'::jsonb),
    'prazos_atrasados',(select count(*) from public.prazos where not concluido and data_hora<now()),
    'documentos_vencidos',(select count(*) from public.documentos where validade<current_date),
    'importados_pncp',(select count(*) from public.processos where pncp_controle is not null),
    'clientes',coalesce((select jsonb_agg(x) from (
      select o.nome,o.plano,o.suspensa,count(p.id) processos,count(p.id) filter(where p.etapa='homologado') ganhos
      from public.organizations o left join public.processos p on p.org_id=o.id
      group by o.id order by count(p.id) desc,o.nome limit 100
    ) x),'[]'::jsonb)
  );
end; $$;

revoke execute on function public.abrir_chamado(uuid,text,text,text) from public,anon;
revoke execute on function public.responder_chamado(uuid,text) from public,anon;
revoke execute on function public.marcar_chamado_lido(uuid) from public,anon;
revoke execute on function public.admin_atualizar_chamado(uuid,text,text) from public,anon;
revoke execute on function public.admin_publicar_aviso(text,text,uuid,timestamptz) from public,anon;
revoke execute on function public.admin_arquivar_aviso(uuid) from public,anon;
revoke execute on function public.admin_relatorio_operacao() from public,anon;
grant execute on function public.abrir_chamado(uuid,text,text,text) to authenticated;
grant execute on function public.responder_chamado(uuid,text) to authenticated;
grant execute on function public.marcar_chamado_lido(uuid) to authenticated;
grant execute on function public.admin_atualizar_chamado(uuid,text,text) to authenticated;
grant execute on function public.admin_publicar_aviso(text,text,uuid,timestamptz) to authenticated;
grant execute on function public.admin_arquivar_aviso(uuid) to authenticated;
grant execute on function public.admin_relatorio_operacao() to authenticated;

create function public.relatorio_cliente(p_org uuid,p_empresa uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_member(p_org) then raise exception 'Acesso negado à organização'; end if;
  if p_empresa is not null and not exists(select 1 from public.empresas where id=p_empresa and org_id=p_org) then raise exception 'Empresa não pertence à organização'; end if;
  return jsonb_build_object(
    'por_etapa',coalesce((select jsonb_agg(x) from (select etapa,count(*) quantidade from public.processos where org_id=p_org and (p_empresa is null or empresa_id=p_empresa) group by etapa) x),'[]'::jsonb),
    'processos',(select count(*) from public.processos where org_id=p_org and (p_empresa is null or empresa_id=p_empresa)),
    'contratos',(select count(*) from public.contratos where org_id=p_org and (p_empresa is null or empresa_id=p_empresa)),
    'prazos_atrasados',(select count(*) from public.prazos where org_id=p_org and (p_empresa is null or empresa_id=p_empresa) and not concluido and data_hora<now()),
    'documentos_vencidos',(select count(*) from public.documentos where org_id=p_org and (p_empresa is null or empresa_id=p_empresa) and validade<current_date),
    'recebido',coalesce((select sum(f.valor) from public.faturas f join public.contratos c on c.id=f.contrato_id where f.org_id=p_org and c.org_id=p_org and (p_empresa is null or c.empresa_id=p_empresa) and f.status='paga'),0),
    'a_receber',coalesce((select sum(f.valor) from public.faturas f join public.contratos c on c.id=f.contrato_id where f.org_id=p_org and c.org_id=p_org and (p_empresa is null or c.empresa_id=p_empresa) and f.status not in ('paga','cancelada')),0)
  );
end; $$;
revoke execute on function public.relatorio_cliente(uuid,uuid) from public,anon;
grant execute on function public.relatorio_cliente(uuid,uuid) to authenticated;
COMMIT;
