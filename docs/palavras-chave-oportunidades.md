# Palavras-chave nas oportunidades

A pesquisa encontra os termos no objeto, no complemento ou nas descrições dos itens coletados. O nome do órgão, sozinho, não torna uma oportunidade relevante para um produto ou serviço; use o filtro de órgão para esse recorte.

Palavras juntas combinam os termos (`limpeza predial`). O ponto e vírgula separa alternativas (`notebook; computador`). A busca mantém a normalização de acentos e os prefixos já utilizados pelos dois bancos.

O tipo confirmado pelos itens prevalece sobre a estimativa pelo objeto. Quando a correspondência textual está apenas nos itens, o mesmo item precisa satisfazer o tipo selecionado, o intervalo de valor unitário e a exclusividade ME/EPP. Se o próprio objeto/complemento corresponde à pesquisa, os filtros de item continuam exigindo um item compatível. Os demais filtros são aplicados antes da paginação.

Aplicar `20261125000002_palavras_chave_relevantes.sql` para atualizar a pesquisa de reserva no Postgres e guardar o tipo individual dos novos itens. Nos itens antigos, o tipo só é recuperado quando o edital contém um único tipo confirmado; detalhes mistos sem tipo individual precisam ser recoletados para confirmar a correspondência. Não é necessário apagar o catálogo.

No Turso, o coletor reindexa até 100 editais antigos por rodada, com cursor persistente e suporte aos documentos compactados. Os novos registros já usam o texto corrigido. Até terminar essa atualização, registros antigos ainda podem corresponder pelo nome do órgão. A pesquisa por itens continua limitada aos detalhes disponíveis no catálogo.

Regressões: `server/turso.test.ts` e `npm run test:indice`, incluindo correspondência somente no órgão, edital misto, prevalência do tipo confirmado, preço/benefício no mesmo item, alternativas e UF.
