import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { salvarWhatsapp, testarWhatsapp } from '@/lib/push'
import { Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, InputSenha, Select, Textarea } from '@/components/ui'

type Canal = 'email' | 'whatsapp' | 'email_whatsapp'
interface Config { ativo: boolean; canal_reserva: Canal; hora: number; whatsapp_ativo: boolean; whatsapp_phone_id: string | null; whatsapp_template: string; whatsapp_idioma: string; whatsapp_testado_em: string | null }
interface Regra { chave: string; ativo: boolean; titulo: string; texto: string; intervalo_dias: number; antecedencia_dias: number; ordem: number }
interface Usuario { user_id: string; nome: string | null; email: string; telefone: boolean; organizacoes: string | null; aparelhos: number; instalado: boolean; instalado_em: string | null; permissao: 'permitiu' | 'negou' | 'nao_respondeu' | 'sem_registro'; push_ativo: boolean; ultimo_acesso_em: string | null; ultimo_envio_em: string | null; ultimo_envio_canal: string | null; ultimo_envio_status: string | null; lembretes: boolean; canal_reserva: boolean; criado_em: string }
interface Historico { tipo: 'evento' | 'envio'; quando: string; user_id: string; nome: string | null; descricao: string; canal: string | null; status: string | null; detalhe: string | null }

const CANAIS: { id: Canal; rotulo: string; texto: string }[] = [
  { id: 'email', rotulo: 'E-mail', texto: 'Usa o e-mail da conta. Sem e-mail configurado, tenta o WhatsApp.' },
  { id: 'whatsapp', rotulo: 'WhatsApp', texto: 'Usa o celular do perfil. Sem celular, cai para o e-mail.' },
  { id: 'email_whatsapp', rotulo: 'E-mail e WhatsApp', texto: 'Manda pelos dois canais.' },
]
const REGRAS: Record<string, { nome: string; quando: string; antecedencia?: string }> = {
  prazo_proximo: { nome: 'Prazo chegando', quando: 'Prazo em aberto (sessão, proposta, recurso…) dentro da antecedência. Conferido de hora em hora, das 7h às 21h.', antecedencia: 'Avisar com quantos dias' },
  documento_vencendo: { nome: 'Documentos vencendo', quando: 'Certidões e documentos de habilitação com validade dentro da antecedência.', antecedencia: 'Vencendo em até (dias)' },
  tarefa_atrasada: { nome: 'Tarefas atrasadas', quando: 'Tarefas não concluídas com vencimento passado, para o responsável (ou quem criou).' },
  empresa_cadastrar: { nome: 'Empresa não cadastrada', quando: 'Organização sem nenhum CNPJ cadastrado (para dono e administradores).' },
  radar_configurar: { nome: 'Radar sem palavras-chave', quando: 'Empresa cadastrada, mas sem palavras-chave nem filtros do Radar.' },
  push_permitir: { nome: 'Notificações não ativadas', quando: 'Nenhum aparelho da pessoa com push ativo. Sai sempre pelo canal de reserva.' },
  app_instalar: { nome: 'App não instalado', quando: 'Nenhum aparelho da pessoa abriu o LicitaForce instalado.' },
  telefone_cadastrar: { nome: 'Celular não cadastrado', quando: 'Perfil sem celular com DDD (necessário para o WhatsApp).' },
}
const PERMISSAO: Record<Usuario['permissao'], [string, 'verde' | 'vermelho' | 'amarelo' | 'neutro']> = {
  permitiu: ['Permitiu', 'verde'], negou: ['Negou', 'vermelho'], nao_respondeu: ['Não respondeu', 'amarelo'], sem_registro: ['Sem registro', 'neutro'],
}
const EVENTO: Record<string, string> = {
  primeiro_acesso: 'Primeiro acesso registrado', app_instalado: 'Instalou o app', push_permitido: 'Permitiu notificações', push_negado: 'Negou notificações',
  push_permissao_removida: 'Removeu a permissão', push_ativado: 'Ativou o push', push_desativado: 'Desativou o push',
}
const STATUS: Record<string, [string, 'verde' | 'vermelho' | 'amarelo' | 'neutro' | 'azul']> = {
  pendente: ['Na fila', 'azul'], enviado: ['Enviado', 'verde'], parcial: ['Parcial', 'amarelo'], falhou: ['Falhou', 'vermelho'], sem_contato: ['Sem contato', 'neutro'],
}
const NOME_CANAL: Record<string, string> = { push: 'Push', email: 'E-mail', whatsapp: 'WhatsApp', email_whatsapp: 'E-mail + WhatsApp' }

