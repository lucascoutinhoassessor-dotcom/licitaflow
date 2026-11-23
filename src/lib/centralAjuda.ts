/** Conteúdo da Central de Ajuda: categorias, tutoriais passo a passo, vídeos e perguntas frequentes. */

export type CategoriaAjuda = 'primeiros' | 'oportunidades' | 'processos' | 'analise' | 'ia' | 'documentos' | 'conta'

export const CATEGORIAS_AJUDA: { id: CategoriaAjuda; rotulo: string; descricao: string }[] = [
  { id: 'primeiros', rotulo: 'Primeiros passos', descricao: 'Configure a conta, a empresa e a equipe.' },
  { id: 'oportunidades', rotulo: 'Oportunidades', descricao: 'Encontre editais e leve-os para o funil.' },
  { id: 'processos', rotulo: 'Processos e prazos', descricao: 'Acompanhe cada licitação até o resultado.' },
  { id: 'analise', rotulo: 'Análise e preços', descricao: 'Mercado, concorrentes e preços homologados.' },
  { id: 'ia', rotulo: 'Agentes de IA', descricao: 'Leitor de editais, jurídico e assistentes.' },
  { id: 'documentos', rotulo: 'Documentos', descricao: 'Certidões e habilitação sempre em dia.' },
  { id: 'conta', rotulo: 'Plano e cobrança', descricao: 'Limites, faturas e dados da conta.' },
]

export interface Tutorial {
  id: string
  categoria: CategoriaAjuda
  titulo: string
  resumo: string
  minutos: number
  passos: string[]
  dica?: string
  rota?: string
  rotuloRota?: string
}

