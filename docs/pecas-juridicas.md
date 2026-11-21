# Peças jurídicas publicadas (aba Jurídico → Modelos publicados)

Busca em impugnações, esclarecimentos, intenções de recurso, recursos e contrarrazões já publicados nos portais de compras. Os filtros são palavra-chave, tipo de peça, órgão ou município, UF e "somente nova lei (14.133)". Cada peça pode ser lida na hora e virar ponto de partida da minuta ("Usar como modelo", que abre a aba "Escrever minuta" com o texto).

## Fonte: Portal de Compras Públicas

API JSON pública, sem login e sem captcha (`https://compras.api.portaldecompraspublicas.com.br`). O portal atende sobretudo prefeituras, câmaras, autarquias e alguns estados.

| Chamada | Uso |
|---|---|
| `GET /v2/licitacao/processos?pagina=N&limitePagina=50&dataInicial=D&dataFinal=D&tipoData=1` | processos com **sessão** (início dos lances) no dia D. São ~7 páginas por dia. O filtro `codigoStatus` é ignorado pela API. |
| `GET /v2/licitacao/{codigo}/documentos/processo` | arquivos do processo, com `tipo`, `nome` e `url` (`arquivos.portaldecompraspublicas.com.br/v1/download/…`) |
| `GET /v1/licitacao/{codigo}/chat?pagina=1&texto=recurso` | andamento filtrado: intenções de recurso, decisões, envios de recurso e contrarrazão |
| `GET /v2/licitacao{urlReferencia}` | detalhe; usado só para `lei14133` dos processos que têm peças |

O portal dá nomes padronizados aos anexos de cada fase. Por isso a classificação usa o nome do arquivo (`classificarDocumento` em `server/juridico.js`):

- `Pedidos de Impugnação - x.pdf` → impugnação (peça da empresa); `Julgamento da Impugnação - x.pdf` → decisão.
- `Esclarecimentos - x.pdf` → pergunta; `Resposta de Esclarecimento - x.pdf` → resposta.
- `Recurso item 0001 - EMPRESA` e `Contrarrazão do item 0001 - EMPRESA` (também "lote"), com empresa e item.
- `Julgamento do item 0001` (só quando houve recurso) e o tipo "Justificativa de revisão da fase recursal" → decisão do recurso.
- Em "Outros documentos", só nomes que dizem claramente o que são (ex.: "DECISÃO ADMINISTRATIVA SOBRE RECURSO.pdf").
- Intenção de recurso: frase do sistema "O fornecedor X declarou intenção de recurso para o item N" ou mensagem da própria empresa no chat. O motivo só aparece quando a empresa o escreve no chat.

Ficam de fora os relatórios que o portal gera na hora (tipo "Relatorio", `url: null`, como "Pedidos de Esclarecimento"). Eles saem por um gerador com fila e limite de uso, e não faz sentido acioná-lo em massa.

## Cobertura medida (21/11/2026)

Amostra de 50 processos (sessões de maio a julho de 2026), em fração dos processos:

| peça | processos com ela |
|---|---|
| alguma peça | 50% |
| esclarecimento | 30% |
| impugnação | 20% |
| intenção de recurso | 18% |
| recurso | 14% |
| contrarrazões | 12% |

Duas páginas de sessões de 12/08/2026 (100 processos) deram 35 processos com peças e cerca de 180 peças. Os PDFs têm texto (recurso com 14 a 20 mil caracteres, impugnação com 25 a 76 mil). PDFs digitalizados, Word e ZIP não abrem no app; ficam o "Baixar arquivo" e o "Abrir no portal".

## Fontes descartadas

- **Compras.gov.br (federal):** o quadro informativo (avisos, impugnações e esclarecimentos) e os recursos exigem hCaptcha em toda chamada. Não contornamos. A plataforma de referência (SigaPregão) tem peças federais: em 21/11/2026 vimos a busca deles (`/app/api/juridico/search?palavras=&tipos=R&uasg=&somenteNovaLei=`), com texto de PDFs do Compras.gov guardados como `/{ano}/{mes}/{dia}/{uasg+pregão}/{item}/{cnpj}/RECURSO….pdf`, e peças de 2021–2022 das páginas antigas do Comprasnet (`livre/Pregao/Acompanhar_Recurso1.asp`). O mais provável é que tirem isso da sessão dos próprios clientes no Comprasnet (eles distribuem um programa, o "B2G Monitor"). Não temos esse acesso.
- **dadosabertos.compras.gov.br:** o swagger (`/v3/api-docs`) não tem nenhum endpoint dessas peças. O OCDS não traz `enquiries` nem `complaints`.
- **Comprasnet antigo** (`www.comprasnet.gov.br/livre/pregao/lista_pregao.asp`): a listagem dá erro 500. Mesmo funcionando, só teria pregões legados.
- **PNCP:** não há tipo de documento para essas peças. Só 1 em 200 pregões encerrados tinha alguma, em "Outros Documentos".

## Como funciona

- **Índice pequeno** (`supabase/migrations/20261121000032_pecas_juridicas.sql`): `pecas_processos` guarda órgão, município, UF, modalidade, número, objeto, lei e data da sessão. `pecas_juridicas` guarda tipo, pedido ou resposta, título, empresa, item, link do arquivo, texto curto da intenção e data. O texto do PDF **não** é guardado.
- **Janela:** sessões entre 21 e 90 dias atrás (`licitaflow_juridico.config.janela_dias`). A passada 1 lê cada dia quando a sessão faz 21 dias; a passada 2 relê aos 60 dias, para pegar recursos e decisões que chegam depois. O que sai da janela é apagado. Estimativa: ~100 processos com peças e ~500 peças por dia de sessão, cerca de 25 MB em 90 dias.
- **Coleta:** o `pg_cron` roda `licitaflow_juridico.disparar()` a cada 5 minutos. A função só faz um GET em `/api/juridico?acao=coletar` (com o token de `licitaflow_juridico.config`) quando há dia pendente, então o banco Nano não processa JSON. A função da Vercel lê até ~21 s de páginas (cada uma leva ~5 s), grava pela chave de serviço (`pecas_coleta_gravar`) e avança a fila. A carga inicial dos ~70 dias (~500 páginas) leva umas 10 horas.
- **Pesquisa:** RPC `buscar_pecas` (sessão do cliente, RLS só de leitura). A palavra-chave usa tsvector em português, sem acento e com prefixo; termos separados por ";" valem como "qualquer um". Ela procura no objeto, no órgão, no município e no número do processo, e na empresa, no título e no texto da intenção. Não procura dentro do PDF.
- **Leitura:** `/api/juridico?acao=ler&url=…` aceita só URLs de `arquivos.portaldecompraspublicas.com.br/v1/download/<hex>`, exige login, tem limite de 20 leituras por minuto e cache de 6 h. Abre até 40 páginas do PDF com `unpdf`.

## Operação

- **Pausar:** `update licitaflow_juridico.config set ativo=false;`
- **Andamento:** `select passada, count(*) filter (where concluido_em is not null) feitos, count(*) from licitaflow_juridico.dias group by 1;` e `select public.pecas_status()` (com sessão).
- **Espaço:** `select pg_size_pretty(pg_total_relation_size('public.pecas_juridicas') + pg_total_relation_size('public.pecas_processos'));`. Se apertar, diminua `janela_dias`: a limpeza acontece na próxima gravação.
- **Trocar o endereço da função** (ex.: domínio novo): `update licitaflow_juridico.config set url='https://…/api/juridico?acao=coletar';`
