# Controle da plataforma e operação dos clientes

## Entrega

O console master recebe catálogo de planos, limites de uso, financeiro SaaS, status das integrações, fila de suporte/sugestões, avisos segmentados, relatórios operacionais e configurações de perfil/sessões. As áreas existentes de organizações, usuários, conteúdo da landing page, atividade e auditoria continuam disponíveis.

No painel do cliente ficam disponíveis busca de oportunidades e importação, processos, prazos, documentos, contratos, faturamento operacional, relatórios, plano/uso, avisos e atendimento. Proprietários e administradores consultam as cobranças da plataforma separadamente das notas fiscais de contratos públicos.

O atendimento tem mensagens persistidas, autoria definida pelo banco, leitura, prioridade e fluxo aberto/em andamento/aguardando cliente/resolvido/fechado. Cada cliente acessa seus próprios chamados; administradores da organização podem consultar os da equipe. Somente master pode alterar prioridade/status. Cliente suspenso mantém um canal de atendimento e consulta de cobranças, sem liberação de dados operacionais.

Avisos são publicados por master para todas as organizações ou para uma delas, com expiração opcional, arquivamento e leitura individual. Este fluxo não envia e-mail, WhatsApp ou push.

Planos têm preço mensal, preço anual total e limites de empresas, usuários e processos. O catálogo público da landing usa apenas planos ativos. Trial e cancelado continuam ocultos no catálogo. Planos personalizados podem ser vinculados pelo master. Limites ficam desativados por padrão; quando ativados, triggers serializam inserções por organização e validam a quantidade no banco. Reduzir um limite não exclui registros existentes. Mudanças de catálogo não criam cobranças nem renegociam contratos automaticamente.

Relatórios são agregados no banco, respeitam organização e empresa para o cliente, e fornecem consolidado global para o master. O ranking é por quantidade de processos, não por lucro ou receita. CSV escapa aspas, separadores e conteúdo que poderia ser interpretado como fórmula em planilhas.

## Implantação

O projeto Supabase é o existente `licitaflow-app`, referência `tbsjasyvnuylnjrqrtba`. As migrações 0001 a 0004 devem estar aplicadas.

Para execução pelo SQL Editor, usar **somente** `supabase/deploy/20261116_controle_clientes.sql`: o arquivo inclui as migrações 0005, 0006 e 0007 em uma transação completa BEGIN/COMMIT. Não executar também os três arquivos individuais. Se alguma delas já tiver sido aplicada, conferir o estado antes de executar o consolidado. O script não se destina a execução repetida.

Para execução pelo fluxo de migrações, aplicar os arquivos 0005, 0006 e 0007 em ordem, sem executar o consolidado. O consolidado 0005–0007 já foi aplicado ao projeto de produção pelo plugin Supabase, na migração `controle_clientes_planos_suporte_cobrancas`. Não reaplicar estes arquivos nesse projeto. As sete tabelas novas tiveram RLS confirmado; a leitura anônima retornou zero cobranças e zero chamados e somente os três planos ativos.

Depois da atualização do banco, publicar a proposta e validar com contas separadas: master, proprietário de organização, leitor e cliente de outra organização. Testar chamado/resposta/leitura, aviso segmentado/arquivamento, exportação e filtro de empresa. Conferir o catálogo antes de habilitar os limites.

Pagamentos exigem ainda variáveis de servidor e homologação de cada conta. Detalhes em `docs/pagamentos-plataforma.md`. Os gateways ficam desabilitados por padrão. Não configurar chaves secretas em variáveis VITE.

## Próximas áreas do produto

| Área | Situação |
| --- | --- |
| Organizações, usuários, suspensão e landing page | Implementadas na entrega anterior |
| Planos, catálogo público e limites no banco | Implementados nesta proposta |
| Atendimento, sugestões e avisos no painel | Implementados nesta proposta |
| Relatórios, acompanhamento de uso e configurações do master | Implementados nesta proposta |
| Checkouts avulsos de quatro gateways | Implementados; dependem de configuração e testes reais |
| Assinaturas recorrentes, webhooks e alteração automática de plano | Pendente |
| Colaboradores do master com permissões por área | Pendente; não conceder master total para simular suporte restrito |
| Promoções, cupons, afiliação e recompensas | Pendente |
| Leitor de editais com IA e consumo por organização | Implementado (`docs/leitor-editais.md`); depende da chave da IA e da liberação do módulo "agentes" |
| Demais agentes de IA (Radar, Cotador, Jurídico, Sentinela, Termômetro) | Pendentes |
| Prospecção contínua, filas e monitoramento automático de portais | Pendente; busca atual funciona por consulta manual |
| Conversas do assistente e aprendizado dos agentes | Pendente |
| Push, e-mail e WhatsApp automáticos | Pendentes de infraestrutura, consentimento e configuração |
| Domínios próprios e contas financeiras vinculadas de clientes | Pendentes; contas de usuário não equivalem a subcontas de gateways |

As listas operacionais têm limites explícitos (100 chamados/avisos, 200 mensagens recentes, 200 cobranças) e não substituem relatórios globais agregados. Testes locais de autorização não substituem validação da produção, homologação de gateways ou uma revisão independente de segurança.
