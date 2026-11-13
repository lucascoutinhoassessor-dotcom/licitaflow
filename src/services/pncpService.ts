/**
 * Serviço de integração com a API do PNCP (Portal Nacional de Contratações Públicas)
 * Documentação: https://pncp.gov.br/api/docs/
 */

const PNCP_BASE_URL = 'https://pncp.gov.br/api/pncp-api';
const COMPRASNET_URL = 'https://compras.dados.gov.br';

interface PNCPEdital {
  id: string;
  numero: string;
  UASG: string;
  titulo: string;
  descricao: string;
  orgao: string;
  orgao_cnpj: string;
  cidade: string;
  UF: string;
  modalidade: string;
  valor_estimado: number;
  data_publicacao: string;
  data_abertura: string;
  situacao: string;
}

interface PNCPResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Tipos simplificados para o mock
interface MockEdital {
  id: string;
  numeroEdital: string;
  titulo: string;
  descricao: string;
  orgao: string;
  cidade: string;
  UF: string;
  modalidade: string;
  valorEstimado: number;
  dataPublicacao: string;
  dataEncerramento: string;
  status: string;
}

class PNCPServices {
  private apiKey: string | null = null;

  setApiKey(key: string) {
    this.apiKey = key;
  }

  /**
   * Buscar editais no PNCP com filtros
   */
  async buscarEditais(filtros: {
    UF?: string;
    cidade?: string;
    modalidade?: string;
    termo?: string;
    dataInicio?: string;
    dataFim?: string;
    valorMin?: number;
    valorMax?: number;
    pagina?: number;
    itensPorPagina?: number;
  }): Promise<{ data: MockEdital[]; total: number }> {
    try {
      const params = new URLSearchParams();

      if (filtros.UF) params.append('uf', filtros.UF);
      if (filtros.cidade) params.append('municipio', filtros.cidade);
      if (filtros.modalidade) params.append('modalidade', filtros.modalidade);
      if (filtros.termo) params.append('palavraChave', filtros.termo);
      if (filtros.dataInicio) params.append('dataInicial', filtros.dataInicio);
      if (filtros.dataFim) params.append('dataFinal', filtros.dataFim);
      if (filtros.valorMin) params.append('valorMinimo', filtros.valorMin.toString());
      if (filtros.valorMax) params.append('valorMaximo', filtros.valorMax.toString());
      params.append('pagina', (filtros.pagina || 1).toString());
      params.append('itensPorPagina', (filtros.itensPorPagina || 20).toString());

      const url = `${PNCP_BASE_URL}/contratacoes/proposta/editais?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
        },
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status}`);
      }

      const data = await response.json();

