-- LicitaFlow · Fatia reservada da fila de coleta para os desertos.
-- Os jobs 'desertos' tinham a menor prioridade e só rodavam quando a fila de itens esvaziasse (que pode levar dias).
-- Agora até 1 em cada 5 pedidos do minuto vai para um deserto, quando houver deserto pronto; o resto segue como antes.
-- O tick é alterado no próprio corpo que está no banco (pg_get_functiondef), trocando só três trechos;
-- se algum trecho não for encontrado exatamente uma vez, a migração para sem mudar nada.
BEGIN;

create index if not exists jobs_desertos_agendados on licitaflow_coleta.jobs(agendada_em) where tipo='desertos';

do $migracao$
declare s text;antes text;
 trocas text[][]:=array[
  -- 1) contador de desertos enviados no último minuto, antes do laço dos pedidos
  array['for slot in 1..greatest(0,least(4-voo,24-janela)) loop',
        'select count(*) into dj from licitaflow_coleta.jobs where tipo=''desertos'' and agendada_em>=now()-interval ''1 minute'';
 for slot in 1..greatest(0,least(4-voo,24-janela)) loop
  reserva:=(dj+1)*5<=janela+slot;'],
  -- 2) na vez reservada, o deserto passa à frente dos itens
  array['when tipo=''desertos'' then 4',
        'when tipo=''desertos'' then case when reserva then 1 else 4 end'],
  -- 3) conta o deserto enviado nesta rodada
  array['select compra into c from public.oportunidades_indice where controle=j.controle;',
        'if j.tipo=''desertos'' then dj:=dj+1;end if;
   select compra into c from public.oportunidades_indice where controle=j.controle;']
 ];
 i integer;
begin
 s:=pg_get_functiondef('licitaflow_coleta.tick()'::regprocedure);
 if position('reserva:=' in s)>0 then raise notice 'Tick já tem a fatia dos desertos.';return;end if;
 for i in 1..array_length(trocas,1) loop
  antes:=trocas[i][1];
  if (length(s)-length(replace(s,antes,'')))/length(antes)<>1 then raise exception 'Trecho % do tick não encontrado exatamente uma vez',i;end if;
  s:=replace(s,antes,trocas[i][2]);
 end loop;
 if position('declare j record;' in s)=0 then raise exception 'Declaração do tick não encontrada';end if;
 s:=replace(s,'declare j record;','declare dj integer:=0;reserva boolean:=false;j record;');
 execute s;
end;
$migracao$;

COMMIT;
