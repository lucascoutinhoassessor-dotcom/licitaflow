-- Consolida versões do controle do teste sem perder compatibilidade com chamadas antigas.
-- Uma função com 3 parâmetros e outra com 4 (ambas com defaults) tornam chamadas antigas ambíguas.
BEGIN;
drop function if exists public.admin_teste_gratis(integer,boolean,boolean);
create or replace function public.admin_teste_gratis(p_dias integer, p_bloquear boolean, p_ajustar_atuais boolean default false, p_ativo boolean default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; v_ativo boolean; v_dias integer;
begin
  perform public.exigir_admin();
  if p_dias is null or p_dias not between 0 and 90 then raise exception 'Informe de 0 a 90 dias (0 desativa o teste grátis)'; end if;
  -- O prazo fica guardado para permitir reativação pelo novo painel.
  select case when p_dias=0 then coalesce(nullif(dias_teste,0),14) else p_dias end into v_dias
    from public.plataforma_politicas where id;
  v_ativo := coalesce(p_ativo,p_dias>0);
  update public.plataforma_politicas set dias_teste=v_dias,
    bloquear_teste_vencido=coalesce(p_bloquear,bloquear_teste_vencido),teste_gratis_ativo=v_ativo where id;
  if coalesce(p_ajustar_atuais,false) and v_ativo then
    update public.organizations set trial_ate=(created_at at time zone 'America/Sao_Paulo')::date+v_dias where plano='trial';
    get diagnostics v_n = row_count;
    insert into public.admin_audit(ator,acao,alvo,dados) values(auth.uid(),'teste.ajustar_atuais','organizations',jsonb_build_object('dias',v_dias,'contas',v_n));
  end if;
  insert into public.admin_audit(ator,acao,alvo,dados) values(auth.uid(),'teste.configurar','plataforma_politicas',jsonb_build_object('ativo',v_ativo,'dias',v_dias,'bloquear',p_bloquear));
  perform public.rotina_cobranca();
  return v_n;
end; $$;
revoke execute on function public.admin_teste_gratis(integer,boolean,boolean,boolean) from public,anon;
grant execute on function public.admin_teste_gratis(integer,boolean,boolean,boolean) to authenticated;
notify pgrst, 'reload schema';
COMMIT;
