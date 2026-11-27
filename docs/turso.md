# Base rápida de dados brutos (Turso)

## Como funciona

1. **O Supabase dispara.** O pg_cron roda `licitaflow_turso.disparar()` a cada minuto. Ela faz um POST em
   `/api/oportunidades?acao=turso-coletar`, com o cabeçalho `x-coleta`.
2. **A Vercel coleta.** `server/turso.js` lê no PNCP os editais atualizados no dia, por modalidade, a partir da
   última página vista. Depois grava no Turso, nas tabelas `editais` e `itens`, com a busca por palavra em
   `editais_fts` e `itens_fts` (FTS5).
3. **Os painéis leem.** `/api/oportunidades?acao=turso-buscar` confere a sessão no Supabase e consulta o Turso.
   O master acompanha tudo em **Integrações → Base rápida de dados brutos**.

Assim, o dado bruto não passa pelo Postgres do Supabase, que está no plano Nano com pouca RAM.

## Conectar (passo a passo)

1. Banco criado em 22/11/2026: `licitaforce`, em São Paulo (aws-sa-east-1).
   URL: `libsql://licitaforce-lucas-cout.aws-sa-east-1.turso.io`.
2. No Turso, abra o banco, clique em **Create Token** (leitura e escrita, sem expiração) e copie o token.
3. Na Vercel (projeto `licitaflow-prod` → Settings → Environment Variables, ambiente Production), cadastre:
   - `TURSO_DATABASE_URL` = a URL do passo 1
   - `TURSO_AUTH_TOKEN` = o token do passo 2
   e faça um **Redeploy**.
4. Ligue a coleta no Supabase. O token do agendador já é gerado e guardado no banco pela migração 055:
   ```sql
   update licitaflow_turso.config set ativo = true where id;
   ```
5. Em alguns minutos, o cartão em Integrações mostra os editais guardados e a hora da última coleta.

Para desligar: `update licitaflow_turso.config set ativo = false where id;`

## Limites e próximos passos

### Cada rodada (até ~40 s)

1. **Atualizações do dia:** lê uma página por modalidade e deixa a última aberta, para pegar o que entrar depois.
2. **Carga completa:** uma vez por dia, lê todos os editais com proposta aberta (cerca de 32 mil, ou 650 páginas)
   e continua de onde parou. Só grava o edital que é novo ou que mudou na fonte.
3. **Histórico:** depois da carga do dia, lê até 3 páginas por rodada de `/contratacoes/publicacao`, do dia de
   ontem para trás, até 12 meses. O cursor fica em `coleta_estado.historico` (`AAAAMMDD:modalidade:página`), e
   o fim fica em `historico_completo_em`. Dispensa (8) e inexigibilidade (9) ficam de fora, porque são ~65% do volume.
   Cada página do PNCP leva de 7 a 15 s, então a carga de 12 meses (~20 mil páginas) leva cerca de uma semana.
   É a etapa que mais escreve: para já no nível de economia de escrita.
4. **Itens:** coleta os itens dos editais que abrem em até 30 dias, os mais próximos primeiro, 3 por vez.
5. **Limpeza:** encerrados há mais de 2 dias perdem os itens, mas o edital fica no histórico. Saem de vez as dispensas
   e inexigibilidades encerradas e tudo o que passou dos 12 meses. Também apaga as contagens vencidas do cache da busca.
6. **Contagens guardadas:** a cobertura dos itens é contada a cada hora e o tamanho real da base a cada 6 h
   (`count(*)`, preservando a precisão após exclusões). Os números ficam em `coleta_estado`; as buscas só leem o resultado.
7. **Compactação gradual:** documentos novos usam gzip em base64 quando isso reduz o tamanho. Os antigos são
   convertidos em lotes de até 50 por rodada, apenas com cota normal e tempo disponível. Filtros, itens e FTS
   continuam separados e pesquisáveis. A leitura aceita JSON antigo e gzip. A conversão mantém o rowid do edital.

A carga pendente continua do mesmo cursor quando muda o dia. Uma carga nova só começa após a anterior terminar.

Se o PNCP responder 429 (pedido para esperar), a coleta pausa por 5 minutos.

### Busca

`POST /api/oportunidades?acao=turso-buscar` usa os mesmos filtros e devolve o mesmo formato do
`buscar_oportunidades` do Postgres, só no modo "por data de abertura". Os resultados ficam guardados em cache por
60 s para cada combinação de filtros.

O app tenta o Turso primeiro. Durante a carga inicial ou enquanto faltam itens, entrega os resultados disponíveis
com aviso de cobertura parcial. Falhas de rede ou cota permitem recorrer ao Postgres nas buscas de abertos.
A tentativa do Turso tem limite de 12 s e a busca inteira, incluindo sessão e Postgres, de 30 s.