export const TUTORIAIS: Tutorial[] = [
  {
    id: 'configurar-empresa',
    categoria: 'primeiros',
    titulo: 'Cadastre a sua empresa',
    resumo: 'O CNPJ que participa das licitações é a base das buscas, dos documentos e das propostas.',
    minutos: 2,
    passos: [
      'Abra o menu do usuário, no canto superior direito, e entre em "Minhas empresas".',
      'Clique em "Nova empresa" e informe o CNPJ, a razão social e os dados de contato.',
      'Salve. Se você participa com mais de um CNPJ, repita o cadastro para cada um.',
    ],
    dica: 'Mantenha os dados iguais aos do SICAF: eles são usados nas minutas e propostas.',
    rota: '/app/empresas',
    rotuloRota: 'Abrir Minhas empresas',
  },
  {
    id: 'convidar-equipe',
    categoria: 'primeiros',
    titulo: 'Convide a sua equipe',
    resumo: 'Dê acesso a quem trabalha com você e defina o que cada pessoa pode fazer.',
    minutos: 2,
    passos: [
      'Entre em "Equipe" pelo menu do usuário.',
      'Clique em "Convidar pessoa", informe o e-mail e escolha o papel.',
      'Copie o link gerado e envie para a pessoa. O convite vale por 7 dias.',
      'Convites pendentes ficam listados na mesma tela, onde podem ser copiados de novo ou cancelados.',
    ],
    rota: '/app/equipe',
    rotuloRota: 'Abrir Equipe',
  },
  {
    id: 'instalar-app',
    categoria: 'primeiros',
    titulo: 'Instale o LicitaForce no celular e no computador',
    resumo: 'Use como aplicativo, com ícone próprio e notificações.',
    minutos: 1,
    passos: [
      'Abra o LicitaForce no Chrome, Edge ou Safari (não pelo navegador interno do Instagram ou WhatsApp).',
      'No Android e no computador, toque em "Instalar app" quando o aviso aparecer, ou use o menu do navegador.',
      'No iPhone, toque em Compartilhar e depois em "Adicionar à Tela de Início".',
      'Depois, abra sempre pelo ícone criado e permita as notificações para receber os alertas.',
    ],
  },
  {
    id: 'buscar-oportunidades',
    categoria: 'oportunidades',
    titulo: 'Encontre oportunidades',
    resumo: 'Busque editais abertos nos portais de compras com filtros por objeto, estado e modalidade.',
    minutos: 3,
    passos: [
      'Entre em Oportunidades > "Encontrar oportunidades".',
      'Digite o produto ou serviço que você vende e ajuste os filtros (estado, modalidade, período, valor).',
      'Clique em "Buscar oportunidades". Os resultados mostram órgão, objeto, datas e valor estimado.',
      'Abra uma oportunidade para ver os itens, os arquivos do edital e as empresas que costumam disputar.',
    ],
    dica: 'Use palavras curtas e específicas, como "luva nitrílica" em vez de "material hospitalar".',
    rota: '/app/oportunidades',
    rotuloRota: 'Buscar oportunidades',
  },
  {
    id: 'importar-processo',
    categoria: 'oportunidades',
    titulo: 'Leve uma oportunidade para os seus processos',
    resumo: 'Transforme um edital encontrado em um processo que a equipe acompanha.',
    minutos: 1,
    passos: [
      'Na lista de oportunidades, clique em "Adicionar aos processos".',
      'O processo é criado com órgão, objeto, datas e itens do edital.',
      'Abra o processo em Negócios > Processos para definir responsável, preços-limite e etapa.',
    ],
    rota: '/app/oportunidades',
    rotuloRota: 'Abrir Oportunidades',
  },
  {
    id: 'funil-processos',
    categoria: 'processos',
    titulo: 'Use o funil e o kanban de processos',
    resumo: 'Acompanhe cada licitação da captação ao resultado.',
    minutos: 3,
    passos: [
      'Entre em Negócios > Processos. Cada coluna é uma etapa: captação, análise, proposta, disputa, habilitação, recurso e resultado.',
      'Arraste o cartão para a próxima etapa conforme o processo avança.',
      'Abra o processo para registrar itens, preços-limite, anotações e acompanhar a linha do tempo.',
      'Para cadastrar um processo que não veio da busca, clique em "Novo processo".',
    ],
    rota: '/app/processos',
    rotuloRota: 'Abrir Processos',
  },
  {
    id: 'agenda-prazos',
    categoria: 'processos',
    titulo: 'Nunca perca um prazo',
    resumo: 'Sessões, impugnações, esclarecimentos, recursos, entregas e vigências num só calendário.',
    minutos: 2,
    passos: [
      'Entre em Negócios > Agenda e prazos.',
      'Clique em "Novo prazo", escolha o tipo, a data e, se quiser, o processo relacionado.',
      'Os prazos também podem ser lançados de dentro de cada processo e das minutas do Jurídico.',
      'Ative as notificações do navegador para ser avisado antes do vencimento.',
    ],
    rota: '/app/prazos',
    rotuloRota: 'Abrir Agenda e prazos',
  },
  {
    id: 'historico-precos',
    categoria: 'analise',
    titulo: 'Pesquise preços homologados',
    resumo: 'Veja quanto o governo pagou por um produto, com marca, fornecedor e órgão.',
    minutos: 2,
    passos: [
      'Entre em Análise > Histórico de preços.',
      'Pesquise o produto ou serviço e escolha o item do catálogo que corresponde ao que você vende.',
      'Filtre por estado do órgão e período. Abra uma compra para ver todos os lances e o vencedor.',
    ],
    dica: 'Use o histórico para definir o preço-limite do processo antes da disputa.',
    rota: '/app/historico-precos',
    rotuloRota: 'Abrir Histórico de preços',
  },
  {
    id: 'analise-mercado',
    categoria: 'analise',
    titulo: 'Entenda o mercado do seu produto',
    resumo: 'Valor contratado por estado e por mês, principais órgãos, empresas vencedoras e marcas.',
    minutos: 3,
    passos: [
      'Entre em Análise > Análise de mercado.',
      'Pesquise o produto e clique em "Analisar".',
      'Use os filtros de período, estado, esfera e modalidade para focar no que interessa.',
      'Em Análise de empresas, consulte um CNPJ concorrente para ver onde e quanto ele vende.',
    ],
    rota: '/app/analise-mercado',
    rotuloRota: 'Abrir Análise de mercado',
  },
  {
    id: 'leitor-edital',
    categoria: 'ia',
    titulo: 'Leia um edital com IA',
    resumo: 'Riscos, prazos, documentos de habilitação e condições de proposta em minutos.',
    minutos: 2,
    passos: [
      'Abra uma oportunidade ou um processo que tenha os arquivos do edital.',
      'Acione o Leitor de editais. A IA lê o documento e organiza o resumo por seção.',
      'Confira riscos e pontos de atenção, datas, documentos exigidos e regras da proposta.',
      'Use "Ver edital" para conferir o trecho original sempre que precisar.',
    ],
    dica: 'A IA ajuda, mas a decisão é sua: confira no edital os pontos que definem a participação.',
    rota: '/app/agentes',
    rotuloRota: 'Ver Agentes de IA',
  },
  {
    id: 'minutas-juridicas',
    categoria: 'ia',
    titulo: 'Gere impugnações e recursos',
    resumo: 'Minutas com base na Lei 14.133, preenchidas com os dados do processo e com o prazo legal.',
    minutos: 3,
    passos: [
      'Entre em Jurídico e escolha o tipo: impugnação, esclarecimento, intenção de recurso, recurso ou contrarrazões.',
      'Selecione o processo e descreva o motivo com as suas palavras.',
      'Revise a minuta gerada, copie ou baixe o documento.',
      'Clique em lançar prazo para colocar a data-limite na agenda.',
    ],
    dica: 'Revise sempre o texto final com o seu jurídico antes de protocolar.',
    rota: '/app/juridico/impugnacao',
    rotuloRota: 'Abrir Jurídico',
  },
  {
    id: 'documentos-validade',
    categoria: 'documentos',
    titulo: 'Controle certidões e validades',
    resumo: 'Cadastre os documentos de habilitação e receba aviso antes de vencer.',
    minutos: 2,
    passos: [
      'Entre em Documentos pelo menu do usuário.',
      'Clique em "Novo documento", escolha a categoria, informe a validade e anexe o arquivo.',
      'O painel mostra o que está vencido ou vence em breve. Clique em "Ver" para filtrar.',
    ],
    rota: '/app/documentos',
    rotuloRota: 'Abrir Documentos',
  },
  {
    id: 'plano-uso',
    categoria: 'conta',
    titulo: 'Acompanhe o seu plano e o uso',
    resumo: 'Veja os limites contratados, o consumo de IA e as cobranças.',
    minutos: 1,
    passos: [
      'Entre em "Meu plano e uso" pelo menu do usuário para ver o plano e os limites.',
      'Em "Cobranças do LicitaForce" ficam as cobranças e a situação de cada pagamento.',
      'Para mudar de plano, abra uma solicitação nesta página.',
    ],
    rota: '/app/plano',
    rotuloRota: 'Abrir Meu plano',
  },
]