/** Console master: rastreio de instalação/permissão, lembretes automáticos de pendências e canal de reserva. */
export default function Notificacoes() {
  const qc = useQueryClient()
  const config = useQuery({ queryKey: ['master-notif-config'], queryFn: async () => {
    const { data, error } = await supabase.from('notificacoes_config').select('ativo,canal_reserva,hora,whatsapp_ativo,whatsapp_phone_id,whatsapp_template,whatsapp_idioma,whatsapp_testado_em').eq('id', true).single()
    if (error) throw error; return data as Config
  } })
  const smtp = useQuery({ queryKey: ['master-notif-smtp'], queryFn: async () => {
    const { data, error } = await supabase.from('plataforma_email').select('ativo').eq('id', 'smtp').maybeSingle()
    if (error) throw error; return !!data?.ativo
  } })
  const regras = useQuery({ queryKey: ['master-notif-regras'], queryFn: async () => {
    const { data, error } = await supabase.from('lembretes_regras').select('*').order('ordem')
    if (error) throw error; return data as Regra[]
  } })
  const usuarios = useQuery({ queryKey: ['master-notif-usuarios'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_engajamento_usuarios')
    if (error) throw error; return data as Usuario[]
  } })
  const historico = useQuery({ queryKey: ['master-notif-historico'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_engajamento_historico', { p_limite: 150 })
    if (error) throw error; return data as Historico[]
  } })

  const [salvando, setSalvando] = useState(false)
  async function salvarConfig(dados: Partial<Config>) {
    setSalvando(true)
    try {
      const { error } = await supabase.from('notificacoes_config').update(dados).eq('id', true)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['master-notif-config'] }); toast.success('Configuração salva.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setSalvando(false) }
  }
  const [executando, setExecutando] = useState(false)
  async function executar() {
    if (!confirm('Gerar agora os lembretes devidos para todos os clientes? A frequência de cada regra continua valendo: quem já recebeu dentro do intervalo não recebe de novo.')) return
    setExecutando(true)
    try {
      const { data, error } = await supabase.rpc('admin_lembretes_executar')
      if (error) throw error
      toast.success(data ? `${data} ${data === 1 ? 'lembrete entrou' : 'lembretes entraram'} na fila de envio.` : 'Nenhum lembrete devido agora.')
      await qc.invalidateQueries({ queryKey: ['master-notif-historico'] })
    } catch (e) { toast.error(mensagemErro(e)) } finally { setExecutando(false) }
  }

  const funil = useMemo(() => {
    const u = usuarios.data ?? []
    return [
      { rotulo: 'Usuários', valor: u.length },
      { rotulo: 'Instalaram o app', valor: u.filter(x => x.instalado).length },
      { rotulo: 'Permitiram notificações', valor: u.filter(x => x.permissao === 'permitiu').length },
      { rotulo: 'Com push ativo', valor: u.filter(x => x.push_ativo).length },
      { rotulo: 'Negaram notificações', valor: u.filter(x => x.permissao === 'negou').length },
      { rotulo: 'Com celular', valor: u.filter(x => x.telefone).length },
    ]
  }, [usuarios.data])

  return <>
    <CabecalhoPagina titulo="Notificações e lembretes" descricao="Quem instalou o app e permitiu notificações, lembretes automáticos de pendências e o canal usado quando o push não chega."
      acoes={<><Button variante="contorno" onClick={() => { void qc.invalidateQueries({ queryKey: ['master-notif-usuarios'] }); void qc.invalidateQueries({ queryKey: ['master-notif-historico'] }) }}>Atualizar</Button>
        <Button carregando={executando} onClick={executar}>Gerar lembretes agora</Button></>} />

    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {funil.map(f => <Card key={f.rotulo} className="p-4"><p className="text-xs text-muted-foreground">{f.rotulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{usuarios.isLoading ? '…' : f.valor}</p>
        {f.rotulo !== 'Usuários' && !!funil[0].valor && <p className="text-xs text-muted-foreground">{Math.round(f.valor / funil[0].valor * 100)}%</p>}</Card>)}
    </div>
    {usuarios.isError && <div className="mb-4"><Aviso>Não foi possível carregar o rastreio dos usuários.</Aviso></div>}

    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Canal de reserva</h2>
        <p className="text-sm text-muted-foreground">Quem tem push ativo recebe por push. Quem não instalou o app nem permitiu as notificações recebe pelo canal escolhido aqui, no contato do cadastro.</p>
        {config.isLoading ? <Carregando /> : config.isError ? <Aviso>Não foi possível carregar a configuração.</Aviso> : config.data && <>
          <fieldset className="space-y-2">{CANAIS.map(c => <label key={c.id} className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name="canal-reserva" className="mt-1" checked={config.data!.canal_reserva === c.id} disabled={salvando} onChange={() => void salvarConfig({ canal_reserva: c.id })} />
            <span><span className="font-medium">{c.rotulo}</span><span className="block text-xs text-muted-foreground">{c.texto}</span></span></label>)}</fieldset>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge cor={smtp.data ? 'verde' : 'vermelho'}>E-mail {smtp.data ? 'configurado' : 'não configurado (Asaas e integrações)'}</Badge>
            <Badge cor={config.data.whatsapp_ativo ? 'verde' : 'vermelho'}>WhatsApp {config.data.whatsapp_ativo ? 'ativo' : 'desligado'}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Horário dos lembretes diários" htmlFor="notif-hora">
              <Select id="notif-hora" value={config.data.hora} disabled={salvando} onChange={e => void salvarConfig({ hora: Number(e.target.value) })}>
                {Array.from({ length: 15 }, (_, i) => i + 7).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}h (Brasília)</option>)}
              </Select>
            </Campo>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={config.data.ativo} disabled={salvando} onChange={e => void salvarConfig({ ativo: e.target.checked })} />Lembretes automáticos ligados</label>
          </div>
        </>}
      </Card>
      {config.data && <WhatsappConfig config={config.data} aoSalvar={() => void qc.invalidateQueries({ queryKey: ['master-notif-config'] })} />}
    </div>

    <h2 className="mb-1 text-lg font-semibold">Lembretes automáticos de pendências</h2>
    <p className="mb-3 text-sm text-muted-foreground">O sistema confere a conta de cada cliente e manda um único lembrete por pessoa juntando o que estiver pendente. Variáveis: {'{nome}'}, {'{empresa}'}, {'{qtd}'}, {'{itens}'}, {'{dias}'}. O cliente pode desligar em Configurações.</p>
    {regras.isError && <Aviso>Não foi possível carregar as regras.</Aviso>}
    <div className="mb-8 grid gap-4 lg:grid-cols-2">{regras.data?.map(r => <RegraCard key={r.chave} regra={r} aoSalvar={() => void qc.invalidateQueries({ queryKey: ['master-notif-regras'] })} />)}</div>

    <Usuarios dados={usuarios.data} carregando={usuarios.isLoading} />
    <HistoricoLista dados={historico.data} carregando={historico.isLoading} erro={historico.isError} />
  </>
}

