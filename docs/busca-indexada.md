# Pesquisa indexada e coleta em segundo plano

## Problema e mudança

A varredura das páginas oficiais no clique de Buscar era incompatível com uma consulta comercial rápida. Esta entrega retira esse caminho do navegador e da API antiga. O usuário faz uma única RPC `buscar_oportunidades` no Supabase por pesquisa/página, sobre tabelas persistentes e índices GIN. Não há fallback que volte a percorrer editais externos quando o índice falha. O endpoint HTTP antigo responde 410 para orientar clientes antigos a recarregar.

Os resultados, contagem e filtros são calculados no banco antes da paginação (20 por página). As consultas pesquisam objeto, complemento, órgão e descrições dos itens já indexados. Acentos são normalizados e a configuração portuguesa com prefixo encontra variações como microcomputador/microcomputadores. Não há promessa de equivalência com as fontes, sinônimos ou totais de outro produto.

O objetivo de produto é p95 abaixo de 1 segundo de ponta a ponta. O benchmark local com 50.001 editais foi medido separadamente de rede, autenticação e hardware de produção. Não é uma medição de produção nem teste de carga de mil clientes. Execute `npm run test:indice` para gerar os números na máquina atual e verificar o uso do índice GIN sem forçar o plano. Antes de declarar o SLO atingido em produção, medir com dados reais, conexão real e concorrência representativa.

## Dados e permissões

`oportunidades_indice`, `oportunidades_itens_indice` e `oportunidades_catalogo_status` contêm somente dados públicos coletados e metadados de atualização. Não usam tabelas de organizações, documentos, contratos ou finanças para pesquisar. A pesquisa exige sessão autenticada, com RLS e sem permissão de escrita do cliente. O coletor, a fila e os transportes ficam em schema privado. Somente master pode pausar/retomar a coleta, com autorização no banco e auditoria administrativa.

Os preços de itens marcados como sigilosos são removidos na gravação, inclusive do JSON. Páginas incompletas de itens ficam ocultas ao cliente até terminar a coleta do edital. Mudança no edital/data de atualização invalida os detalhes antigos. A versão da fila usa timestamp canônico, independente do fuso da sessão. Itens já indexados abrem sem chamada à fonte. Quando ainda não coletados, a abertura de um edital pode consultar seus itens pontualmente e solicitar sua coleta; isso nunca participa da busca por palavras-chave.

Os filtros por item consideram apenas detalhes coletados e informam a quantidade de editais ainda com detalhes pendentes. A primeira carga de editais e o preenchimento dos itens são processos diferentes. Não apresentar resultados parciais como cobertura completa.

## Coleta

O PostgreSQL agenda HTTP assíncrono usando `pg_net`, com um único job `pg_cron` a cada 10 segundos. A função retorna após agendar, sem bloquear aguardando a internet. Há no máximo quatro pedidos em voo e 24 pedidos por minuto, com histórico persistente de envios. `Retry-After` numérico ou em data HTTP pausa o coletor; a pesquisa no índice continua respondendo. Falhas recebem retentativa e aparecem no status, sem apagar a base ou declarar uma coleta incompleta como completa.

A carga inicial percorre seis modalidades de propostas em aberto até 31/12/2099. Depois ocorrem ciclos de atualização por data e reconciliação diária dos editais abertos. As próximas atualizações dependem do término do ciclo anterior e dos limites da fonte; não prometem atualização a cada 15 minutos. Após a carga inicial, o orçamento de pedidos é dividido entre atualizações e detalhes, com prioridade para solicitações de itens dos usuários. Dados são compartilhados por todos os clientes, sem uma coleta nova para cada pesquisa.

Pedidos concluídos são limpos após sete dias; o histórico de limites e solicitações de itens após um dia. Editais encerrados há mais de 30 dias, cuja publicação também tem mais de 30 dias, podem ser removidos em lotes, com seus itens. Isso não exclui processos ou arquivos importados pelos clientes. O catálogo é de oportunidades abertas com histórico acumulado desde a implantação, não um espelho histórico integral das compras públicas.

Carga inicial e itens podem levar tempo para serem preenchidos. O cliente vê a quantidade disponível, cobertura parcial e última coleta. O master acompanha o estado em Integrações. Disponibilidade e atualização dependem da fonte, dos recursos do banco e dos limites do plano Supabase; não foram provisionadas novas instâncias ou assinaturas pagas.

## Implantação

Projeto existente: `licitaflow-app`, referência `tbsjasyvnuylnjrqrtba`.

1. Aplicar as migrações `20261117035403_indice_oportunidades.sql` e `20261117035735_coleta_oportunidades.sql`.
2. Executar `supabase/deploy/ativar_coleta_oportunidades.sql` para habilitar extensões e o job, usando o proprietário do banco. Não precisa cadastrar chaves de serviço no navegador, na Vercel ou na conversa.
3. Alternativa para SQL Editor: executar **uma única vez** `supabase/deploy/20261117_busca_indexada.sql`, que inclui os dois passos acima em uma transação. Não executar também os arquivos individuais. Não colar apenas BEGIN/COMMIT. Se já houver implantação parcial, conferir o estado antes de reaplicar.
4. Conferir `cron.job` e `cron.job_run_details`, respostas pertencentes ao coletor em `net._http_response`, fila privada e o status público. Verificar crescimento da base, aplicação das respostas e conclusão real da carga inicial.
5. Publicar o frontend somente após confirmar a migração, coleta funcionando e dados reais disponíveis. Até essa confirmação, manter a proposta sem merge para evitar interromper o sistema publicado.
6. Medir busca de termos como microcomputador, com mesmos filtros, usando sessão de cliente e base carregada. Conferir contagem, itens, permissões, latência e utilização do banco. A meta de desempenho só se considera validada após essa medição em produção.

Pausar por master mantém a pesquisa disponível sobre a base coletada. Para desfazer o frontend, publicar a versão anterior; para parar o coletor, marcar seu estado como inativo ou remover exclusivamente o job `licitaflow-coleta-oportunidades`. Não remover extensões nem filas de outros aplicativos. Os dados novos são separados dos dados dos clientes.
