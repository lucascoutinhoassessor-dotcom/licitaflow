-- Landing page 100% editável pelo master.
-- Formato 2 do conteúdo: {versao_schema:2, seo, tema, marca, menu, secoes[], rodape}.
-- O formato 1 (7 textos) continua aceito com as mesmas regras de antes.
-- Imagens da landing ficam no bucket público "site" (só o master envia).

create or replace function public.admin_salvar_site(p_conteudo jsonb, p_versao integer, p_publicar boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer; k text; valor jsonb;
begin
  perform public.exigir_admin();
  if p_publicar is null or p_conteudo is null or jsonb_typeof(p_conteudo) <> 'object' then
    raise exception 'Conteúdo inválido';
  end if;
  if p_conteudo->'versao_schema' = '2'::jsonb then
    for k, valor in select * from jsonb_each(p_conteudo) loop
      if k not in ('versao_schema','seo','tema','marca','menu','secoes','rodape') then
        raise exception 'Campo de conteúdo inválido: %', k;
      end if;
      if k in ('seo','tema','marca','menu','rodape') and jsonb_typeof(valor) <> 'object' then
        raise exception 'Campo de conteúdo inválido: %', k;
      end if;
    end loop;
    if jsonb_typeof(p_conteudo->'secoes') is distinct from 'array' or jsonb_array_length(p_conteudo->'secoes') not between 1 and 60 then
      raise exception 'Informe de 1 a 60 seções';
    end if;
    if length(p_conteudo::text) > 200000 then
      raise exception 'Conteúdo grande demais';
    end if;
    -- Nenhum texto pode começar com esquema perigoso (javascript:, data:, vbscript:) nem conter tags de script.
    if p_conteudo::text ~* '"\s*(javascript|vbscript|data)\s*:' or p_conteudo::text ~* '<\s*/?\s*script' then
      raise exception 'Conteúdo com link ou código não permitido';
    end if;
    if coalesce(p_conteudo->'rodape'->>'contato','') !~ '^$|^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
      raise exception 'E-mail de contato inválido';
    end if;
  else
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

revoke execute on function public.admin_salvar_site(jsonb,integer,boolean) from public,anon;
grant execute on function public.admin_salvar_site(jsonb,integer,boolean) to authenticated;

-- Imagens da landing: leitura pública (bucket público), escrita só do master.
insert into storage.buckets (id, name, public, file_size_limit)
values ('site', 'site', true, 5242880)  -- 5 MB
on conflict (id) do nothing;

create policy site_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and public.is_platform_admin());
create policy site_upd on storage.objects for update to authenticated
  using (bucket_id = 'site' and public.is_platform_admin());
create policy site_del on storage.objects for delete to authenticated
  using (bucket_id = 'site' and public.is_platform_admin());
