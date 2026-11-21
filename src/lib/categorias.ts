import { normalizar } from './portais'

/**
 * Etiquetas curtas que dizem, em poucas palavras, do que se trata o edital.
 * Cada categoria tem termos procurados no objeto (sem acento, minúsculo).
 * Termo inteiro por padrão; "*" no fim de uma palavra aceita qualquer continuação
 * (ex.: "eletrodomestic*" pega eletrodoméstico e eletrodomésticos).
 */
const CATEGORIAS: [nome: string, termos: string[]][] = [
  ['Móveis de Escritório', ['mobiliario*', 'movel', 'moveis', 'mesa', 'mesas', 'cadeira*', 'armario*', 'estante*', 'gaveteiro*', 'poltrona*', 'sofa', 'sofas', 'longarina*', 'balcao', 'balcoes', 'arquivo* de aco']],
  ['MDF e Materiais de Construção', ['mdf', 'compensado*', 'madeira*', 'cimento', 'areia', 'tijolo*', 'argamassa*', 'material de construcao', 'materiais de construcao', 'telha*', 'ferragem', 'ferragens', 'vergalh*', 'brita', 'piso', 'pisos', 'revestimento*', 'tinta', 'tintas', 'bloquete*']],
  ['Obras e Engenharia', ['obra', 'obras', 'reforma', 'reformas', 'pavimentacao', 'engenharia', 'edificacao', 'ampliacao', 'recapeamento', 'drenagem', 'terraplanagem', 'terraplenagem', 'construcao de', 'calcamento', 'pintura predial', 'impermeabiliza*']],
  ['Suprimentos de informática', ['toner*', 'cartucho*', 'suprimento* de informatica', 'pen drive*', 'pendrive*', 'mouse', 'teclado*', 'cabo* de rede', 'hd externo', 'ssd', 'memoria* ram', 'cilindro* para impressora']],
  ['Equipamentos de informática', ['computador*', 'microcomputador*', 'notebook*', 'desktop*', 'monitor', 'monitores', 'impressora*', 'servidor* de rede', 'nobreak*', 'scanner*', 'tablet*', 'equipamento* de informatica', 'informatica']],
  ['Componentes eletrônicos', ['componente* eletronic*', 'equipamento* eletronic*', 'material eletronic*', 'materiais eletronic*', 'resistor*', 'capacitor*', 'placa* de circuito', 'suprimento* de informatica', 'pilha', 'pilhas', 'bateria', 'baterias']],
  ['Software e TI', ['software*', 'licenca* de uso', 'licenciamento', 'sistema* de gestao', 'sistema* informatizado*', 'desenvolvimento de sistema*', 'solucao tecnologica', 'computacao em nuvem', 'cloud', 'data center', 'outsourcing']],
  ['Telecomunicações e Internet', ['telefonia', 'internet', 'link* de dados', 'fibra optica', 'telecomunica*', 'radiocomunica*', 'radio* comunicador*']],
  ['Veículos', ['veiculo*', 'automovel', 'automoveis', 'pick-up', 'pickup', 'picape*', 'caminhonete*', 'caminhao', 'caminhoes', 'onibus', 'micro-onibus', 'motocicleta*', 'van', 'vans', 'ambulancia*', 'carro', 'carros']],
  ['Transporte', ['transporte*', 'frete', 'fretes', 'fretamento', 'veiculo*', 'onibus', 'locacao de veiculo*', 'translado*', 'traslado*']],
  ['Peças e Manutenção de Frota', ['peca* automotiv*', 'autopeca*', 'pneu', 'pneus', 'manutencao de veiculo*', 'frota', 'oficina mecanica', 'lubrificante*', 'bateria* automotiv*', 'servicos mecanicos']],
  ['Combustíveis', ['combustive*', 'gasolina', 'diesel', 'etanol', 'arla*', 'oleo diesel']],
  ['Alimentos', ['genero* alimenticio*', 'alimento*', 'alimentacao escolar', 'alimentacao hospitalar', 'fornecimento de alimentacao','merenda*', 'hortifruti*', 'carne*', 'frango*', 'leite', 'cafe', 'acucar', 'lanche*', 'refeic*', 'cesta* basica*', 'agua mineral', 'pao', 'paes', 'hortalica*', 'frutas', 'verduras', 'biscoito*']],
  ['Medicamentos', ['medicamento*', 'farmac*', 'remedio*', 'insulina*', 'antibiotico*', 'vacina*', 'soro', 'soros']],
  ['Material Médico-Hospitalar', ['hospitalar', 'hospitalares', 'medico-hospitalar*', 'material medico', 'materiais medicos', 'seringa*', 'luva* de procedimento*', 'cateter*', 'gaze', 'gazes', 'curativo*', 'odontologic*', 'insumo* de saude', 'ortese*', 'protese*', 'opme', 'agulha*']],
  ['Equipamentos Médicos', ['equipamento* medico*', 'equipamento* hospitalar*', 'desfibrilador*', 'multiparametro*', 'autoclave*', 'ultrassom', 'raio-x', 'raios-x', 'maca* hospitalar*', 'cadeira* de rodas', 'eletrocardiograf*']],
  ['Laboratório', ['laboratori*', 'reagente*', 'analises clinicas', 'exames laboratoriais', 'vidraria*']],
  ['Limpeza e Higiene', ['material de limpeza', 'materiais de limpeza', 'produto* de limpeza', 'higiene', 'higienizacao', 'saneante*', 'detergente*', 'desinfetante*', 'papel higienico', 'papel toalha', 'sabonete*', 'alcool em gel', 'saco* de lixo', 'saco* para lixo', 'vassoura*', 'limpeza', 'fralda*', 'absorvente*']],
  ['Material de Expediente', ['expediente', 'papelaria', 'material de escritorio', 'materiais de escritorio', 'papel a4', 'papel sulfite', 'caneta*', 'grampeador*', 'envelope*', 'clips']],
  ['Material Escolar e Didático', ['material escolar', 'materiais escolares', 'kit* escola*', 'didatic*', 'pedagogic*', 'livro', 'livros', 'brinquedo*', 'mochila*']],
  ['Uniformes e Vestuário', ['uniforme*', 'vestuario', 'fardamento*', 'camiseta*', 'camisa*', 'calcado*', 'tecido*', 'confeccao', 'enxoval', 'enxovais', 'roupa*']],
  ['EPI e Segurança do Trabalho', ['epi', 'epis', 'protecao individual', 'capacete*', 'botina*', 'luva* de seguranca', 'protetor* auricular*', 'seguranca do trabalho']],
  ['Segurança e Vigilância', ['vigilancia', 'seguranca patrimonial', 'monitoramento eletronico', 'videomonitoramento', 'cftv', 'camera* de seguranca', 'alarme*', 'controle de acesso']],
  ['Eletrodomésticos', ['eletrodomestic*', 'geladeira*', 'refrigerador*', 'freezer*', 'fogao', 'fogoes', 'micro-ondas', 'microondas', 'bebedouro*', 'liquidificador*', 'ventilador*', 'maquina* de lavar', 'purificador*']],
  ['Ar-condicionado e Climatização', ['ar condicionado', 'ar-condicionado', 'condicionadores de ar', 'climatiza*', 'refrigeracao', 'split']],
  ['Material Elétrico e Iluminação', ['material eletrico', 'materiais eletricos', 'iluminacao', 'luminaria*', 'lampada*', 'led', 'cabo* eletric*', 'disjuntor*', 'poste', 'postes', 'gerador*', 'energia solar', 'fotovoltaic*', 'energia eletrica', 'subestac*']],
  ['Hidráulica e Saneamento', ['hidraulic*', 'encanamento*', 'tubo* de pvc', 'tubos', 'conexoes', 'bomba* d agua', 'saneamento', 'esgoto*', 'poco* artesiano*', 'tratamento de agua', 'abastecimento de agua', 'cloro']],
  ['Máquinas e Ferramentas', ['ferramenta*', 'maquina*', 'rocadeira*', 'motosserra*', 'trator*', 'retroescavadeira*', 'motoniveladora*', 'escavadeira*', 'compressor*', 'implemento*']],
  ['Agropecuária', ['agricola*', 'agropecuari*', 'semente*', 'adubo*', 'fertilizante*', 'veterinari*', 'muda', 'mudas', 'calcario']],
  ['Produtos para Animais', ['racao', 'racoes', 'pet', 'caes', 'cao', 'gatos', 'animais', 'canil', 'veterinari*']],
  ['Eventos e Estruturas', ['evento', 'eventos', 'palco*', 'tenda*', 'sonorizacao', 'show', 'shows', 'festividade*', 'decoracao', 'banheiro* quimico*', 'arquibancada*']],
  ['Gráfica e Sinalização', ['grafic*', 'impressos', 'banner*', 'folder*', 'cartilha*', 'adesivo*', 'sinalizacao', 'placa* de identificacao', 'comunicacao visual', 'copias', 'reprografia']],
  ['Publicidade e Comunicação', ['publicidade', 'propaganda', 'marketing', 'divulgacao', 'publicacao* legal*', 'publicacao* em jornal*', 'assessoria de imprensa']],
  ['Terceirização de Mão de Obra', ['mao de obra', 'mao-de-obra', 'terceirizacao', 'terceirizado*', 'copeiragem', 'portaria', 'recepcionista*', 'servico* de limpeza', 'conservacao predial', 'servicos continuados']],
  ['Consultoria e Treinamento', ['consultoria*', 'assessoria*', 'auditoria*', 'capacitacao', 'treinamento*', 'curso', 'cursos', 'palestra*']],
  ['Serviços de Saúde', ['exames', 'consulta* medica*', 'servicos medicos', 'plantao', 'plantoes', 'hemodialise', 'home care', 'procedimentos cirurgicos', 'fisioterapia']],
  ['Esportes e Lazer', ['esportiv*', 'esporte*', 'academia* ao ar livre', 'bola', 'bolas', 'trofeu*', 'medalha*', 'playground*', 'parque infantil']],
  ['Instrumentos Musicais', ['instrumento* musica*', 'fanfarra*', 'banda marcial', 'banda de musica']],
  ['Gases', ['oxigenio', 'gas medicinal', 'gases medicinais', 'gas liquefeito', 'glp', 'botijao', 'botijoes', 'gas de cozinha']],
  ['Coleta de Resíduos', ['residuo*', 'lixo', 'coleta de', 'aterro*', 'entulho*', 'destinacao final']],
  ['Viagens e Hospedagem', ['passagem', 'passagens', 'agenciamento de viage*', 'hospedage* em hote*', 'hotel', 'hoteis']],
  ['Locação de Imóveis', ['locacao de imove*', 'aluguel de imove*', 'locacao de sala*', 'locacao de predio*']],
  ['Seguros', ['seguro', 'seguros']],
  ['Audiovisual', ['televisor*', 'televisao', 'tv', 'smart tv', 'projetor*', 'datashow', 'caixa* de som', 'microfone*', 'audiovisual', 'camera* fotografica*', 'filmadora*']],
  ['Copa e Cozinha', ['utensilio*', 'copa e cozinha', 'panela*', 'talher*', 'copo* descartave*', 'prato* descartave*', 'cozinha industrial']],
  ['Cortinas e Persianas', ['cortina*', 'persiana*', 'blackout', 'pelicula* de controle solar', 'insulfilm']],
  ['Material Permanente', ['material permanente', 'materiais permanentes', 'equipamento* e material* permanente*', 'bens permanentes']],
]

const fim = '(?![a-z0-9])', inicio = '(?<![a-z0-9])'
function termoParaRegex(termo: string) {
  return termo.split(' ').map(p => p.endsWith('*') ? p.slice(0, -1).replace(/[-]/g, '\\-') + '[a-z0-9-]*' : p.replace(/[-]/g, '\\-')).join('[\\s,/-]+')
}
const REGRAS = CATEGORIAS.map(([nome, termos]) => ({ nome, termos: termos.map(t => new RegExp(inicio + termoParaRegex(t) + fim)) }))

/** Até `limite` categorias do objeto, das mais citadas para as menos. */
export function categoriasDoObjeto(objeto: string | null | undefined, limite = 2): string[] {
  if (!objeto) return []
  const texto = normalizar(objeto).replace(/['’]/g, ' ')
  return REGRAS
    .map((r, ordem) => ({ nome: r.nome, ordem, pontos: r.termos.reduce((n, re) => n + (re.test(texto) ? 1 : 0), 0) }))
    .filter(r => r.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
    .slice(0, limite)
    .map(r => r.nome)
}
