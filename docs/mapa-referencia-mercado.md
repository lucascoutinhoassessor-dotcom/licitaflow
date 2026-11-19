# Mapa de funcionalidades: referência de mercado × LicitaFlow

Levantado a partir de uma gravação de tela de uma plataforma concorrente (19/11/2026), para orientar o roadmap.
Implementação própria: nomes, textos e visual do LicitaFlow; só dados públicos e oficiais.

| Área | O que a referência oferece | LicitaFlow hoje | Fonte de dados (pública) | Prioridade |
|---|---|---|---|---|
| **Oportunidades** | Busca com 10 mil+ resultados, filtros por UF, 19 portais, modalidades; etiquetas de categoria (ex.: "Móveis de escritório") | Busca indexada do PNCP com filtros de portal, modalidade, UF, valores e itens (Codex) | PNCP (contratações + itens) | Ampliar cobertura e etiquetas |
| **Jornais (buscas salvas)** | Salvar uma busca e receber as novidades | ❌ | Catálogo próprio + e-mail/WhatsApp | Alta |
| **Pesquisa por itens** | Itens com situação (aceito/cancelado), vencedor e valor homologado | Itens do edital (sem resultado) | PNCP: itens + **resultados** | Alta |
| **Órgãos** | Página do órgão: licitações, capacidade de pagamento (CAPAG) e prazo estimado de pagamento | ❌ | PNCP + Tesouro Nacional (CAPAG) + histórico de faturas | Média |
| **Pagômetro** | "Este órgão paga em dia?" (produto pago por crédito) | Prazo médio por órgão só com dados do cliente | Tesouro (CAPAG/SICONFI), Portal da Transparência | Média |
| **Negócios (funil)** | Kanban multiempresa com checklist de tarefas por negócio, "monitorado" | Kanban de processos ✅ (sem checklist) | — | Checklists e modelos de tarefas |
| **Agenda** | Calendário mensal com prazos de todos os negócios | Lista de prazos ✅ (sem calendário) | — | Média |
| **Contratações futuras** | Planos Anuais de Contratação: valores previstos por ano, órgão e categoria | ❌ | PNCP: PCA | Média |
| **Análise de empresas** | Por CNPJ: vitórias, derrotas, itens vencidos, desclassificações, inabilitações | ❌ | PNCP resultados + Compras.gov dados abertos | Alta |
| **Penalidades** | Sanções da empresa | ❌ | Portal da Transparência (CEIS/CNEP, chave gratuita) | Média |
| **Jurídico** | Base pesquisável de esclarecimentos e impugnações; minutas | ❌ | Compras.gov (a verificar) + IA | Média |
| **Converse com o edital** | IA baixa todos os arquivos, indexa e responde perguntas | ❌ (agente Leitor planejado) | PNCP arquivos + Claude API | Alta |
| **Chat de IA geral** | Assistente que consulta os dados da conta | ❌ | Claude API | Média |
| **Monitor de sessões** | Avisa mudanças no portal (e-mail, app, som), com agente desktop para sites com login/captcha | ❌ | Partes públicas: PNCP e Compras.gov. **Não** automatizamos login de terceiros nem captcha | Média (só fontes públicas) |
| **Máquina de lances** | Robô de lances (Compras.gov) | ❌ — **fora do escopo** (burla proteções dos portais) | — | Assistente de lances no lugar |
| **Modelos de tarefas** | Checklists reutilizáveis por tipo de negócio | ❌ | — | Junto com checklists |

## Cobertura de fontes (além do PNCP)

1. **PNCP completo**: todas as modalidades, itens, resultados (vencedores), documentos e PCA.
2. **Compras.gov.br dados abertos**: histórico federal, resultados por item, preços praticados.
3. **Diários oficiais municipais** (Querido Diário): avisos de municípios que ainda não publicam no PNCP.
4. **Tribunais de Contas e portais estaduais com dados abertos**: fonte por fonte.
5. **Tesouro Nacional e Portal da Transparência**: pagamento e sanções.

Portais privados (BLL, BNC, Licitações-e, Portal de Compras Públicas…) chegam pelo PNCP, onde o órgão é obrigado a publicar. Não fazemos raspagem com login nem quebra de captcha.
