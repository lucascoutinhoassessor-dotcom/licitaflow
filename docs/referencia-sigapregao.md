# Estudo de referência — plataforma de mercado (20/11/2026)

Estudo feito navegando pela conta do Lucas em uma plataforma concorrente (só leitura: nada foi criado, apagado ou enviado), olhando as telas, os menus, os painéis escondidos, os endereços de API que a página chama e os estilos (CSS) calculados. **Usamos como referência de estrutura e de linguagem visual. Não copiamos código, textos, nomes de produtos nem marca.** Complementa o [mapa de funcionalidades](mapa-referencia-mercado.md).

## 1. Linguagem visual (medida no CSS)

| Elemento | Valor medido | Aplicado no LicitaFlow |
|---|---|---|
| Fundo da página | `#0b0b0f` + degradê `rgba(20,22,29,.95) → rgba(18,28,55,.96)` | `.dark body` com degradê marinho (`src/index.css`) |
| Barra do topo | preto puro, logo à esquerda, menus no centro, ícones à direita | `bg-black` em `AppLayout.tsx` |
| Cartões | degradê `rgba(10,17,33,.92) → rgba(7,12,24,.9)`, borda `rgba(59,130,246,.18)`, raio 24 px, sombra `0 28px 66px -34px rgba(8,47,73,.5)` | classe `.lf-cartao` no `Card` (raio 16 px) |
| Cartão de boas-vindas | degradê 155° `#0b1526 → #050b16 → #111c33`, borda azul 24% | `.lf-hero` no Painel |
| Botão principal | pílula, degradê 135° `#10b981 → #0ea5e9`, texto branco 600, borda esmeralda 35% | `Button variante="primario"` (`.lf-degrade`, `rounded-full`) |
| Botão secundário | pílula, degradê escuro `#111827 → #1f2937 → #0f172a` | `variante="secundario"` |
| Destaque de texto | verde `#34d399` (nome do usuário); rótulo acima do título em `#10b981`, 12 px, maiúsculas, espaçamento 1,2 px | Painel |
| Títulos de edital | azul-claro (~`#7cc2ff`), 600 | `text-sky-300` nos cartões de Oportunidades |
| Etiquetas (chips) | pílula com contorno: texto `#6ee7b7`, borda `#047857`, 12 px 600; neutra com borda cinza | `Badge` com borda em todas as cores |
| Blocos por categoria | degradês translúcidos: verde, azul, âmbar, índigo, rosa (30% → 16%) | ícones dos indicadores do Painel |
| Abas | pílulas; a ativa preenchida em azul | `Abas` em pílulas |
| Tipografia | Inter; título principal 36 px/600 | já usamos Inter; títulos maiores |
| Botão flutuante | verde arredondado com selo "BETA" no canto (chat de IA) | ainda não temos chat de IA |

## 2. Telas e funcionalidades (aba por aba)

Legenda: ✅ temos · 🟡 temos parcialmente · ❌ não temos · ⛔ fora do escopo.

### Menu IA (agentes)
| Item | O que faz | LicitaFlow |
|---|---|---|
| Agente de prospecção (beta) | Todo dia cruza os editais novos com o perfil da empresa e põe os "matches" direto no funil, com o motivo | 🟡 temos palavras-chave por empresa, sem rodada diária automática |
| Leitor de editais (beta) | Lê o edital e os anexos e devolve um checklist (habilitação, prazos, riscos) com o trecho de origem | ❌ (planejado: "Agentes de IA") |
| Fornecedor (em breve) | Encontra fornecedores e monta a cotação item a item | ❌ |
| Jurídico (em breve) | Estratégia e minuta de impugnação/recurso | ❌ |
| Monitor | Vigia as sessões nos portais e avisa quando algo muda (app de desktop) | ❌ (exigiria login nos portais — fora do escopo) |
| Termômetro de pagamento | Nota de 0 a 100 e dias médios para o ente pagar | ❌ (fonte: dados abertos de pagamentos) |
| Conector de IA | Leva os agentes para ChatGPT, Claude, Gemini | ❌ |
| Integrações | Liga os serviços dos agentes | ❌ |

### Oportunidades
| Item | O que faz | LicitaFlow |
|---|---|---|
| Encontrar | Busca com palavras-chave, período de abertura, 20 resultados por página, "10.000+" | ✅ busca indexada no PNCP (13 modalidades) |
| Pesquisa avançada | Palavras separadas por `;`, **excluir** termos, tipo de item (material/serviço), modo de disputa, UFs, portais, modalidades, órgão, valor da compra e do item, sigilosos, ME/EPP, excluir SRP | ✅ desde 20/11/2026: vários termos com ";", excluir termos, material/serviço, modo de disputa e período de abertura (padrão: próximos 14 dias) |
| Meus jornais | Salva a pesquisa avançada e manda as oportunidades todo dia | ❌ (alta prioridade: busca salva + alerta diário) |
| Órgãos | 63 mil órgãos: esfera, município, CNPJ, UASGs, portal, licitações nos últimos 12 meses, nota de pagamento | ❌ |
| Encontrar por Nº | Busca direta pelo número do processo | 🟡 a busca já procura o número |
| Itens desertos | Itens que ficaram sem vencedor em um portal | ❌ |
| Cartão do resultado | Título "Modalidade Nº – Órgão / UF" em azul; objeto; etiquetas de categoria; data com "em X dias"; fonte; modalidade | ✅ refeito neste estudo |
| Detalhe do edital | Valor, SRP, abertura, modo de disputa, botões Acessar / Arquivos / "Converse com o edital", nota de pagamento, itens com quantidade e valor, assistente "adicionar aos negócios" em 3 passos (oportunidade → itens → nome e empresa), histórico de compras parecidas com vencedor e valor homologado | 🟡 página do edital com itens que abrem e fecham, agrupados por lote/grupo (20/11/2026); faltam histórico de preços e escolha de itens |

