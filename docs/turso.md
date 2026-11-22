# Base rápida de dados brutos (Turso)

## Como funciona

1. **O Supabase dispara.** O pg_cron roda `licitaflow_turso.disparar()` a cada minuto. Ela faz um POST em
   `/api/oportunidades?acao=turso-coletar`, com o cabeçalho `x-coleta`.
2. **A Vercel coleta.** `server/turso.js` lê no PNCP os editais atualizados no dia, por modalidade, a partir da
   última página vista. Depois grava o JSON bruto no Turso, nas tabelas `editais_brutos` e `editais_busca` (FTS5).
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
3. **Itens:** coleta os itens dos editais que abrem em até 30 dias, os mais próximos primeiro, 4 por vez.
4. **Limpeza:** apaga os editais encerrados há mais de 2 dias.

Se o PNCP responder 429 (pedido para esperar), a coleta pausa por 5 minutos.

### Busca

`POST /api/oportunidades?acao=turso-buscar` usa os mesmos filtros e devolve o mesmo formato do
`buscar_oportunidades` do Postgres, só no modo "por data de abertura". Os resultados ficam guardados em cache por
60 s para cada combinação de filtros.

O app tenta o Turso primeiro e volta para o Postgres quando:
- a primeira carga completa ainda não terminou (resposta 409 `turso_carregando`);
- os filtros por item esbarram em mais de 10% de editais sem itens (resposta 409 `turso_itens`);
- o Turso falha.

O modo "por data de publicação" continua no Postgres.

### Próximo passo

Depois que a busca no Turso estiver conferida, enxugar no Supabase `oportunidades_indice`,
`oportunidades_itens_indice` e a fila de itens, medindo `pg_database_size` antes e depois.

### Limites do plano grátis do Turso

- 500 milhões de linhas lidas e 10 milhões de linhas escritas por mês, e 5 GB de espaço.
- Cada busca conta e agrupa os editais que passam pelo filtro, então lê milhares de linhas.
- O cache de 60 s e a gravação só do que mudou seguram o consumo. Acompanhe em Turso → Usage.
