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

Ela agora registra o início do acompanhamento no histórico de cada processo, mesmo sem mudanças. O painel mostra a empresa e o CNPJ vinculados, a situação publicada, os documentos consultados, falhas e a próxima consulta. Uma falha ou atraso do agendador não aparece como monitoramento ativo.

O painel também consulta o histórico oficial da contratação, incluindo publicações anteriores ao início do monitoramento, com data, operação, documento ou item e justificativa informada. A leitura percorre 100 registros por rodada e guarda as 200 publicações mais recentes consultadas; a interface apresenta as últimas cinco e identifica consulta parcial ou falha. Essas publicações antigas não geram push retroativo.

## Resultados por CNPJ

Quando a compra informa `existeResultado`, o servidor consulta os itens paginados e seus resultados públicos, incluindo cancelamentos e cadastro de reserva. O resumo cruza `niFornecedor` com o CNPJ da **empresa vinculada ao processo**, dentro da organização autorizada. Ele não usa a empresa atualmente selecionada no filtro e não envia o cadastro privado do cliente ao PNCP.

Cada rodada confere até 10 itens, com 5 consultas simultâneas, e continua do ponto salvo após 30 minutos. A tela identifica leituras parciais e falhas; resultados anteriores são preservados durante uma falha. Publicações e alterações de resultado entram nos avisos e no histórico. A primeira fotografia continua sem gerar alerta de mudança.

A ausência do CNPJ nos resultados não confirma derrota, desclassificação ou inabilitação. As etapas do Kanban continuam sob controle da equipe. O PNCP não fornece todos os lances, mensagens e acontecimentos da sessão em tempo real; acompanhe também o portal da disputa.

Referência dos endpoints e campos: [Manual de Integração do PNCP](https://pncp.gov.br/manual/pt-br/latest/singlehtml/), consultas de itens e de resultados do item.

Os níveis alto e médio vão por push para os membros da organização: um push por processo, que abre o processo ao ser tocado. Os três níveis entram no histórico do processo e na tela **Agentes de IA → Sentinela**.

## Como os avisos são escritos

- **Identificação da compra:** cada aviso traz modalidade, número e órgão (ex.: "Pregão Eletrônico nº 45/2026 · Prefeitura de X (MG)"). O push usa isso no título.
- **Documentos classificados:** o tipo vem do nome e do tipo informado ao PNCP, com o nome do arquivo limpo (sem extensão, sublinhados e códigos internos). Tipos:
  - errata / retificação;
  - resposta a esclarecimento;
  - impugnação;
  - aviso de suspensão ou nova data;
  - revogação ou anulação;
  - recurso / contrarrazões;
  - ata / julgamento;
  - resultado / homologação;
  - contrato / ARP;
  - nova versão do edital;
  - anexo;
  - aviso do órgão.
- **Antes e depois:** datas aparecem como "adiado" ou "antecipado", com a diferença em dias. O valor estimado mostra os valores em reais e a variação em %.
- **O que fazer:** cada aviso traz uma orientação curta ao licitante, citando a Lei 14.133 quando há prazo legal:
  - art. 55, § 1º: reabertura do prazo quando a mudança afeta as propostas;
  - art. 164: esclarecimento e impugnação até 3 dias úteis antes da abertura;
  - art. 165: recursos.

  A orientação também vai para a descrição do histórico do processo.
- **Push:** junta as mudanças por processo, com as de atenção primeiro, por exemplo "Errata / retificação do edital: Errata 01 (+1 outra mudança)".

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
   Para o acompanhamento por CNPJ, aplicar também as migrações posteriores, incluindo `20261125000005_sentinela_acompanhamento.sql`, antes de publicar a interface atualizada.
2. Publicar o código.
3. O módulo **agentes** precisa estar em "teste" ou "liberado" para a organização.
4. Para receber push, o usuário toca em "Ativar notificações" na tela de Avisos.

## Fora do escopo por enquanto

- Envio por e-mail. O SMTP já existe no master; falta definir quem recebe e com que frequência, para não virar spam.
- Mudança item a item (item cancelado ou deserto).
- Portais que exigem login ou captcha. Só lemos o que é público no PNCP.
