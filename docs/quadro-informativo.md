# Quadro informativo e sugestões

O quadro aparece no painel inicial e em `/app/quadro`. O menu da conta dá acesso ao quadro e a `/app/sugestoes`, onde o usuário envia ideias de funcionalidades, eventos e conteúdos usando o atendimento existente.

No master, `/master/quadro` permite criar e editar banners, dicas, funcionalidades e eventos. É possível enviar imagens de até 5 MB, escolher uma organização ou todos os clientes, ordenar os cartões, salvar rascunhos, programar publicação e expiração ou arquivar. As imagens usam o bucket público `site` já existente: não envie documentos privados como banner.

`/master/sugestoes` separa as solicitações dos usuários das recomendações da plataforma. O menu e a faixa no master mostram sugestões não lidas e recomendações novas, atualizando a cada minuto enquanto o painel está aberto. A leitura e a resposta continuam no histórico de atendimento.

As recomendações usam regras sobre contagens reais: documentos vencidos, prazos em aberto atrasados e chamados dos últimos 30 dias. Não há consulta a outros clientes de ferramentas de IA, leitura de conversas privadas ou geração por modelo de linguagem nesta versão. Cada recomendação informa seu motivo e vira um rascunho, nunca uma publicação automática. Ideias de eventos não contêm datas inventadas.

A análise roda a cada hora, no minuto 17, por `pg_cron`, quando a extensão existe, e também ao abrir/atualizar a aba de recomendações. A chave mensal evita recomendações repetidas; atualizar a análise preserva decisões tomadas. A aprovação usa bloqueio transacional para não criar dois rascunhos para a mesma recomendação.

## Banco e publicação

Aplique `supabase/migrations/20261126123512_quadro_informativo.sql` antes de publicar o frontend. A migração cria as tabelas, políticas RLS, funções, rotina de análise e três conteúdos educativos iniciais. A migração deve ser executada uma única vez. Não reaplique se ela já constar no histórico remoto.

As tabelas não concedem acesso anônimo. Clientes não conseguem publicar, ver rascunhos ou acessar conteúdo direcionado a outra organização. A RPC de leitura exige associação à organização ativa selecionada. A análise transversal fica no schema privado `licitaflow_quadro`, com verificação explícita do master. O frontend usa somente a configuração pública já existente do Supabase.

## Verificação

`npm run test:quadro` testa isolamento entre organizações, suspensão de contas, acesso anônimo, permissões administrativas, agendamento e expiração, validação de links, recomendações, deduplicação, aprovação e contadores em Postgres local em memória. `npm run build` valida TypeScript e gera o frontend. Os testes Vitest incluem validação de URLs e datas do quadro.

As migrações do quadro e de privilégios foram aplicadas ao Supabase conectado; os nomes locais acompanham as versões do histórico remoto.
