# Cotador (agente)

O Cotador monta a cotação dos itens de um processo. Fica em `/app/agentes/cotador`. Dá para abrir também pelo botão "Cotar com o Cotador" na aba Itens do processo. Ele não usa IA.

## O que faz

1. **Importar itens do edital:** traz do PNCP o número, o lote, a descrição, a unidade (normalizada, ex.: "UNIDADE (UN)" → "UN"), a quantidade e o valor estimado do órgão. O valor fica vazio quando o orçamento é sigiloso. Itens já cadastrados no processo, pelo número, não são duplicados.
2. **Preço de mercado:** cada item é casado com o catálogo do governo (`buscar_catalogo`), com as primeiras palavras significativas da descrição. Se a busca não achar, ele tenta com menos palavras. Dá para trocar o item do catálogo à mão.
   - Depois consulta o Painel de Preços (`/api/precos`, últimos 12 meses, Brasil inteiro) e guarda em `processo_itens.mercado` a mediana, o mínimo, o máximo, a média e o número de compras, na mesma unidade do item. Quando a unidade é diferente, a tela avisa.
   - Para não estourar o limite de 30 consultas por minuto, faz uma consulta por item do catálogo e espera 2,1 s entre elas.
3. **Sugestão de preço:**
   - O preço-limite é custo ÷ (1 − margem), a mesma conta da aba Itens.
   - O preço proposto sugerido é o valor do órgão; sem ele, a mediana do mercado. Nunca fica abaixo do preço-limite.
   - Cada item recebe uma situação:
     - **Competitivo:** limite abaixo da mediana;
     - **Apertado:** limite entre a mediana e o valor do órgão;
     - **Prejuízo:** limite acima do valor do órgão;
     - **Falta o custo** ou **Sem referência**.
   - "Aplicar preços sugeridos" preenche os itens que ainda não têm preço proposto.
4. **Planilha da proposta:** CSV com ";" e vírgula decimal, que abre direto no Excel em português. Traz cabeçalho (empresa, CNPJ, processo e órgão), item, lote, descrição, unidade, quantidade, marca/modelo, preço unitário, total e total geral. Campos que começam com "=", "+", "-" ou "@" ganham uma aspa na frente, para não virarem fórmula.

## Limite por plano

A chave `cotador` em `limites_ia` limita os **processos cotados por mês**. Cada processo conta uma vez por mês, na primeira importação ou pesquisa de preço (`cotador_usar`, registrado em `ia_uso` com custo zero). Valores iniciais:

| Plano | Processos por mês |
|---|---|
| Teste grátis | 3 |
| Essencial | 20 |
| Profissional | 100 |
| Assessoria | sem limite |
| Cancelado | 0 |

Também é preciso ter o módulo **agentes** liberado. No Kanban, o processo ganha o selo "Cotação em andamento", com quantos itens já têm preço de mercado.

## Próximo passo (com a chave da IA)

Usar o Claude Haiku para casar descrições difíceis com o catálogo, onde as palavras não batem.