**Histórico (encerrados):** quando a abertura começa num dia passado, ou a busca é "por data de publicação", a
resposta traz `historico: true` e inclui os encerrados. O Postgres não tem esses editais, então não há volta para
ele: se o Turso falhar, o app mostra um erro. Nesses casos as contagens param em 1.000 (`totalLimitado`), para não
ler o período inteiro a cada busca. Os índices `editais_modalidade_encerramento`, `editais_orgao_encerramento` e
`editais_publicacao` são criados uma vez (marca `indices_historico`). Na busca, a modalidade vai como
`+e.modalidade` para o SQLite não usar o índice da limpeza e ordenar em memória.

### Próximo passo

Depois que a busca no Turso estiver conferida, enxugar no Supabase `oportunidades_indice`,
`oportunidades_itens_indice` e a fila de itens, medindo `pg_database_size` antes e depois.

## Cota do mês (para o Turso não bloquear o banco)

Esta instalação usa **Developer** por padrão: 2,5 bilhões de linhas lidas e 25 milhões escritas por ciclo.
`TURSO_PLANO` explícito na Vercel continua prevalecendo: se estiver `gratis`, atualize para `developer` e publique
novamente. A contratação do plano no Turso não altera as variáveis da Vercel automaticamente.
Limites conferidos em https://turso.tech/pricing em 25/11/2026. `TURSO_LIMITE_*` também prevalece sobre o plano.

Gzip economiza o conteúdo armazenado e transferido, mas não reduz por si só a cobrança por linhas lidas/escritas.
A migração tem custo de leitura e escrita único, limitado por rodada; não arquiva ou exclui editais adicionais.
O histórico mantém a política existente de 12 meses, sem dispensa e inexigibilidade encerradas.

## Indicadores da página inicial

`GET /api/oportunidades?acao=turso-resumo-hoje` expõe somente totais públicos do dia em Brasília, com cache de
5 minutos no servidor/CDN. A agregação usa o índice de publicação, sem descompactar documentos nem percorrer
itens individuais. É usada pela página pública e pelo painel autenticado, com data da última coleta e aviso de
cobertura parcial. Os números são da base coletada, não uma garantia do total nacional publicado no PNCP.

Itens mostram a soma conhecida e quantos editais já têm itens coletados. Materiais/serviços usam os tipos dos itens
ou a estimativa pelo objeto (editais mistos podem aparecer nos dois). As faixas são exclusivas: até R$ 50 mil,
acima de R$ 50 mil até R$ 250 mil e acima de R$ 250 mil; valores não divulgados ficam fora.
O link abre `/app/oportunidades?publicadas=hoje`, sujeito às modalidades/filtros liberados para a organização.

O plano grátis bloqueia o banco quando o mês passa de 500 milhões de linhas lidas ou 10 milhões de linhas escritas.
O app mede o próprio consumo e freia sozinho antes disso.

### Como o app mede

Cada resposta do Turso informa as linhas lidas e escritas (`rows_read` e `rows_written`). O cliente soma esses
números e grava o total do ciclo em `coleta_estado`, nas chaves `lidas:<início do ciclo>` e
`escritas:<início do ciclo>`. A soma vai junto do pedido seguinte, sem ida extra ao banco. A medição é do app: o
painel do Turso (**Usage**) continua sendo a referência oficial.

### Como o app freia

| Nível | Quando | O que muda |
|---|---|---|
| normal | menos de 70% | nada |
| economia | de 70% a 90%, ou ritmo que passaria de 100% no fim do ciclo | contagens da busca valem 30 min; se for escrita, a coleta roda em minutos alternados e os logs de uso param |
| crítico | de 90% a 97% | a busca do app volta para o Supabase; a coleta só acompanha as atualizações do dia |
| parado | 97% ou mais | coleta e busca no Turso param até virar o ciclo |

O cartão **Integrações → Base rápida de dados brutos** mostra o plano, as duas barras de consumo, a projeção do
ciclo e o nível atual.

### Quanto custa uma busca

Medido em 23/11/2026 (painel do Turso → **Top Queries**, e num SQLite local com 36 mil abertos e 100 mil encerrados):

| Busca | Antes | Agora |
|---|---|---|
| Todo o Brasil, sem palavra-chave | ~72 mil linhas | ~1 mil |
| Um estado grande (SP) | ~72 mil | ~1 mil |
| Um estado pequeno (AC) | ~78 mil | ~130 |
| Abrir o seletor de órgão | (vinha em toda busca) | ~36 mil, só quando abre, 30 min em cache |
| Palavra-chave | ~75 mil | uma linha por edital que tem a palavra (inclui o histórico) |

