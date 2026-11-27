# Notificações das IAs

O cliente configura os avisos em **Agentes de IA → Notificações das IAs**. A tela de Avisos também aponta para essa configuração. A permissão de push precisa ser concedida em cada aparelho; as preferências de Radar, Sentinela e resumo diário são da conta, compartilhadas entre aparelhos.

- Radar: mantém o aviso de novas oportunidades da busca diária às 7h de Brasília.
- Sentinela: mantém os avisos de mudanças de prazo, documentos, situação e resultado dos processos acompanhados.
- Resumo diário: às 8h de Brasília, informa as oportunidades encontradas, processos acompanhados e mudanças da Sentinela, leituras e cotações registradas. Sem atividade, não envia. Termômetro não registra execução por cliente e não gera contagens fictícias.

O resumo usa a janela fixa entre as 8h do dia anterior e as 8h atuais. A Sentinela informa processos acompanhados com verificação recente, pois a foto mais recente substitui a anterior. A organização aparece no título e o toque abre Agentes de IA. Membros que entraram depois do início da janela passam a receber quando houver uma janela completa após sua entrada.

## Ativação

1. Aplicar `supabase/migrations/20261125000010_push_agentes.sql` no mesmo Supabase da aplicação.
2. Publicar o frontend e as funções de `api/push.js` e `api/agentes.js`, incluindo `server/pushAgentes.js`.
3. Confirmar o job `licitaflow-push-agentes` em `cron.job` e as extensões `pg_cron` e `pg_net`. O destino padrão é `https://licitaforce-app.vercel.app/api/push`; instalações em outro domínio precisam ajustar `licitaflow_push_agentes.config.url` no servidor.
4. O aparelho precisa ter uma inscrição válida de Web Push. A chave VAPID existente é reutilizada; não gerar ou trocar chaves. No iPhone, instalar na Tela de Início e abrir por lá.

O servidor usa as mesmas variáveis Supabase do push existente, incluindo `SUPABASE_SERVICE_ROLE_KEY`. O token do cron é criado no banco e fica no schema privado; não vai para o navegador. A chamada `POST /api/push` com `acao: resumo-agentes` exige esse token no header `x-coleta`.

## Entrega e limites

O cron roda a cada cinco minutos, mas prepara o resumo só uma vez por dia, após as 8h. Cada aparelho tem uma entrega independente e única por organização/dia. Até 50 entregas são reservadas por chamada, com lease de dez minutos e até cinco tentativas. Sucesso em um aparelho não reenvia aos demais que já receberam. Falhas temporárias têm espera progressiva; 404/410 removem inscrições vencidas. Preferência, associação à organização, suspensão, módulo e dono atual do aparelho são conferidos na retirada da fila. A fila expira no fim do dia e é removida após sete dias.

Há uma janela inevitável entre o serviço de push aceitar uma mensagem e a confirmação no banco: uma queda nesse intervalo pode causar nova entrega. A tag estável por organização/dia permite que o navegador substitua a mesma notificação. Aceitação pelo provedor não comprova exibição no aparelho; permissões do sistema, modo Não Perturbe e economia de bateria podem afetar a entrega.

As retentativas descritas são do resumo diário. Os avisos imediatos de Radar e Sentinela mantêm seu fluxo anterior, agora respeitando as preferências de cada usuário.

## Verificação

`node scripts/test-push-agentes.mjs` verifica as permissões, a janela de Brasília, deduplicação, reserva, confirmação, retentativas e bloqueio de ex-membros e organizações suspensas num Postgres em memória. `server/pushAgentes.test.ts` cobre o envio por aparelho, preferências e autenticação do cron. O botão **Testar push** envia apenas aos aparelhos da conta logada.