### Negócios
| Item | O que faz | LicitaFlow |
|---|---|---|
| Quadros (kanban) | Colunas Oportunidade, Qualificação, Disputa, Classificação, Contrato; filtro por empresa; ordenar; selecionar em lote; arquivados; lixeira; cartão com portal, modalidade, data, "monitorado" e progresso do checklist (0/15) | 🟡 temos kanban; faltam checklist, arquivados/lixeira e seleção em lote |
| Agenda | Calendário mensal com os eventos de cada negócio (participar da disputa, enviar recurso…), lista lateral de eventos | 🟡 temos Prazos em lista; falta a visão de calendário |
| Modelos de tarefas | Checklists prontos para aplicar ao criar um negócio | ❌ |

### Análise
| Item | O que faz | LicitaFlow |
|---|---|---|
| Análise de mercado | Mapa do Brasil, valor comprado por mês (gráfico de barras), total contratado e seis ângulos: correspondências, catálogo, estados, órgãos, empresas, marcas | ❌ |
| Histórico de compras | Itens de atas: descrição, situação (aceito/cancelado), abertura, quantidade, unidade, **vencedor** e **valor homologado** | ❌ (fonte: resultados de itens do PNCP) |
| Análise de empresas | Por CNPJ e período: participações, vitórias e derrotas, valores disputados e vencidos, vitórias por modalidade, desclassificações e inabilitações, gráficos | 🟡 resumo por empresa, marcas em lista e, desde 20/11/2026, desclassificações e inabilitações lidas das atas da sessão publicadas no PNCP (`server/atas.js`); faltam derrotas |

### Disputa e Jurídico
| Item | LicitaFlow |
|---|---|
| Robô de lances | ⛔ fora do escopo por decisão do produto |
| Peças jurídicas: busca em impugnações, esclarecimentos, intenções de recurso, recursos e contrarrazões, filtro por órgão e "somente nova lei" | ❌ |

### Menu da conta
Documentos (pastas, filtros por tipo e validade: com validade, próximos a vencer, vencidos) 🟡 · Minhas empresas ✅ · Integrações ❌ · Modelos de tarefas ❌ · Meus dados ✅ · Tema claro ✅ · Sair ✅.

### Página inicial
Carrossel de novidades · boas-vindas com duas ações · indicadores (negócios ativos, empresas, licitações publicadas hoje, eventos) · "publicadas hoje" por tipo (serviços/materiais) e faixa de valor · funil · agenda da semana e calendário · atalhos inteligentes · recomendadas para você (com o motivo do match). No LicitaFlow: boas-vindas e indicadores ✅ (refeitos), funil ✅, prazos ✅; faltam "publicadas hoje" e "recomendadas".

## 3. De onde vêm os dados deles (endereços observados)

- `/app/api/oportunidades` (busca), `/app/api/jornal` (jornais), `/app/api/empresa`.
- `/app/api/atas/historico-compras`, `/atas/analise-empresa/participacao`, `/atas/analise-empresa/motivos`, `/atas/sugestao-empresas`: base própria de **atas e resultados por item**.
- `/app/api/atas/portal-transparencia/...`: consulta ao Portal da Transparência (sanções e pagamentos).
- `/app/api/assistant/ia/{gemini,claude,openai}/status`: chat com vários provedores de IA.

## 4. Próximos passos sugeridos (em ordem de valor)

1. **Meus jornais**: busca salva e alerta diário por e-mail. Usa o índice que já existe e quase não ocupa espaço.
3. **Agenda em calendário** e **checklist por processo** com modelos de tarefas.
4. **Histórico de compras / vencedores por item**: resultados de itens do PNCP. É preciso medir o espaço antes, por causa do limite de 500 MB.
5. **Órgãos** com nota de pagamento, depois de estudar a fonte de pagamentos.

## 5. Desclassificações e inabilitações (20/11/2026)

- **Compras.gov.br (federal):** a página pública de acompanhamento (`comprasnet-fase-externa/public/v1/compras/{id}/itens/{n}/propostas`) traz as propostas e situações, mas cada chamada exige um token **hCaptcha**; sem ele a API devolve 204 vazio. Não automatizamos: seria contornar a proteção contra robôs. As compras federais quase nunca publicam a ata no PNCP.
- **PNCP (estados e municípios):** cerca de 8% a 10% dos pregões publicam a "Ata da Sessão", o relatório de julgamento ou o termo de homologação como PDF em `/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/arquivos`. O `server/atas.js` abre até 2 desses PDFs (com `unpdf`), separa os trechos que afirmam a desclassificação, inabilitação ou recusa e tira empresa, CNPJ, itens, data e motivo. PDFs escaneados (imagem) não têm texto e ficam de fora.
