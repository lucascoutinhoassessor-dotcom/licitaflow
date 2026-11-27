# Trazer o Postgres do Supabase para menos de 500 MB

Medição de 27/11/2026: **654 MB** (o plano grátis permite 500 MB).

| Tabela | Total | Composição |
|---|---|---|
| `public.oportunidades_indice` | 235 MB | heap 100 MB, TOAST 74 MB (`compra` jsonb), índices ~60 MB (GIN `busca` 16 MB, GIN `busca_itens` 21 MB) |
| `public.oportunidades_itens_indice` | 192 MB | heap 148 MB, pkey 44 MB. São 313 mil itens de 14,7 mil editais |
| `public.pecas_juridicas` | 81 MB | janela de 90 dias, texto de 2.000 caracteres |
| `licitaflow_coleta.jobs` | 29 MB | 32.254 jobs `itens` bloqueados desde a 056 (22/11) |
| `public.fornecedores_resumo` | 25 MB | |
| `public.oportunidades_busca` | 16 MB | |
| `licitaflow_turso.itens_pausados` | 13 MB | |

## Quem ainda usa as duas tabelas grandes

`oportunidades_itens_indice` (a coleta de itens no Postgres está pausada desde a 056; os itens novos vão para o Turso):
- `itens_oportunidade_indexados`: reserva da página do edital (`src/lib/itensIndice.ts`). O Turso é lido antes, e o PNCP vem como último recurso.
- `buscar_oportunidades`: só nos filtros por item (faixa de valor, exclusivo ME/EPP, tipo do item), e só quando o Turso devolve 409 e a busca volta ao Postgres.
- `limpar_catalogo`, `registrar_compra`, `registrar_itens`, `vetor_itens` e `migrar_itens_compactos`: fazem a manutenção da própria tabela.

`oportunidades_indice` ainda é a base de: `buscar_oportunidades` (reserva), `buscar_desertas`, `registrar_desertos` e `agendar_desertos` (itens sem vencedor), `licitaflow_radar.buscar`, `localizar_edital`, `solicitar_itens_oportunidade` e `oportunidades_controles_termos`. **Ela ainda não pode sair do Postgres.**

## Plano (cada passo precisa do OK do usuário)

**Passo 1. Esvaziar `oportunidades_itens_indice` (−190 MB, para ~465 MB).**
- `truncate public.oportunidades_itens_indice;` devolve o espaço na hora. Diferente do `delete` + `vacuum full`, não precisa de espaço livre para copiar a tabela.
- Junto: `delete from licitaflow_coleta.jobs where tipo='itens' and bloqueado and not concluido;` (os 32 mil jobs pausados, ~20 MB depois do vacuum) e `update public.oportunidades_indice set itens_completos=false, quantidade_itens=null, busca_itens=null where itens_completos or busca_itens is not null;`, para a reserva não prometer itens que não existem mais. A limpeza dos 21 MB do GIN `busca_itens` fica para o `vacuum full` do passo 2.
- O que se perde: a página do edital passa a ir do Turso direto ao PNCP quando o Turso não tem os itens. Os filtros por item ficam sem resultado quando a busca cai no Postgres. **Antes**, confirme no cartão do Turso (Integrações) que os itens estão em ≥90%, porque com isso a palavra-chave não volta mais ao Postgres.
- Para não voltar a crescer: deixe a 056 como está (coleta de itens no Postgres desligada).

**Passo 2. Encolher `oportunidades_indice` (cerca de −70 a −90 MB, para ~380 MB).**
- Com o espaço do passo 1 livre, rode `vacuum full public.oportunidades_indice` sozinho, com o coletor pausado (o editor do Supabase corta comandos acima de ~3 min). Isso aplica o `toast_tuple_target=1024` da 024 às linhas antigas e descarta o GIN `busca_itens`, já vazio.
- Hoje 22.387 dos 58.798 editais já estão encerrados (8.191 há mais de 7 dias). A retenção de 30 dias do tick só é necessária por causa dos desertos (2, 7 e 20 dias depois da sessão). Reduzir para 21 dias quase não muda nada hoje (há só 1 edital acima de 21 dias), então fica como está.

**Passo 3 (opcional). `pecas_juridicas` (81 MB).** Baixar `licitaflow_juridico.config.janela_dias` de 90 para 60 libera ~25 MB, depois de um `vacuum full`.

**Passo 4 (fase 2 do Turso).** Levar desertos, radar e `localizar_edital` para o Turso. Aí `oportunidades_indice` pode virar uma tabela enxuta (sem `compra` jsonb, que soma os 74 MB de TOAST), ou sair do Postgres.

Meça `pg_database_size(current_database())` antes e depois de cada passo.

## Por que isso também importa para a estabilidade

O Nano tem ~400 MB de RAM. Com 654 MB de dados, qualquer varredura de `oportunidades_indice` ou `oportunidades_itens_indice` tira o resto do cache da memória e o banco entra em swap. Foi o que travou o banco em 26/11 (13h10 UTC) e em 27/11 (08h10 UTC). A correção do cron está na migração `20261127130000_cron_sem_sobreposicao.sql`.