function WhatsappConfig({ config, aoSalvar }: { config: Config; aoSalvar: () => void }) {
  const [f, setF] = useState({ phone_id: config.whatsapp_phone_id ?? '', token: '', template: config.whatsapp_template, idioma: config.whatsapp_idioma })
  const [tel, setTel] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function salvar(ativo?: boolean) {
    setOcupado(true)
    try { await salvarWhatsapp({ ...f, ...(ativo === undefined ? {} : { ativo }) }); setF({ ...f, token: '' }); aoSalvar(); toast.success(ativo === undefined ? 'WhatsApp salvo.' : ativo ? 'WhatsApp ativado.' : 'WhatsApp desligado.') }
    catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado(false) }
  }
  async function testar() {
    setOcupado(true)
    try { await testarWhatsapp(tel); aoSalvar(); toast.success('Mensagem de teste aceita pelo WhatsApp. Confira o celular.') }
    catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado(false) }
  }
  return <Card className="space-y-3 p-5">
    <div className="flex flex-wrap items-center gap-2"><h2 className="flex-1 font-semibold">WhatsApp (API oficial da Meta)</h2><Badge cor={config.whatsapp_ativo ? 'verde' : 'neutro'}>{config.whatsapp_ativo ? 'Ativo' : 'Desligado'}</Badge></div>
    <p className="text-xs text-muted-foreground">No WhatsApp Business (Meta for Developers), crie um modelo de mensagem da categoria Utilidade com duas variáveis no corpo, por exemplo: “*{'{{1}}'}* — {'{{2}}'}”. A primeira recebe o título e a segunda o texto do lembrete.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo rotulo="ID do número de telefone" htmlFor="wa-phone"><Input id="wa-phone" inputMode="numeric" value={f.phone_id} onChange={e => setF({ ...f, phone_id: e.target.value })} /></Campo>
      <Campo rotulo="Token de acesso" htmlFor="wa-token"><InputSenha id="wa-token" autoComplete="off" placeholder={config.whatsapp_phone_id ? 'Guardado. Preencha só para trocar' : ''} value={f.token} onChange={e => setF({ ...f, token: e.target.value })} /></Campo>
      <Campo rotulo="Nome do modelo" htmlFor="wa-template"><Input id="wa-template" value={f.template} onChange={e => setF({ ...f, template: e.target.value })} /></Campo>
      <Campo rotulo="Idioma do modelo" htmlFor="wa-idioma"><Input id="wa-idioma" value={f.idioma} onChange={e => setF({ ...f, idioma: e.target.value })} /></Campo>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button variante="contorno" carregando={ocupado} onClick={() => void salvar()}>Salvar</Button>
      <Button variante={config.whatsapp_ativo ? 'contorno' : 'primario'} carregando={ocupado} onClick={() => void salvar(!config.whatsapp_ativo)}>{config.whatsapp_ativo ? 'Desligar' : 'Ativar'}</Button>
    </div>
    <div className="flex flex-wrap items-end gap-2 border-t pt-3">
      <Campo rotulo="Testar no celular" htmlFor="wa-teste"><Input id="wa-teste" type="tel" placeholder="(11) 91234-5678" value={tel} onChange={e => setTel(e.target.value)} /></Campo>
      <Button variante="contorno" carregando={ocupado} disabled={!tel.trim()} onClick={() => void testar()}>Enviar teste</Button>
    </div>
    {config.whatsapp_testado_em && <p className="text-xs text-muted-foreground">Último teste aceito em {formatarDataHora(config.whatsapp_testado_em)}.</p>}
  </Card>
}