O que mudou: a contagem para em 1.000 ("Mais de 1.000 oportunidades"), a lista de órgãos só é lida quando o
usuário abre o seletor (`?acao=turso-orgaos`), e o índice `editais_uf_abertos` começa pela UF.

Em 22/11/2026, 98% das 892 milhões de linhas lidas do mês vieram de um único comando da coleta
(`delete from editais_fts where controle = ?`), já corrigido. Confira o painel **Top Queries** ("This month")
antes de culpar a busca.

### O que foi feito para gastar menos

- **Leituras da busca:**
  - O índice `editais_abertos` cobre todas as colunas dos filtros, a UF e o nome do órgão. Contar, paginar e
    listar órgãos lê só o índice, sem abrir cada linha da tabela. É um índice largo só: com o histórico, criar cada
    um custa uma escrita por edital.
  - A ordem do índice é a mesma da busca, então não há ordenação extra.
- **Cache das contagens:**
  - O total e a lista de órgãos de cada combinação de filtros ficam guardados no próprio Turso (`cache_busca`).
    Valem para todas as instâncias da Vercel.
  - Antes, a chave do cache levava a hora atual, e o cache nunca acertava.
- **Contagens globais:** o tamanho da base e a cobertura dos itens eram contados a cada busca e a cada 5 min no
  cartão do master. Agora quem conta é a coleta, de hora em hora ou a cada 6 h.
- **Escritas da coleta:**
  - Se só a data do edital mudou no PNCP, sem mudar o conteúdo, a coleta faz uma escrita em vez de regravar a linha
    e o FTS.
  - Os itens não são mais apagados quando o edital muda. Eles são conferidos de novo e só regravados se a lista
    mudou de fato. Enquanto isso, `itens_completos = 2` e a busca segue usando os itens guardados.
- **Fila de itens e limpeza:** índices parciais fazem a fila (`editais_fila_itens`) ler só os editais que faltam e a
  limpeza do histórico (`editais_com_itens`) ler só os que ainda têm itens.

As mudanças entram sozinhas na primeira rodada da coleta depois do deploy (chave `otimizacao` em
`coleta_estado`). A migração cria o índice largo uma vez: lê e escreve cada edital uma vez (com o histórico completo, ~600 mil escritas, cerca de 6% da cota grátis do mês).

### Se o Turso já bloqueou o banco

Quando a cota estoura, o Turso recusa tudo com o código `BLOCKED`. O app reconhece esse código e:

- a busca responde 409 `turso_cota`, e o app usa o Supabase;
- a coleta, os itens e os logs param de chamar o Turso por 15 min a cada vez, em vez de tentar a cada minuto;
- o cartão do master mostra **Bloqueada pelo Turso**.

Para liberar, contrate um plano pago (veja abaixo) ou espere o ciclo virar. O medidor do app só começa a contar a
partir do deploy. No primeiro ciclo, ele não sabe o que foi gasto antes: confira em Turso → **Usage**.

### Trocar de plano

Ao comprar um plano pago no Turso:

1. Na Vercel (projeto `licitaflow-prod` → Settings → Environment Variables, ambiente Production), cadastre
   `TURSO_PLANO` com um destes valores: `gratis`, `developer`, `scaler` ou `pro`.
2. Se o ciclo de cobrança não começa no dia 1, cadastre `TURSO_CICLO_DIA` com o dia em que ele começa, de 1 a 28.
3. Faça um **Redeploy**.

Os limites de cada plano estão em `server/turso-cota.js` (`PLANOS`):

| Plano | Linhas lidas por mês | Linhas escritas por mês |
|---|---|---|
| gratis | 500 milhões | 10 milhões |
| developer | 2,5 bilhões | 25 milhões |
| scaler | 100 bilhões | 100 milhões |
| pro | 250 bilhões | 250 milhões |

Confira os limites em turso.tech/pricing antes de cadastrar. Se o Turso mudar os números, cadastre
`TURSO_LIMITE_LEITURAS` e `TURSO_LIMITE_ESCRITAS` com os valores novos, sem mudar o código.

Nos planos pagos, passar da cota não bloqueia o banco: o excedente é cobrado à parte. O freio continua usando a cota
incluída no plano, para não gerar cobrança extra sem aviso. Para usar o excedente, aumente os dois limites.

### Histórico e cota

Com o histórico, a base vai de ~36 mil para ~600 mil editais (estimativa de 1,5 a 2 GB). Nada pode contar a base
inteira: as contagens do histórico param em 1.000 e o total do cartão em Integrações vem de `max(rowid)`.
