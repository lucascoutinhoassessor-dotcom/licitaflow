# Jurídico com IA

Redige impugnação, pedido de esclarecimento, intenção de recurso, recurso e contrarrazões. O formulário do Jurídico continua montando a minuta sem IA e sem gastar limite. O botão **Redigir com IA** preenche os campos Fatos, Fundamentação, Pedidos e Perguntas, e o cliente revisa antes de baixar em Word.

## Como funciona

- **Rota:** `POST /api/agentes?agente=juridico&org=…`. O código fica em `server/juridicoIA.js`, e `server/agentes.js` repassa a chamada para ele.
- **Entrada:** o tipo da peça, o processo (opcional), os dados do formulário (relato, itens, ato recorrido, concorrente) e as teses da Lei 14.133 marcadas.
- **Contexto que a IA recebe:**
  - a leitura do edital pelo Leitor, quando o processo tem edital no PNCP e ele já foi lido (riscos e trechos);
  - até 4 peças parecidas da base (`buscar_pecas`, mesmo tipo, Lei 14.133), usadas só como referência de argumentos.
- **Modelo:** Opus (`MODELOS.juridico`), com effort high e saída estruturada. A resposta traz fatos, argumentos, pedidos, perguntas e pontos de atenção.
- **Regras do prompt:**
  - não inventa fatos e marca com `[COMPLETAR: …]` o que faltar;
  - só cita artigos da Lei 14.133 que conhece;
  - não cita jurisprudência que não foi fornecida;
  - não copia as peças de referência.

## Limites

| Plano | Peças com IA por mês |
| --- | --- |
| Teste grátis | 1 |
| Essencial | 5 |
| Profissional | 20 |
| Assessoria | 60 |
| Cancelado | 0 |

- O limite pode ser editado em master > Planos e tem exceção por cliente.
- Cada peça redigida grava uma linha em `ia_uso` com o custo. O limite renova no dia 1º.
- Há também um freio de 4 peças a cada 5 minutos por usuário.

## Requisitos

- Módulo "agentes" liberado.
- `ANTHROPIC_API_KEY` na Vercel. Sem a chave, a rota responde 503 e o botão mostra o aviso.
- Migração `20261126210000_juridico_ia.sql`, que acrescenta a chave `juridico` aos planos.
