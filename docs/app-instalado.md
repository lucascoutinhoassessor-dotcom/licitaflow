# App instalado: acompanhar a sessão e dar lances

Versão 2 · 27/11/2026 · Status: **plano, nada construído ainda**

Este plano atualiza o da [máquina de lances](maquina-de-lances.md) (23/11), que continua valendo nas regras e no banco. Ele acrescenta duas coisas pedidas pelo Lucas:

- **acompanhar a sessão ao vivo:** cada chamado do pregoeiro e cada passo da sessão;
- **cinco portais:** Compras.gov.br, BLL, BNC, Licitanet e Portal de Compras Públicas.

O que já foi descoberto no Compras.gov está na [fase 0](maquina-de-lances-fase0.md).

## 1. Por que instalado

A Sentinela vigia o PNCP de 10 em 10 minutos e está funcionando, mas o PNCP só mostra o que o órgão publica depois. O que acontece **dentro da sala** só aparece para quem está logado no portal, e muitas vezes há captcha:

- a mensagem do pregoeiro;
- "convoco o fornecedor X a enviar a proposta em 2 horas";
- item suspenso, aceito ou habilitado;
- intenção de recurso aberta.

Por isso o acompanhamento de verdade precisa rodar no computador do cliente, com a sessão dele.

## 2. O que aprendemos com o SIGA Client (só referência, sem copiar código)

Olhamos o programa instalado em `AppData\Local\siga-client` (versão 0.7.2), só a estrutura e as dependências declaradas:

- É Electron com Electron Forge, Webpack e instalador Squirrel, que se atualiza sozinho.
- Sobe um **servidor local** (Express) dentro do programa, que o site deles chama no `localhost`.
- Lê as páginas dos portais por HTTP e interpreta o HTML (parse5, xpath).
- Guarda as sessões dos portais (`sigasess`, `cnsess`) e o login gov.br numa partição própria.

**O que fazemos diferente:**

- **Sem servidor local.** O programa grava os eventos no Supabase, com o mesmo RLS do site. O site e o celular recebem em tempo real (Realtime e push), mesmo longe do computador, e nenhuma porta fica aberta no `localhost`.
- **Ler o que a própria página do portal recebe.** Não refazemos as chamadas por fora. Um script de pré-carregamento na janela do portal escuta as respostas e o WebSocket da própria página. Assim, o captcha e o login continuam com a página e com o usuário, e não contornamos nenhuma proteção.

## 3. O que o programa faz

### Acompanhar (primeiro, porque é o que está fazendo falta)

- Uma janela, ou aba, por pregão, com a sala de disputa do portal aberta e logada pelo usuário. Pode ficar minimizada.
- Cada novidade vira um evento em `sessao_eventos`:
  - **mensagem do pregoeiro** (texto completo, com destaque quando cita a empresa do cliente);
  - **convocação com prazo** (anexo, proposta ajustada, amostra), com a contagem regressiva;
  - **mudança de fase do item:** aberto, aleatório, prorrogação, encerrado, aceitação, habilitação, recurso, adjudicado;
  - **lance novo, posição do cliente e melhor lance;**
  - **sessão suspensa ou reaberta.**
- **Avisos:**
  - som e notificação do Windows no computador;
  - push no celular (usa o push que já existe);
  - linha do tempo ao vivo na tela do processo no site, numa aba "Sessão".
- Mensagens que pedem ação (convocação, prazo de recurso) entram nos Prazos do processo.

### Dar lances (depois)

Segue as regras do plano de 23/11:

- **Nunca abaixo do preço-limite.** Item sem preço-limite não entra no automático.
- Respeita os intervalos e a variação mínima do portal.
- O botão de parar fica sempre à vista.
- Modos: **assistido** (um clique para confirmar), **cobrir o melhor** e **só no fim**.

## 4. Um conector por portal

Cada portal implementa a mesma interface, e o motor não muda:

| Função | O que faz |
|---|---|
| `entrada` | endereço de login e como perceber que o usuário logou |
| `abrirSala` | endereço da sala de um pregão |
| `lerEventos` | transforma o que a página recebe em eventos padronizados |
| `enviarLance` | dá o lance pela própria página (só na fase de lances) |

| Portal | Situação |
|---|---|
| Compras.gov.br | fase 0 feita: JWT na página, WebSocket STOMP, lance sem captcha; o chat tem captcha (a página resolve) |
| BLL | a descobrir: o usuário loga, e observamos uma sessão |
| BNC | a descobrir |
| Licitanet | a descobrir |
| Portal de Compras Públicas | a descobrir (já lemos as peças jurídicas dele) |

A descoberta de cada portal precisa de **uma sessão pública ao vivo**, só lendo, ou do ambiente de treinamento quando existir.

