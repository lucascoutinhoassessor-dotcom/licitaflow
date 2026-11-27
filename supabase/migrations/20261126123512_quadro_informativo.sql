BEGIN;
-- Quadro editorial: o master publica; clientes veem somente conteúdos liberados para sua organização.
create table public.quadro_posts (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check(length(trim(titulo)) between 3 and 160),
  texto text not null check(length(trim(texto)) between 3 and 5000),
  tipo text not null check(tipo in ('banner','dica','novidade','evento')),
  imagem_url text not null default '',
  link_url text not null default '',
  link_texto text not null default '' check(length(link_texto)<=80),
  org_id uuid references public.organizations(id) on delete cascade,
  status text not null default 'rascunho' check(status in ('rascunho','publicado','arquivado')),
  publicar_em timestamptz not null default now(),
  expira_em timestamptz,
  ordem integer not null default 0 check(ordem between -1000 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(expira_em is null or expira_em>publicar_em),
  check(tipo<>'banner' or imagem_url<>''),
  check(imagem_url='' or (imagem_url ~ '^https://[^/[:space:]]+' and imagem_url !~ '[[:space:][:cntrl:]\\]')),
  check(link_url='' or ((link_url ~ '^https://[^/[:space:]]+' or link_url ~ '^/[^/]') and link_url !~ '[[:space:][:cntrl:]\\]')),
  check(length(imagem_url)<=2000 and length(link_url)<=2000),
  check(link_url='' or length(trim(link_texto))>0)
);
create index quadro_posts_publicos on public.quadro_posts(org_id,ordem,publicar_em desc) where status='publicado';
alter table public.quadro_posts enable row level security;
create policy quadro_posts_master on public.quadro_posts for all to authenticated
  using((select public.is_platform_admin())) with check((select public.is_platform_admin()));
create policy quadro_posts_cliente on public.quadro_posts for select to authenticated using(
  status='publicado' and publicar_em<=now() and (expira_em is null or expira_em>now())
  and exists(select 1 from public.memberships m join public.organizations o on o.id=m.org_id
    where m.user_id=(select auth.uid()) and not o.suspensa and (quadro_posts.org_id is null or quadro_posts.org_id=m.org_id))
);
grant select,insert,update on public.quadro_posts to authenticated;
create trigger quadro_posts_atualizado before update on public.quadro_posts for each row execute function public.set_updated_at();

create table public.quadro_recomendacoes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  titulo text not null,
  motivo text not null,
  texto_sugerido text not null,
  tipo text not null check(tipo in ('dica','novidade','evento')),
  quantidade bigint not null,
  status text not null default 'nova' check(status in ('nova','rascunho','dispensada')),
  post_id uuid references public.quadro_posts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index quadro_recomendacoes_post on public.quadro_recomendacoes(post_id);
alter table public.quadro_recomendacoes enable row level security;
create policy quadro_recomendacoes_master on public.quadro_recomendacoes for all to authenticated
  using((select public.is_platform_admin())) with check((select public.is_platform_admin()));
grant select,update on public.quadro_recomendacoes to authenticated;
create index quadro_chamados_recentes on public.suporte_chamados(tipo,created_at desc);
create index quadro_sugestoes_nao_lidas on public.suporte_chamados(updated_at desc) where tipo='sugestao' and nao_lido_master;

-- Invoker: as políticas RLS continuam valendo mesmo dentro das RPCs de edição.
create function public.admin_salvar_quadro(p_post jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v uuid:=coalesce(nullif(p_post->>'id','')::uuid,gen_random_uuid());
begin
  perform public.exigir_admin();
  insert into public.quadro_posts(id,titulo,texto,tipo,imagem_url,link_url,link_texto,org_id,status,publicar_em,expira_em,ordem)
  values(v,trim(p_post->>'titulo'),trim(p_post->>'texto'),p_post->>'tipo',coalesce(p_post->>'imagem_url',''),coalesce(p_post->>'link_url',''),
    coalesce(p_post->>'link_texto',''),nullif(p_post->>'org_id','')::uuid,p_post->>'status',(p_post->>'publicar_em')::timestamptz,
    nullif(p_post->>'expira_em','')::timestamptz,coalesce((p_post->>'ordem')::integer,0))
  on conflict(id) do update set titulo=excluded.titulo,texto=excluded.texto,tipo=excluded.tipo,imagem_url=excluded.imagem_url,
    link_url=excluded.link_url,link_texto=excluded.link_texto,org_id=excluded.org_id,status=excluded.status,
    publicar_em=excluded.publicar_em,expira_em=excluded.expira_em,ordem=excluded.ordem;
  return v;
end; $$;

create function public.quadro_listar(p_org uuid,p_limite integer default 100) returns setof public.quadro_posts
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or not public.is_member(p_org) then raise exception 'Acesso negado à organização'; end if;
  return query select p.* from public.quadro_posts p where p.status='publicado' and p.publicar_em<=now()
    and (p.expira_em is null or p.expira_em>now()) and (p.org_id is null or p.org_id=p_org)
    order by p.ordem,p.publicar_em desc,p.id limit greatest(1,least(coalesce(p_limite,100),100));
end; $$;

-- Só a análise agregada precisa de acesso transversal; fica fora dos schemas expostos pela API.
create schema if not exists licitaflow_quadro;
grant usage on schema licitaflow_quadro to authenticated;
create function licitaflow_quadro.analisar() returns void
language plpgsql security definer set search_path='' as $$
declare n_docs bigint; n_prazos bigint; n_suporte bigint; n_sugestoes bigint; periodo text:=to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM');
begin
  if auth.uid() is not null then perform public.exigir_admin();
  elsif session_user not in ('postgres','supabase_admin') then raise exception 'Acesso negado'; end if;
  -- Evita que vários consoles façam as mesmas contagens simultaneamente.
  if not pg_try_advisory_xact_lock(20261126,1) then return; end if;
  select count(*) into n_docs from public.documentos where validade<current_date;
  select count(*) into n_prazos from public.prazos where not concluido and data_hora<now();
  select count(*) filter(where tipo='suporte'),count(*) filter(where tipo='sugestao') into n_suporte,n_sugestoes
    from public.suporte_chamados where created_at>=now()-interval '30 days';
  insert into public.quadro_recomendacoes(chave,titulo,motivo,texto_sugerido,tipo,quantidade)
  select periodo||':'||v.chave,v.titulo,v.motivo,v.texto,v.tipo,v.n from (values
    ('documentos','Ensinar a acompanhar a validade dos documentos',format('%s documento(s) vencido(s) na plataforma. Recomenda-se reforçar a rotina de revisão de validade.',n_docs),
     'Antes de participar de uma licitação, confira a validade das certidões e dos documentos exigidos. Mantenha os arquivos atualizados em Documentos e confirme as exigências de cada edital.','dica',n_docs,1),
    ('prazos','Reforçar a organização de prazos',format('%s prazo(s) em aberto já passaram do horário registrado. Uma orientação pode ajudar os clientes a revisar sua agenda.',n_prazos),
     'Revise sua agenda de prazos e confira as datas diretamente no edital e no portal da disputa. Registre os responsáveis, acompanhe os próximos vencimentos e marque como concluídas as tarefas finalizadas.','dica',n_prazos,1),
    ('oficina','Considerar um encontro de dúvidas com os clientes',format('%s chamado(s) de suporte aberto(s) nos últimos 30 dias. Avalie os assuntos antes de definir uma oficina ou encontro.',n_suporte),
     'Queremos ouvir suas dúvidas sobre o uso da plataforma. Envie pelo suporte os temas que você gostaria de ver em um encontro de orientação. A equipe avaliará os pedidos antes de anunciar uma data.','evento',n_suporte,3),
    ('funcionalidades','Priorizar sugestões de funcionalidades',format('%s sugestão(ões) recebida(s) nos últimos 30 dias. Revise a aba de sugestões dos usuários para identificar pedidos recorrentes.',n_sugestoes),
     'Sua experiência ajuda a melhorar o LicitaForce. Envie sua sugestão contando o que deseja fazer, a dificuldade encontrada e como uma melhoria ajudaria sua rotina. A equipe acompanha as solicitações pelo painel master.','novidade',n_sugestoes,1)
  ) as v(chave,titulo,motivo,texto,tipo,n,minimo) where v.n>=v.minimo
  on conflict(chave) do update set motivo=excluded.motivo,quantidade=excluded.quantidade;
end; $$;
revoke all on function licitaflow_quadro.analisar() from public,anon;
grant execute on function licitaflow_quadro.analisar() to authenticated;

create function public.admin_analisar_quadro() returns void
language plpgsql security invoker set search_path='' as $$
begin perform public.exigir_admin(); perform licitaflow_quadro.analisar(); end; $$;

create function public.admin_quadro_pendencias() returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object('recomendacoes',(select count(*) from public.quadro_recomendacoes where status='nova'),
    'usuarios',(select count(*) from public.suporte_chamados where tipo='sugestao' and nao_lido_master));
end; $$;

create function public.admin_decidir_recomendacao_quadro(p_id uuid,p_criar boolean) returns uuid
language plpgsql security invoker set search_path='' as $$
declare r public.quadro_recomendacoes; v uuid;
begin
  perform public.exigir_admin();
  select * into r from public.quadro_recomendacoes where id=p_id for update;
  if r.id is null then raise exception 'Recomendação não encontrada'; end if;
  if r.status<>'nova' then return r.post_id; end if;
  if p_criar then
    v:=public.admin_salvar_quadro(jsonb_build_object('titulo',r.titulo,'texto',r.texto_sugerido,'tipo',r.tipo,'status','rascunho','publicar_em',now()));
  end if;
  update public.quadro_recomendacoes set status=case when p_criar then 'rascunho' else 'dispensada' end,post_id=v where id=p_id;
  return v;
end; $$;

revoke all on function public.admin_salvar_quadro(jsonb),public.quadro_listar(uuid,integer),public.admin_analisar_quadro(),public.admin_quadro_pendencias(),public.admin_decidir_recomendacao_quadro(uuid,boolean) from public,anon;
grant execute on function public.admin_salvar_quadro(jsonb),public.quadro_listar(uuid,integer),public.admin_analisar_quadro(),public.admin_quadro_pendencias(),public.admin_decidir_recomendacao_quadro(uuid,boolean) to authenticated;

insert into public.quadro_posts(titulo,texto,tipo,status,link_url,link_texto,ordem) values
  ('Comece pelo edital e organize sua participação','Leia o edital e os anexos antes de decidir participar. Confira o objeto, as condições de fornecimento, os documentos exigidos e as datas. Use o processo para reunir as informações e acompanhar cada etapa.','dica','publicado','/app/processos','Organizar meus processos',10),
  ('Documentação em dia evita correria','Confira regularmente a validade das certidões e mantenha os arquivos identificados. Antes de enviar uma proposta, compare a documentação disponível com a lista exigida no edital.','dica','publicado','/app/documentos','Conferir documentos',20),
  ('Ajude a construir as próximas melhorias','Tem uma ideia de funcionalidade, conteúdo educativo ou evento? Conte o problema que deseja resolver e como isso ajudaria sua rotina. Sua sugestão chega à equipe para acompanhamento.','novidade','publicado','/app/sugestoes','Enviar minha sugestão',30);

-- Atualiza as recomendações mesmo quando o master não está aberto; a interface também permite analisar na hora.
do $cron$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('licitaflow-quadro-recomendacoes','17 * * * *','select licitaflow_quadro.analisar()');
  end if;
end; $cron$;
select licitaflow_quadro.analisar();
notify pgrst, 'reload schema';
COMMIT;
