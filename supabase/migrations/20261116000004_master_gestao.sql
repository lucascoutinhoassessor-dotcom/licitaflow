-- Gestão da plataforma: conteúdo público separado de rascunhos e auditoria privada.
create table public.admin_audit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ator uuid references auth.users(id) on delete set null,
  acao text not null,
  alvo text not null,
  dados jsonb not null default '{}'::jsonb
);
alter table public.admin_audit enable row level security;
create policy admin_audit_leitura on public.admin_audit for select to authenticated
  using (public.is_platform_admin());

create function public.auditar_administracao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_audit(ator, acao, alvo, dados)
  values(auth.uid(), tg_op, tg_table_name,
    jsonb_build_object('antes', case when tg_op <> 'INSERT' then to_jsonb(old) end,
                       'depois', case when tg_op <> 'DELETE' then to_jsonb(new) end));
  return null;
end; $$;
create trigger admin_audit_org after update on public.organizations
  for each row execute function public.auditar_administracao();
create trigger admin_audit_permissoes after insert or update or delete on public.platform_admins
  for each row execute function public.auditar_administracao();
create trigger admin_audit_membros after insert or update or delete on public.memberships
  for each row execute function public.auditar_administracao();

create table public.site_content (
  id boolean primary key default true check(id),
  versao integer not null default 0,
  rascunho jsonb not null default '{}'::jsonb,
  publicado jsonb not null default '{}'::jsonb,
  publicado_em timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.site_content(id) values(true);
alter table public.site_content enable row level security;
create policy site_content_admin_leitura on public.site_content for select to authenticated
  using(public.is_platform_admin());

create table public.site_content_history (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  autor uuid references auth.users(id) on delete set null,
  versao integer not null,
  acao text not null,
  conteudo jsonb not null
);
alter table public.site_content_history enable row level security;
create policy site_history_admin_leitura on public.site_content_history for select to authenticated
  using(public.is_platform_admin());

create function public.site_publico() returns jsonb
language sql stable security definer set search_path = '' as $$
  select publicado from public.site_content where id;
$$;

create function public.admin_salvar_site(p_conteudo jsonb, p_versao integer, p_publicar boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer; k text; valor jsonb;
begin
  perform public.exigir_admin();
  if p_publicar is null or p_conteudo is null or jsonb_typeof(p_conteudo) <> 'object' then
    raise exception 'Conteúdo inválido';
  end if;
  for k, valor in select * from jsonb_each(p_conteudo) loop
    if k not in ('titulo','destaque','descricao','botao','titulo_final','descricao_final','contato')
       or jsonb_typeof(valor) <> 'string' or length(p_conteudo->>k) > 2000 then
      raise exception 'Campo de conteúdo inválido: %', k;
    end if;
  end loop;
  if length(trim(coalesce(p_conteudo->>'titulo',''))) not between 3 and 180
     or length(trim(coalesce(p_conteudo->>'botao',''))) not between 2 and 80
     or coalesce(p_conteudo->>'contato','') !~ '^$|^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'Informe título, botão e e-mail de contato válidos';
  end if;
  update public.site_content set rascunho=p_conteudo, versao=versao+1, updated_at=now(),
    publicado=case when p_publicar then p_conteudo else publicado end,
    publicado_em=case when p_publicar then now() else publicado_em end
    where id and versao=p_versao returning versao into v;
  if not found then raise exception 'O conteúdo foi alterado em outra sessão. Recarregue antes de salvar.'; end if;
  insert into public.site_content_history(autor,versao,acao,conteudo)
    values(auth.uid(),v,case when p_publicar then 'publicar' else 'rascunho' end,p_conteudo);
  insert into public.admin_audit(ator,acao,alvo,dados)
    values(auth.uid(),case when p_publicar then 'PUBLICAR' else 'RASCUNHO' end,'landingpage',jsonb_build_object('versao',v));
  return v;
end; $$;

create function public.admin_cliente(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  if not exists(select 1 from public.organizations where id=p_org) then raise exception 'Organização não encontrada'; end if;
  return jsonb_build_object(
    'nome',(select nome from public.organizations where id=p_org),
    'membros',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'nome',p.nome,'papel',m.papel,'ultimo_acesso',u.last_sign_in_at) order by u.email)
      from public.memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=u.id where m.org_id=p_org),'[]'::jsonb),
    'empresas',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'nome',coalesce(e.nome_fantasia,e.razao_social),'cnpj',e.cnpj,'uf',e.uf,'ativa',e.ativa)) from public.empresas e where e.org_id=p_org),'[]'::jsonb),
    'processos',(select count(*) from public.processos where org_id=p_org),
    'contratos',(select count(*) from public.contratos where org_id=p_org),
    'documentos',(select count(*) from public.documentos where org_id=p_org),
    'prazos_pendentes',(select count(*) from public.prazos where org_id=p_org and not concluido),
    'recebido',coalesce((select sum(valor) from public.faturas where org_id=p_org and status='paga'),0),
    'a_receber',coalesce((select sum(valor) from public.faturas where org_id=p_org and status not in ('paga','cancelada')),0)
  );