function RegraCard({ regra, aoSalvar }: { regra: Regra; aoSalvar: () => void }) {
  const [f, setF] = useState(regra)
  const [ocupado, setOcupado] = useState(false)
  const info = REGRAS[regra.chave] ?? { nome: regra.chave, quando: '' }
  const alterado = f.titulo !== regra.titulo || f.texto !== regra.texto || f.intervalo_dias !== regra.intervalo_dias || f.antecedencia_dias !== regra.antecedencia_dias
  async function salvar(dados: Partial<Regra>) {
    setOcupado(true)
    try {
      const { error } = await supabase.from('lembretes_regras').update(dados).eq('chave', regra.chave)
      if (error) throw error
      aoSalvar(); toast.success('Regra salva.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado(false) }
  }
  return <Card className={`space-y-3 p-4 ${f.ativo ? '' : 'opacity-70'}`}>
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1"><p className="font-medium">{info.nome}</p><p className="text-xs text-muted-foreground">{info.quando}</p></div>
      <label className="flex shrink-0 items-center gap-2 text-sm"><input type="checkbox" checked={f.ativo} disabled={ocupado} onChange={e => { setF({ ...f, ativo: e.target.checked }); void salvar({ ativo: e.target.checked }) }} />Ligado</label>
    </div>
    <Campo rotulo="Título" htmlFor={`r-t-${regra.chave}`}><Input id={`r-t-${regra.chave}`} maxLength={80} value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} /></Campo>
    <Campo rotulo="Mensagem" htmlFor={`r-x-${regra.chave}`}><Textarea id={`r-x-${regra.chave}`} rows={2} maxLength={400} value={f.texto} onChange={e => setF({ ...f, texto: e.target.value })} /></Campo>
    <div className="flex flex-wrap items-end gap-3">
      <Campo rotulo="Repetir a cada (dias)" htmlFor={`r-i-${regra.chave}`}><Input id={`r-i-${regra.chave}`} type="number" min={1} max={60} className="w-28" value={f.intervalo_dias} onChange={e => setF({ ...f, intervalo_dias: Number(e.target.value) })} /></Campo>
      {info.antecedencia && <Campo rotulo={info.antecedencia} htmlFor={`r-a-${regra.chave}`}><Input id={`r-a-${regra.chave}`} type="number" min={0} max={60} className="w-28" value={f.antecedencia_dias} onChange={e => setF({ ...f, antecedencia_dias: Number(e.target.value) })} /></Campo>}
      <Button tamanho="sm" disabled={!alterado} carregando={ocupado} onClick={() => void salvar({ titulo: f.titulo.trim(), texto: f.texto.trim(), intervalo_dias: f.intervalo_dias, antecedencia_dias: f.antecedencia_dias })}>Salvar</Button>
    </div>
  </Card>
}

function Usuarios({ dados, carregando }: { dados?: Usuario[]; carregando: boolean }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'sem_push' | 'sem_app' | 'negou' | 'sem_celular'>('todos')
  const lista = (dados ?? []).filter(u => {
    const b = busca.trim().toLowerCase()
    if (b && ![u.nome, u.email, u.organizacoes].some(x => x?.toLowerCase().includes(b))) return false
    if (filtro === 'sem_push') return !u.push_ativo
    if (filtro === 'sem_app') return !u.instalado
    if (filtro === 'negou') return u.permissao === 'negou'
    if (filtro === 'sem_celular') return !u.telefone
    return true
  })
  return <section className="mb-8">
    <h2 className="mb-3 text-lg font-semibold">Rastreio por usuário</h2>
    <div className="mb-3 flex flex-wrap gap-2">
      <Input aria-label="Buscar usuário" placeholder="Buscar por nome, e-mail ou organização…" className="max-w-sm" value={busca} onChange={e => setBusca(e.target.value)} />
      <Select aria-label="Filtrar" className="w-auto" value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)}>
        <option value="todos">Todos</option><option value="sem_push">Sem push ativo</option><option value="sem_app">Sem app instalado</option>
        <option value="negou">Negaram notificações</option><option value="sem_celular">Sem celular</option>
      </Select>
      <span className="self-center text-sm text-muted-foreground">{lista.length} {lista.length === 1 ? 'usuário' : 'usuários'}</span>
    </div>
    {carregando ? <Carregando /> : <Card className="overflow-x-auto p-0"><table className="w-full min-w-[900px] text-sm">
      <thead className="border-b text-left text-xs text-muted-foreground"><tr>
        <th className="p-3">Usuário</th><th className="p-3">App</th><th className="p-3">Notificações</th><th className="p-3">Contato</th><th className="p-3">Último acesso</th><th className="p-3">Último lembrete</th>
      </tr></thead>
      <tbody className="divide-y">{lista.slice(0, 300).map(u => <tr key={u.user_id} className="align-top">
        <td className="p-3"><p className="font-medium">{u.nome || '—'}</p><p className="text-xs text-muted-foreground">{u.email}</p>{u.organizacoes && <p className="text-xs text-muted-foreground">{u.organizacoes}</p>}</td>
        <td className="p-3"><Badge cor={u.instalado ? 'verde' : 'neutro'}>{u.instalado ? 'Instalado' : 'Não instalado'}</Badge>{u.instalado_em && <p className="mt-1 text-xs text-muted-foreground">{formatarDataHora(u.instalado_em)}</p>}<p className="mt-1 text-xs text-muted-foreground">{u.aparelhos} {u.aparelhos === 1 ? 'aparelho' : 'aparelhos'}</p></td>
        <td className="p-3 space-y-1"><Badge cor={PERMISSAO[u.permissao][1]}>{PERMISSAO[u.permissao][0]}</Badge><p className="text-xs">{u.push_ativo ? 'Push ativo' : 'Sem push'}</p>{!u.lembretes && <p className="text-xs text-muted-foreground">Desligou lembretes</p>}</td>
        <td className="p-3 text-xs"><p>{u.telefone ? 'Celular cadastrado' : 'Sem celular'}</p>{!u.canal_reserva && <p className="text-muted-foreground">Recusou e-mail/WhatsApp</p>}</td>
        <td className="p-3 text-xs">{u.ultimo_acesso_em ? formatarDataHora(u.ultimo_acesso_em) : '—'}</td>
        <td className="p-3 text-xs">{u.ultimo_envio_em ? <><p>{formatarDataHora(u.ultimo_envio_em)}</p><p className="text-muted-foreground">{NOME_CANAL[u.ultimo_envio_canal ?? ''] ?? ''} · {STATUS[u.ultimo_envio_status ?? '']?.[0] ?? ''}</p></> : '—'}</td>
      </tr>)}</tbody>
    </table>{lista.length > 300 && <p className="p-3 text-xs text-muted-foreground">Mostrando 300 de {lista.length}. Use a busca para refinar.</p>}
      {!lista.length && <p className="p-6 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p>}</Card>}
  </section>
}

function HistoricoLista({ dados, carregando, erro }: { dados?: Historico[]; carregando: boolean; erro: boolean }) {
  const [tipo, setTipo] = useState<'todos' | 'evento' | 'envio'>('todos')
  const lista = (dados ?? []).filter(h => tipo === 'todos' || h.tipo === tipo)
  return <section>
    <div className="mb-3 flex flex-wrap items-center gap-2"><h2 className="flex-1 text-lg font-semibold">Histórico</h2>
      <Select aria-label="Tipo" className="w-auto" value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}>
        <option value="todos">Tudo</option><option value="evento">Instalação e permissões</option><option value="envio">Lembretes e avisos enviados</option>
      </Select></div>
    {erro && <Aviso>Não foi possível carregar o histórico.</Aviso>}
    {carregando ? <Carregando /> : <Card className="divide-y p-0">{lista.map((h, i) => <div key={i} className="flex flex-wrap items-start gap-2 p-3 text-sm">
      <span className="w-36 shrink-0 text-xs text-muted-foreground">{formatarDataHora(h.quando)}</span>
      <div className="min-w-0 flex-1"><p><span className="font-medium">{h.nome || 'Usuário'}</span> · {h.tipo === 'evento' ? (EVENTO[h.descricao.split(' · ')[0]] ?? h.descricao) + (h.descricao.includes(' · ') ? ` · ${h.descricao.split(' · ').slice(1).join(' · ')}` : '') : h.descricao}</p>
        {h.detalhe && <p className="text-xs text-muted-foreground">{h.detalhe}</p>}</div>
      {h.tipo === 'envio' && <><Badge>{NOME_CANAL[h.canal ?? ''] ?? h.canal}</Badge><Badge cor={STATUS[h.status ?? '']?.[1] ?? 'neutro'}>{STATUS[h.status ?? '']?.[0] ?? h.status}</Badge></>}
    </div>)}{!lista.length && <p className="p-6 text-center text-sm text-muted-foreground">Nada registrado ainda.</p>}</Card>}
  </section>
}
