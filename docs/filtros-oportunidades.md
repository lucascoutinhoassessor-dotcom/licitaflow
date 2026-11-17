# Busca e filtros de oportunidades

A interface usa a identidade do LicitaFlow e referências de fluxo enviadas pelo usuário. Inclui seleção dos 19 portais da referência e Outros portais, seis modalidades, UF, período de publicação, palavras-chave, órgão dos registros carregados, faixas de valor total e unitário, quantidade máxima de itens, registros sem valor divulgado, item exclusivo ME/EPP e exclusão de registro de preços.

A fonte continua sendo a API pública oficial PNCP; retirar o nome dos textos de produto não muda proveniência, URLs nem identificadores de controle. Não há integrações diretas autenticadas com todos os portais, robô de disputa ou captura de contas de terceiros. O portal é identificado primeiro pelo domínio do link de origem, depois pelo nome do publicador; origens desconhecidas ficam em Outros portais. Isso não garante cobertura integral do portal selecionado.

Cada página consulta até 50 publicações por modalidade. Datas de publicação, modalidade e UF são enviadas à fonte; os demais filtros são aplicados ao lote carregado. A interface explica esse alcance e não chama a quantidade filtrada de total global. A lista de órgãos é formada pelos registros do lote. As modalidades são consultadas separadamente e os totais preservados nas páginas seguintes, mesmo que uma modalidade tenha menos páginas.

Filtros de item consultam o endpoint de itens de cada edital candidato, com quatro consultas simultâneas, cancelamento e paginação. O limite de verificação é 10 mil itens; respostas incompletas ou inválidas causam erro explícito, sem apresentar resultado parcial como completo. A quantidade máxima refere-se às linhas de itens do edital. A faixa unitária e o benefício ME/EPP precisam corresponder ao mesmo item. A presença de item exclusivo não classifica todo o edital como exclusivo. Dispensa não é rotulada automaticamente como eletrônica.

Valores ausentes ou zerados não comprovam sigilo. Faixas consideram valores positivos divulgados e os itens com orçamento sigiloso são excluídos da comparação de valores. Excluir SRP inclui apenas registros explicitamente marcados como não SRP. O link de origem só é exposto quando HTTPS válido; o link oficial permanece disponível.

Os filtros não são buscas salvas nem notificações automáticas. Não há monitoramento contínuo nesta entrega. Não exige migração adicional. Os testes incluem classificação, intervalos, seleção vazia, ME/EPP no mesmo item, sigilo, paginação, falha de item e cinco larguras de tela com dados simulados.