end; $$;

create function public.admin_papel_membro(p_org uuid,p_usuario uuid,p_papel text,p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare atual text;
begin
  perform public.exigir_admin();
  if p_papel is null or p_papel not in ('admin','membro','leitor') or length(trim(coalesce(p_motivo,''))) < 5 then
    raise exception 'Informe papel válido e motivo com pelo menos 5 caracteres';
  end if;
  select papel into atual from public.memberships where org_id=p_org and user_id=p_usuario for update;
  if atual is null then raise exception 'Membro não encontrado'; end if;
  if atual='owner' then raise exception 'O proprietário não pode ser alterado por esta ação'; end if;
  update public.memberships set papel=p_papel where org_id=p_org and user_id=p_usuario;
  insert into public.admin_audit(ator,acao,alvo,dados) values(auth.uid(),'ALTERAR_PAPEL',p_org::text,
    jsonb_build_object('usuario',p_usuario,'de',atual,'para',p_papel,'motivo',trim(p_motivo)));
end; $$;

revoke execute on function public.admin_salvar_site(jsonb,integer,boolean) from public,anon;
revoke execute on function public.admin_cliente(uuid) from public,anon;
revoke execute on function public.admin_papel_membro(uuid,uuid,text,text) from public,anon;
grant execute on function public.admin_salvar_site(jsonb,integer,boolean) to authenticated;
grant execute on function public.admin_cliente(uuid) to authenticated;
grant execute on function public.admin_papel_membro(uuid,uuid,text,text) to authenticated;
grant execute on function public.site_publico() to anon,authenticated;
grant select on public.site_content,public.site_content_history,public.admin_audit to authenticated;


-- Notas internas não podem ficar na linha de organizations lida pelos clientes.
create table public.organization_admin_notes (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  notas text
);
alter table public.organization_admin_notes enable row level security;
create policy org_notes_admin on public.organization_admin_notes for select to authenticated
  using(public.is_platform_admin());
insert into public.organization_admin_notes(org_id,notas)
  select id,notas_admin from public.organizations where notas_admin is not null;
update public.organizations set notas_admin=null where notas_admin is not null;
alter table public.organizations add constraint notas_internas_separadas check(notas_admin is null);
create trigger auditar_notas after insert or update or delete on public.organization_admin_notes
  for each row execute function public.auditar_administracao();
grant select on public.organization_admin_notes to authenticated;

create or replace function public.admin_organizacoes()
returns table (
  id uuid, nome text, tipo text, plano text, trial_ate date, suspensa boolean, motivo_suspensao text, notas_admin text,
  created_at timestamptz, dono_email text, dono_nome text, membros bigint, empresas bigint, processos bigint,
  documentos bigint, contratos bigint, tem_palavras_chave boolean, ultima_atividade timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return query
  select o.id, o.nome, o.tipo, o.plano, o.trial_ate, o.suspensa, o.motivo_suspensao, (select n.notas from public.organization_admin_notes n where n.org_id=o.id), o.created_at,
         u.email::text, p.nome,
         (select count(*) from public.memberships m where m.org_id = o.id),
         (select count(*) from public.empresas e where e.org_id = o.id),
         (select count(*) from public.processos x where x.org_id = o.id),
         (select count(*) from public.documentos x where x.org_id = o.id),
         (select count(*) from public.contratos x where x.org_id = o.id),
         exists (select 1 from public.empresas e where e.org_id = o.id and cardinality(e.palavras_chave) > 0),
         greatest(
           (select max(a.created_at) from public.audit_log a where a.org_id = o.id),
           (select max(uu.last_sign_in_at) from public.memberships m join auth.users uu on uu.id = m.user_id where m.org_id = o.id)
         )
  from public.organizations o
  left join public.memberships mo on mo.org_id = o.id and mo.papel = 'owner'
  left join auth.users u on u.id = mo.user_id
  left join public.profiles p on p.id = mo.user_id
  order by o.created_at desc;
end;
$$;


create or replace function public.admin_atualizar_org(
  p_org uuid, p_plano text, p_trial_ate date, p_suspensa boolean, p_motivo text, p_notas text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  update public.organizations
     set plano = p_plano,
         trial_ate = p_trial_ate,
         suspensa = p_suspensa,
         motivo_suspensao = case when p_suspensa then nullif(trim(p_motivo), '') end,
         notas_admin = null
   where id = p_org;
  if not found then
    raise exception 'organização não encontrada';
  end if;
  insert into public.organization_admin_notes(org_id,notas) values(p_org,nullif(trim(p_notas),''))
    on conflict(org_id) do update set notas=excluded.notas;
end;
$$;

