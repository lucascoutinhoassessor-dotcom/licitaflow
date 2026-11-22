# Sentinela (agente)

A Sentinela vigia no PNCP os editais dos processos em andamento e avisa quando algo muda. Ela não usa IA, então não gera custo de IA nem registro em `ia_uso`.

## O que ela detecta

| Mudança | Nível |
|---|---|
| Situação da compra (ex.: Divulgada → Suspensa, Revogada, Anulada) | alto quando suspensa, revogada ou anulada; médio nos outros casos |
| Prazo final das propostas (`dataEncerramentoProposta`) | alto |
| Início do recebimento de propostas | médio |
| Documento novo | alto se o nome tiver errata, retificação, impugnação, esclarecimento, aviso, suspensão, adiamento etc.; médio nos outros casos |
| Documento retirado ou inativado | baixo |
| Resultado publicado (`existeResultado`) | médio |
| Valor estimado alterado | baixo |
| Edital fora do PNCP (a compra e os arquivos respondem 404) | alto |

A primeira leitura de cada edital só guarda como ele está, sem gerar aviso.

Os níveis alto e médio vão por push para os membros da organização: um push por processo, que abre o processo ao ser tocado. Os três níveis entram no histórico do processo e na tela **Agentes de IA → Sentinela**.

## Como funciona

- O pg_cron roda `licitaflow_sentinela.disparar()` a cada 10 minutos. A função só chama a Vercel quando há edital com verificação vencida, em `GET /api/agentes?agente=sentinela&acao=verificar` com o header `x-coleta`. O token fica em `licitaflow_sentinela.config` e é conferido pelo banco.
- Cada rodada pega até 30 editais (`sentinela_lote`) e verifica 5 por vez.
- Para cada edital, a Sentinela lê a compra no PNCP. Se `dataAtualizacaoGlobal` não mudou e a lista de arquivos foi lida há menos de 6 h, para por aí: uma chamada só. Caso contrário, relê os arquivos e compara (`server/sentinela.js`).
- O resultado é gravado por `sentinela_gravar`. Os eventos ficam em `sentinela_eventos`, uma vez por edital, e entram no histórico de cada processo que acompanha aquele edital.
- **Frequência das verificações:**
  - a cada 30 min, nos 3 dias antes do prazo das propostas e na semana seguinte;
  - a cada 1 h, se a compra está suspensa;
  - a cada 2 h, no restante;
  - a cada 12 h, mais de 30 dias depois do prazo;
  - a cada 24 h, se o edital saiu do PNCP.

  Quando a consulta falha, a espera dobra a cada tentativa, de 30 min até no máximo 6 h.

## Quem é vigiado e limite por plano

- O processo precisa ter o número de controle do PNCP. Quem cria o processo pela tela de Oportunidades já vem com ele.
- A etapa não pode ser homologado, perdido nem desistência.
- A organização precisa ter o módulo **agentes** liberado (ou em teste para ela).
- O limite do plano (chave `sentinela` em **Planos e limites**) é de **processos vigiados ao mesmo tempo**, não de usos por mês. Os mais recentes têm preferência.
- Valores iniciais:

  | Plano | Processos vigiados |
  |---|---|
  | Teste grátis | 5 |
  | Essencial | 20 |
  | Profissional | 100 |
  | Assessoria | sem limite |
  | Cancelado | 0 |

  Na ficha do cliente dá para abrir exceção.

## Implantação

1. Aplicar `supabase/migrations/20261121000050_sentinela.sql`. Ela cria o agendamento no pg_cron.
2. Publicar o código.
3. O módulo **agentes** precisa estar em "teste" ou "liberado" para a organização.
4. Para receber push, o usuário toca em "Ativar notificações" na tela de Avisos.

## Fora do escopo por enquanto

- Envio por e-mail. O SMTP já existe no master; falta definir quem recebe e com que frequência, para não virar spam.
- Mudança item a item (item cancelado ou deserto).
- Portais que exigem login ou captcha. Só lemos o que é público no PNCP.