export interface VideoAjuda {
  id: string
  categoria: CategoriaAjuda
  titulo: string
  descricao: string
  duracao: string
  /** ID do vídeo no YouTube. Sem ID, o cartão aparece como "em produção". */
  youtube?: string
}

export const VIDEOS: VideoAjuda[] = [
  { id: 'tour', categoria: 'primeiros', titulo: 'Tour pelo LicitaForce', descricao: 'Uma visão geral do painel, dos menus e do que cada módulo faz.', duracao: '4 min' },
  { id: 'buscar', categoria: 'oportunidades', titulo: 'Como encontrar boas oportunidades', descricao: 'Filtros, palavras-chave e como avaliar um edital antes de entrar.', duracao: '6 min' },
  { id: 'funil', categoria: 'processos', titulo: 'Organizando o funil de processos', descricao: 'Do edital ao resultado, com prazos e responsáveis.', duracao: '5 min' },
  { id: 'precos', categoria: 'analise', titulo: 'Definindo o preço com dados reais', descricao: 'Histórico de preços e análise de concorrentes na prática.', duracao: '7 min' },
  { id: 'leitor', categoria: 'ia', titulo: 'Leitor de editais com IA', descricao: 'Como ler um edital em minutos sem deixar passar exigências.', duracao: '4 min' },
  { id: 'juridico', categoria: 'ia', titulo: 'Impugnações e recursos', descricao: 'Gerando e revisando minutas jurídicas com prazo calculado.', duracao: '6 min' },
]

