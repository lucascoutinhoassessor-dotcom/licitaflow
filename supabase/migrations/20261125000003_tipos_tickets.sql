BEGIN;
alter table public.suporte_chamados drop constraint suporte_chamados_tipo_check;
alter table public.suporte_chamados add constraint suporte_chamados_tipo_check
  check(tipo in ('suporte','sugestao','solicitacao','liberacao_conta'));
COMMIT;