## 5. Banco (migração antes do código)

Além de `estrategias_lance`, `lances_disputa` e `maquinas_lances` do plano anterior, entram:

- `sessoes_acompanhadas`: processo, portal, identificação do pregão no portal, máquina que acompanha, situação (aguardando login, acompanhando, encerrada) e último sinal.
- `sessao_eventos`: sessão, horário oficial do portal, tipo, item, texto, prazo (quando houver), se cita o cliente e os dados brutos resumidos. Com Realtime e RLS pela organização.
- Módulo novo `app-instalado`, que nasce oculto até o master liberar.
- Limite por plano em `limites_ia`, no mesmo padrão dos agentes: sessões acompanhadas ao mesmo tempo (tipo simultâneo).

## 6. Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1. Esqueleto | Pasta `desktop/` (Electron e TypeScript), instalador para Windows, login do LicitaForce, janela do Compras.gov com login manual, sinal de vida, "computador conectado" no site | O Lucas instala, loga e o site mostra o computador conectado |
| 2. Acompanhar Compras.gov | Eventos da sala e do chat, aba "Sessão" no processo, som, push e prazos | Uma sessão real acompanhada do começo ao fim, sem dar lance |
| 3. Acompanhar os outros 4 portais | Um conector por portal, cada um descoberto com uma sessão ao vivo | Uma sessão acompanhada em cada portal |
| 4. Lance assistido | Compras.gov primeiro, no treinamento | Lances de treinamento com confirmação |
| 5. Lance automático | Modos automáticos com todas as travas; depois os outros portais | Disputa inteira de treinamento sem erro |

## 7. Decisões em aberto

- **Nome do programa:** a escolher (sugestões na conversa).
- Certificado de assinatura do Windows. Sem ele, aparece o aviso do SmartScreen na instalação.
- Onde publicar as atualizações: GitHub Releases, que é grátis e serve bem com o repositório público.
- Em quais planos entra e com qual limite de sessões simultâneas.

## 8. Máquina de lances (versão 0.2.0, 28/11/2026)

- Fica na tela do programa, seção "Máquina de lances". Cada pregão aberto na janela do portal vira um cartão, e cada item mostra:
  - lance mínimo (R$);
  - desconto por lance (R$ ou %) e intervalo (s);
  - as opções "4 casas decimais" e "Só no fim" (aleatório ou prorrogação);
  - o botão Ligar/Parar e o motivo do que o motor decidiu.
- **Modo simulação** nasce ligado: a máquina mostra o lance que daria, sem enviar. Para desligar, o programa pede confirmação. O botão **Parar tudo** desliga todos os itens na hora.
- O motor (`desktop/src/motor.cjs`) é uma função pura com estas travas:
  - nunca abaixo do mínimo; se ainda cobre o melhor lance, vai no mínimo;
  - só com o item aberto;
  - quem está ganhando não dá lance;
  - um envio por vez e o intervalo mínimo respeitado;
  - respeita a variação mínima do item.
- O ciclo (`desktop/src/maquina.cjs`) roda a cada novidade da sala e a cada segundo. Depois de 3 recusas seguidas do portal, desliga o item e avisa.
- O lance é enviado **pela própria página do portal** (`codigoEnviarLance`): `POST …/comprasnet-disputa/api/v1/compras/{compra}/itens/{n}/lances`, com o token que já está na página. O token não sai da janela.
- As estratégias ficam no computador (`userData/estrategias.json`).
- **A conferir na primeira disputa de treinamento:** os nomes dos campos da sala (fase, melhor valor, meu valor, posição, `faseItem`). As amostras ficam em `userData/descoberta/`.

## 9. Passo a passo no programa e publicação automática (0.2.1, 28/11/2026)

- **Passo a passo no topo do programa:** conta conectada, entrar no portal, abrir a sala de disputa e configurar e ligar.
  - O passo atual fica destacado, com o botão certo: "Abrir Compras.gov.br" ou "Ir para as minhas compras", que leva a janela do portal à lista de compras do fornecedor.
  - "Como o Pregão ao Vivo funciona" explica acompanhar, dar lances, simulação, Parar tudo e segurança.
- **Publicação:** enviar uma tag `vX.Y.Z` (igual à versão do `desktop/package.json`) dispara `.github/workflows/pregao-ao-vivo.yml`.
  - No Windows do GitHub, o workflow monta o instalador e publica a versão com `LicitaForce-Pregao-ao-Vivo-Setup.exe`, `latest.yml` e `.blockmap`.
  - O endereço e a chave pública do Supabase são lidos do site publicado (`scripts/config.mjs`). Sem `.env`, nenhum segredo é necessário.
- O autoteste (`LICITAFORCE_AUTOTESTE`) usa um perfil separado, para não mexer no programa instalado.