export interface PerguntaFrequente {
  categoria: CategoriaAjuda
  pergunta: string
  resposta: string
}

export const PERGUNTAS: PerguntaFrequente[] = [
  { categoria: 'oportunidades', pergunta: 'De onde vêm as oportunidades?', resposta: 'Dos portais oficiais de compras públicas, principalmente o PNCP (Portal Nacional de Contratações Públicas), que reúne as licitações publicadas pela nova Lei 14.133. A base é atualizada várias vezes ao dia.' },
  { categoria: 'oportunidades', pergunta: 'Não encontrei um edital que sei que existe. O que fazer?', resposta: 'Tente palavras mais curtas, amplie o período e remova filtros de estado ou modalidade. Editais retirados ou suspensos pelo órgão podem deixar de aparecer. Se mesmo assim não encontrar, abra uma solicitação com o número do edital e o órgão.' },
  { categoria: 'processos', pergunta: 'Qual a diferença entre oportunidade e processo?', resposta: 'Oportunidade é qualquer edital publicado. Processo é uma oportunidade que a sua equipe decidiu acompanhar: ele ganha etapa, responsável, preços-limite, prazos e histórico.' },
  { categoria: 'analise', pergunta: 'Os preços do histórico são confiáveis?', resposta: 'São os valores homologados informados pelos próprios órgãos nas compras públicas. Use-os como referência: condições de entrega, quantidade e marca mudam o preço de uma compra para outra.' },
  { categoria: 'ia', pergunta: 'A IA substitui a leitura do edital?', resposta: 'Não. Os agentes de IA aceleram a análise e apontam riscos e exigências, mas a conferência final do edital e das minutas deve ser feita por você ou pelo seu jurídico.' },
  { categoria: 'ia', pergunta: 'Existe limite de uso da IA?', resposta: 'Sim, cada plano tem um limite mensal de uso dos agentes de IA. O consumo atual aparece em "Meu plano e uso".' },
  { categoria: 'documentos', pergunta: 'Os meus documentos ficam seguros?', resposta: 'Sim. Os arquivos ficam guardados em armazenamento privado e só pessoas da sua organização com acesso conseguem abri-los.' },
  { categoria: 'primeiros', pergunta: 'Posso usar mais de um CNPJ?', resposta: 'Sim. Cadastre cada empresa em "Minhas empresas". Todas ficam na mesma organização e a equipe trabalha com todas.' },
  { categoria: 'primeiros', pergunta: 'Esqueci a minha senha.', resposta: 'Na tela de entrada, clique em "Esqueci minha senha" e informe o seu e-mail. Você recebe um link para criar uma nova senha.' },
  { categoria: 'conta', pergunta: 'Como cancelo ou mudo de plano?', resposta: 'Abra uma solicitação de suporte nesta página informando o que deseja. A equipe responde por aqui e você acompanha tudo na lista de solicitações.' },
  { categoria: 'conta', pergunta: 'Onde vejo as minhas faturas?', resposta: 'Em "Cobranças do LicitaForce", no menu do usuário, com a situação de cada pagamento.' },
]

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** true quando todas as palavras da busca aparecem no texto (sem acento e sem diferenciar maiúsculas). */
export function combinaBusca(busca: string, ...textos: string[]) {
  const palavras = normalizar(busca).split(/\s+/).filter(Boolean)
  if (!palavras.length) return true
  const alvo = normalizar(textos.join(' '))
  return palavras.every((p) => alvo.includes(p))
}
