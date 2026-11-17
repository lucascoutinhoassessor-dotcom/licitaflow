# Busca e filtros de oportunidades

A interface usa a identidade do LicitaFlow e referências de fluxo enviadas pelo usuário. Inclui seleção dos 19 portais da referência e Outros portais, seis modalidades, UF, período de publicação, palavras-chave, órgão dos registros carregados, faixas de valor total e unitário, quantidade máxima de itens, registros sem valor divulgado, item exclusivo ME/EPP e exclusão de registro de preços.

A fonte continua sendo a API pública oficial PNCP; retirar o nome dos textos de produto não muda proveniência, URLs nem identificadores de controle. Não há integrações diretas autenticadas com todos os portais, robô de disputa ou captura de contas de terceiros. O portal é identificado primeiro pelo domínio do link de origem, depois pelo nome do publicador; origens desconhecidas ficam em Outros portais. Isso não garante cobertura integral do portal selecionado.

A fonte devolve até 50 editais por página/modalidade. A pesquisa percorre todas as páginas do recorte, aplica os filtros e só então pagina visualmente os resultados. A lista de órgãos é formada pelos registros consultados. A seção abaixo detalha abrangência, progresso e cache.

Filtros de item consultam o endpoint de itens de cada edital candidato, com quatro consultas simultâneas, cancelamento e paginação. O limite de verificação é 10 mil itens; respostas incompletas ou inválidas causam erro explícito, sem apresentar resultado parcial como completo. A quantidade máxima refere-se às linhas de itens do edital. A faixa unitária e o benefício ME/EPP precisam corresponder ao mesmo item. A presença de item exclusivo não classifica todo o edital como exclusivo. Dispensa não é rotulada automaticamente como eletrônica.

Valores ausentes ou zerados não comprovam sigilo. Faixas consideram valores positivos divulgados e os itens com orçamento sigiloso são excluídos da comparação de valores. Excluir SRP inclui apenas registros explicitamente marcados como não SRP. O link de origem só é exposto quando HTTPS válido; o link oficial permanece disponível.

Os filtros não são buscas salvas nem notificações automáticas. Não há monitoramento contínuo nesta entrega. Não exige migração adicional. Os testes incluem classificação, intervalos, seleção vazia, ME/EPP no mesmo item, sigilo, paginação, falha de item e cinco larguras de tela com dados simulados.


## Correção da abrangência da pesquisa

A partir desta entrega, a busca percorre todas as páginas do recorte selecionado antes de apresentar um total concluído. O padrão é Brasil inteiro, seis modalidades disponíveis e recebimento de propostas aberto, sem restringir a publicação aos últimos sete dias nem herdar a UF da empresa. O endpoint oficial exige data final; a consulta de propostas usa 31/12/2099 como limite de encerramento. O modo de publicações continua disponível com período explícito de até 366 dias.

A API oficial de consulta não fornece filtro textual. O endpoint de busca textual do portal respondeu 503 no ambiente de validação; a implementação usa o endpoint documentado e disponível, percorrendo as páginas. Por isso, pesquisas nacionais podem levar minutos. São quatro páginas simultâneas após a leitura das primeiras páginas das modalidades. A interface mostra progresso, resultados parciais, pausa e retomada; falhas não são convertidas em listas vazias ou totais definitivos. O total final conta somente editais únicos que passaram nos filtros. A paginação visual de 20 resultados ocorre depois da pesquisa, sem alterar o seu alcance.

`/api/oportunidades` é uma ponte de leitura para origem fixa e parâmetros validados, com projeção dos campos necessários e cache público compartilhado de cinco minutos na Vercel. Não lê sessão, organização, tokens ou dados de clientes. Falhas não são cacheadas como sucesso. Respostas 429 preservam `Retry-After`, interrompem a varredura e mostram uma espera antes de permitir retomada; não são repetidas imediatamente. O navegador reutiliza páginas públicas durante quinze minutos para mudar palavras-chave sem baixar novamente o mesmo recorte. Mudanças em UF, modalidade, situação ou datas de publicação usam outras chaves. O cache não substitui um índice próprio, uma sincronização contínua ou uma garantia de atualização instantânea. A fonte pode mudar durante a consulta.

Para filtros por item em consultas amplas, é necessário informar termo, UF ou órgão. Isso evita consultar detalhes de dezenas de milhares de editais sem um recorte. Até 10 mil páginas por modalidade e 10 mil itens por edital são aceitos; quando a fonte excede esses limites, o erro pede refinamento em vez de declarar a pesquisa completa.

## Consulta de itens

Cada cartão abre os itens do edital em uma janela própria. A lista permite pesquisar descrição/número e mostrar quantidade, unidade, benefício, critério de julgamento e estimativas publicadas, inclusive para dispensas, SRP e editais com orçamento sigiloso. Quando `orcamentoSigiloso` é verdadeiro, nenhum valor unitário ou total é exibido, mesmo que o payload contenha um número.

Agrupamentos usam somente identificadores de grupo/lote explicitamente fornecidos (`numeroGrupo`/`grupo`, `numeroLote`/`lote`). A API pública nem sempre contém esses dados; nesse caso, a interface informa a ausência, lista os itens individualmente e oferece o edital oficial. Não deduz lotes pela sequência dos itens, não redistribui itens e não promete revelar valores protegidos. A consulta não altera o edital nem transmite propostas.

Validação: regressão com microcomputadores na primeira e terceira páginas, falha de página, cancelamento, deduplicação, filtros e cache; sigilo preservado mesmo com preços numéricos no payload. Teste de navegador com respostas simuladas em 320, 390, 768, 1024 e 1440 px, incluindo reaproveitamento de cache, grupo/lote, sigilo, foco confinado e restauração de foco. Verificação real separada na fonte oficial; a quantidade do Siga Pregão depende também da sua cobertura e dos seus critérios.