      return this.mapPNCPResponse(data);
    } catch (error) {
      console.error('Erro ao buscar editais do PNCP:', error);
      // Retornar dados mock em caso de erro para demonstração
      return this.getMockEditais();
    }
  }

  /**
   * Obter detalhes de um edital específico
   */
  async obterEdital(numeroEdital: string, UASG: string): Promise<MockEdital | null> {
    try {
      const url = `${PNCP_BASE_URL}/contratacoes/proposta/editais/${UASG}/${numeroEdital}`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
        },
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status}`);
      }

      const data = await response.json();
      return this.mapEdital(data);
    } catch (error) {
      console.error('Erro ao obter edital do PNCP:', error);
      return null;
    }
  }

  /**
   * Buscar editais em outros portais (simulado)
   */
  async buscarEmPortais(filtros: {
    portais: string[];
    termo?: string;
    UF?: string;
  }): Promise<MockEdital[]> {
    const editais: MockEdital[] = [];

    for (const portal of filtros.portais) {
      try {
        switch (portal) {
          case 'comprasnet':
            const comprasnetEditais = await this.buscarComprasNet(filtros);
            editais.push(...comprasnetEditais);
            break;
          case 'bll':
            const bllEditais = await this.buscarBLL(filtros);
            editais.push(...bllEditais);
            break;
          default:
            break;
        }
      } catch (error) {
        console.error(`Erro ao buscar em ${portal}:`, error);
      }
    }

    return editais;
  }

  /**
   * Buscar no Comprasnet
   */
  private async buscarComprasNet(filtros: any): Promise<MockEdital[]> {
    const mock = this.getMockEditais();
    return mock.data.slice(0, 10);
  }

  /**
   * Buscar na BLL
   */
  private async buscarBLL(filtros: any): Promise<MockEdital[]> {
    const mock = this.getMockEditais();
    return mock.data.slice(10, 20);
  }

  /**
   * Mapear resposta do PNCP para formato interno
   */
  private mapPNCPResponse(response: any): { data: MockEdital[]; total: number } {
    const editais: MockEdital[] = Array.isArray(response.data)
      ? response.data.map(this.mapEdital)
      : [];

    return {
      data: editais,
      total: response.total || editais.length,
    };
  }

  /**
   * Mapear edital do PNCP para formato interno
   */
  private mapEdital(data: any): MockEdital {
    return {
      id: data.id || data.numero || '',
      numeroEdital: data.numero || data.numeroEdital || '',
      titulo: data.titulo || data.objeto || '',
      descricao: data.descricao || data.detalhamento || '',
      orgao: data.orgao || data.entidade || '',
      cidade: data.cidade || data.municipio || '',
      UF: data.UF || data.uf || '',
      modalidade: this.mapModalidade(data.modalidade || data.tipo),
      valorEstimado: data.valor_estimado || data.valorEstimado || 0,
      dataPublicacao: data.data_publicacao || data.dataPublicacao || '',
      dataEncerramento: data.data_encerramento || data.encerramento || '',
      status: this.mapStatus(data.situacao || data.status),
    };
  }

  /**
   * Mapear modalidade do PNCP
   */
  private mapModalidade(modalidade: string): string {
    const mapping: Record<string, string> = {
      'RDC': 'RDC',
      'PREGAO_ELETRONICO': 'Pregão Eletrônico',
      'CONCORRENCIA': 'Concorrência',
      'TOMADA_DE_PRECO': 'Tomada de Preços',
      'CONVITE': 'Convite',
      'CONCORRENCIA_2': 'Concorrência (Lei 8.666)',
      'TOMADA_DE_PRECO_2': 'Tomada de Preços (Lei 8.666)',
      'DISPENSA': 'Dispensa',
      'INEXIGIBILIDADE': 'Inexigibilidade',
      'LEILAO': 'Leilão',
      'PREGÃO_PRESENCIAL': 'Pregão Presencial',
      'CREDENCIAMENTO': 'Credenciamento',
    };

    return mapping[modalidade] || modalidade || 'Pregão Eletrônico';
  }

  /**
   * Mapear status do PNCP
   */
  private mapStatus(situacao: string): string {
    const mapping: Record<string, string> = {
      'AGUARDANDO_ABERTURA': 'novo',
      'ABERTO': 'novo',
      'EM_ANALISE': 'em_analise',
      'ANALISADO': 'interessado',
      'ADJUDICADO': 'contratado',
      'HOMOLOGADO': 'contratado',
      'CANCELADO': 'encerrado',
      'REVOGADO': 'encerrado',
      'FRACASSADO': 'perdido',
      'DESERTO': 'perdido',
    };

    return mapping[situacao] || 'novo';
  }

  /**
   * Dados mock para demonstração
   */
  private getMockEditais(): { data: MockEdital[]; total: number } {
    const mockData: MockEdital[] = [
      {
        id: '1',
        numeroEdital: '001/2024',
        titulo: 'Aquisição de Equipamentos de Tecnologia da Informação',
        descricao: 'Contratação de empresa especializada para fornecimento de computadores, notebooks e periféricos para uso administrativo.',
        orgao: 'Universidade Federal de São Paulo',
        cidade: 'São Paulo',
        UF: 'SP',
        modalidade: 'pregao_eletronico',
        valorEstimado: 150000,
        dataPublicacao: '2024-01-15',
        dataEncerramento: '2024-01-30',
        status: 'novo',
      },
      {
        id: '2',
        numeroEdital: '002/2024',
        titulo: 'Serviços de Limpeza Hospitalar',
        descricao: 'Prestação de serviços de limpeza e higienização hospitalar com fornecimento de materiais e equipamentos.',
        orgao: 'Hospital das Clínicas',
        cidade: 'Rio de Janeiro',
        UF: 'RJ',
        modalidade: 'concorrencia',
        valorEstimado: 500000,
        dataPublicacao: '2024-01-20',
        dataEncerramento: '2024-02-20',
        status: 'em_analise',
      },
      {
        id: '3',
        numeroEdital: '003/2024',
        titulo: 'Obras de Reforma e Ampliação',
        descricao: 'Contratação de serviços de engenharia para reforma e ampliação de escola municipal.',
        orgao: 'Prefeitura Municipal de Belo Horizonte',
        cidade: 'Belo Horizonte',
        UF: 'MG',
        modalidade: 'tomada_precos',
        valorEstimado: 800000,
        dataPublicacao: '2024-02-01',
        dataEncerramento: '2024-02-25',
        status: 'proposta_enviada',
      },
      {
        id: '4',
        numeroEdital: '004/2024',
        titulo: 'Fornecimento de Medicamentos',
        descricao: 'Aquisição de medicamentos para atendimento da rede municipal de saúde.',
        orgao: 'Prefeitura Municipal de Curitiba',
        cidade: 'Curitiba',
        UF: 'PR',
        modalidade: 'pregao_eletronico',
        valorEstimado: 1200000,
        dataPublicacao: '2024-02-05',
        dataEncerramento: '2024-02-20',
        status: 'novo',
      },
      {
        id: '5',
        numeroEdital: '005/2024',
        titulo: 'Locação de Veículos',
        descricao: 'Locação de veículos para uso da administração pública municipal.',
        orgao: 'Governo do Estado de Santa Catarina',
        cidade: 'Florianópolis',
        UF: 'SC',
        modalidade: 'pregao_eletronico',
        valorEstimado: 350000,
        dataPublicacao: '2024-01-10',
        dataEncerramento: '2024-01-25',
        status: 'contratado',
      },
    ];

    return {
      data: mockData,
      total: mockData.length,
    };
  }
}

export const pncpService = new PNCPServices();
export default pncpService;