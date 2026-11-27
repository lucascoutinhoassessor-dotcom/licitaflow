-- LicitaForce · Master: aba única "Clientes" (substitui Organizações + Usuários, que divergiam)
-- e WhatsApp obrigatório no cadastro.
--
-- 1. handle_new_user passa a gravar o WhatsApp informado no cadastro (raw_user_meta_data.telefone) em profiles.telefone.
-- 2. admin_clientes(): uma linha por conta cliente (organização) com dono, equipe completa (WhatsApp, acessos,
--    aparelhos, push) e tudo que a conta já ativou na plataforma; mais as pessoas que se cadastraram e ainda
--    não criaram a organização. Uma única chamada para a tela inteira, sem count(*) de tabelas grandes:
--    o consumo de IA é só dos últimos 30 dias pelo índice ia_uso_org_data.
BEGIN;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_tel text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'telefone', ''), '\D', '', 'g');
begin
  insert into public.profiles (id, nome, email, telefone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''), new.email,
          case when length(v_tel) between 10 and 13 then v_tel end)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.admin_clientes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_desde timestamptz := now() - interval '30 days';
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'organizacoes', coalesce((
      select jsonb_agg(c order by (c->>'created_at') desc) from (
        select jsonb_build_object(
          'id', o.id, 'nome', o.nome, 'tipo', o.tipo, 'plano', o.plano, 'trial_ate', o.trial_ate,
          'suspensa', o.suspensa, 'motivo_suspensao', o.motivo_suspensao, 'created_at', o.created_at,
          'notas_admin', (select n.notas from public.organization_admin_notes n where n.org_id = o.id),
          'membros', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', u.id, 'nome', p.nome, 'email', u.email, 'telefone', nullif(p.telefone, ''), 'papel', m.papel,
              'created_at', u.created_at, 'ultimo_acesso', u.last_sign_in_at, 'email_confirmado', u.email_confirmed_at is not null,
              'is_admin', exists (select 1 from public.platform_admins pa where pa.user_id = u.id),
              'outras_orgs', (select count(*) from public.memberships m2 where m2.user_id = u.id and m2.org_id <> o.id),
              'aparelhos', (select count(*) from public.usuario_aparelhos a where a.user_id = u.id),
              'app_instalado', exists (select 1 from public.usuario_aparelhos a where a.user_id = u.id and a.instalado),
              'push_ativo', exists (select 1 from public.push_inscricoes pi where pi.user_id = u.id)
            ) order by (m.papel = 'owner') desc, u.email)
            from public.memberships m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = u.id
            where m.org_id = o.id), '[]'::jsonb),
          'empresas', (select count(*) from public.empresas e where e.org_id = o.id),
          'empresas_nomes', coalesce((select jsonb_agg(coalesce(e.nome_fantasia, e.razao_social) order by e.created_at)
                                        from public.empresas e where e.org_id = o.id), '[]'::jsonb),
          'processos', (select count(*) from public.processos x where x.org_id = o.id),
          'processos_monitorados', (select count(*) from public.processos x where x.org_id = o.id and x.monitorar
                                      and x.arquivado_em is null and x.pncp_controle is not null),
          'documentos', (select count(*) from public.documentos x where x.org_id = o.id),
          'contratos', (select count(*) from public.contratos x where x.org_id = o.id),
          'prazos_pendentes', (select count(*) from public.prazos x where x.org_id = o.id and not x.concluido),
          'tem_palavras_chave', exists (select 1 from public.empresas e where e.org_id = o.id and cardinality(e.palavras_chave) > 0),
          'radar_ativo', (select count(*) from public.radar_perfis r where r.org_id = o.id and r.ativo),
          'radar_sugestoes', (select count(*) from public.radar_sugestoes r where r.org_id = o.id),
          'agentes_liberados', licitaflow_sentinela.agentes_liberados(o.id),
          'modulos_teste', coalesce((select jsonb_agg(md.id order by md.id) from public.plataforma_modulos md
                                       where md.estado = 'teste' and o.id = any(md.orgs_teste)), '[]'::jsonb),
          'ia_30d', (select jsonb_build_object('usos', count(*), 'custo_usd', coalesce(sum(i.custo_usd), 0),
                                               'agentes', coalesce(jsonb_agg(distinct i.agente), '[]'::jsonb))
                       from public.ia_uso i where i.org_id = o.id and i.created_at >= v_desde),
          'assinatura', (select jsonb_build_object('plano', s.plano_id, 'ciclo', s.ciclo, 'status', s.status,
                                                   'valor_centavos', s.valor_centavos, 'forma', s.forma, 'pago_ate', s.pago_ate,
                                                   'proximo_vencimento', s.proximo_vencimento)
                           from public.assinaturas s where s.org_id = o.id
                           order by (s.status in ('ativa', 'atrasada')) desc, s.created_at desc limit 1),
          'cupons', coalesce((select jsonb_agg(cr.cupom order by cr.created_at) from public.cupom_resgates cr where cr.org_id = o.id), '[]'::jsonb),
          'ultima_atividade', greatest(
            (select max(a.created_at) from public.audit_log a where a.org_id = o.id),
            (select max(uu.last_sign_in_at) from public.memberships m join auth.users uu on uu.id = m.user_id where m.org_id = o.id))
        ) c
        from public.organizations o
      ) t), '[]'::jsonb),
    'sem_organizacao', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'nome', p.nome, 'email', u.email, 'telefone', nullif(p.telefone, ''),
        'created_at', u.created_at, 'ultimo_acesso', u.last_sign_in_at, 'email_confirmado', u.email_confirmed_at is not null,
        'is_admin', exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
      ) order by u.created_at desc)
      from auth.users u left join public.profiles p on p.id = u.id
      where not exists (select 1 from public.memberships m where m.user_id = u.id)), '[]'::jsonb)
  );
end; $$;

revoke execute on function public.admin_clientes() from public, anon;
grant execute on function public.admin_clientes() to authenticated;

COMMIT;
