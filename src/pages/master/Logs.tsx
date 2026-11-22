import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ScrollText } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { TIPOS_LOG, type LogPlataforma } from '@/lib/logsPlataforma'
import { Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Modal, Select, Textarea, Vazio } from '@/components/ui'

const VAZIO = { id: '', tipo: 'atualizacao' as LogPlataforma['tipo'], titulo: '', texto: '', publico: false }

/** Logs da plataforma: o master registra atualizações, correções, incidentes e notas; os públicos aparecem para os clientes. */
export default function Logs() {
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState<'' | LogPlataforma['tipo']>('')
  const [busca, setBusca] = useState('')
  const [f, setF] = useState(VAZIO)
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const q = useQuery({ queryKey: ['plataforma-logs'], queryFn: async () => { const { data, error } = await supabase.from('plataforma_logs').select('*').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data as LogPlataforma[] } })
  const termo = busca.trim().toLowerCase()
  const lista = (q.data ?? []).filter((l) => (!filtro || l.tipo === filtro) && (!termo || `${l.titulo} ${l.texto}`.toLowerCase().includes(termo)))
  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const dados = { tipo: f.tipo, titulo: f.titulo.trim(), texto: f.texto, publico: f.publico }
      const { error } = f.id ? await supabase.from('plataforma_logs').update({ ...dados, updated_at: new Date().toISOString() }).eq('id', f.id) : await supabase.from('plataforma_logs').insert(dados)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['plataforma-logs'] })
      toast.success(f.id ? 'Log atualizado.' : 'Log criado.'); setAberto(false)
    } catch (e) { toast.error(mensagemErro(e)) } finally { setSalvando(false) }
  }
  async function excluir(l: LogPlataforma) {
    if (!confirm(`Excluir o log "${l.titulo}"?`)) return
    const { error } = await supabase.from('plataforma_logs').delete().eq('id', l.id)
    if (error) return toast.error(mensagemErro(error))
    await qc.invalidateQueries({ queryKey: ['plataforma-logs'] }); toast.success('Log excluído.')
  }
  return <>
    <CabecalhoPagina titulo="Logs" descricao="Registro do que muda na plataforma: atualizações, correções, incidentes e notas internas. Marque como público para aparecer aos clientes em Avisos → Atualizações da plataforma." acoes={<Button onClick={() => { setF(VAZIO); setAberto(true) }}>Criar log</Button>} />
    <div className="mb-4 flex flex-col gap-2 sm:flex-row">
      <Input aria-label="Pesquisar logs" placeholder="Pesquisar nos logs…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <Select aria-label="Tipo de log" className="sm:w-56" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}><option value="">Todos os tipos</option>{Object.entries(TIPOS_LOG).map(([k, [r]]) => <option key={k} value={k}>{r}</option>)}</Select>
    </div>
    {q.isLoading && <Carregando />}{q.isError && <Aviso>{mensagemErro(q.error)}</Aviso>}
    {q.data && !lista.length && <Vazio icone={ScrollText} titulo={q.data.length ? 'Nenhum log com esses filtros' : 'Nenhum log ainda'} texto="Registre aqui cada atualização, correção ou incidente da plataforma." />}
    <ol className="space-y-3">{lista.map((l) => (
      <li key={l.id}><Card className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2"><Badge cor={TIPOS_LOG[l.tipo][1]}>{TIPOS_LOG[l.tipo][0]}</Badge>{l.publico ? <Badge cor="verde">Público</Badge> : <Badge>Só master</Badge>}<span className="ml-auto text-xs text-muted-foreground">{formatarDataHora(l.created_at)}{l.updated_at && Math.abs(new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) > 60_000 ? ` · editado ${formatarDataHora(l.updated_at)}` : ''}</span></div>
        <h2 className="font-semibold">{l.titulo}</h2>
        {l.texto && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{l.texto}</p>}
        <div className="flex gap-2"><Button tamanho="sm" variante="contorno" onClick={() => { setF({ id: l.id, tipo: l.tipo, titulo: l.titulo, texto: l.texto, publico: l.publico }); setAberto(true) }}>Editar</Button><Button tamanho="sm" variante="perigo" onClick={() => excluir(l)}>Excluir</Button></div>
      </Card></li>
    ))}</ol>
    <Modal aberto={aberto} aoFechar={() => { if (!salvando) setAberto(false) }} titulo={f.id ? 'Editar log' : 'Criar log'}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Tipo" htmlFor="log-tipo"><Select id="log-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as LogPlataforma['tipo'] })}>{Object.entries(TIPOS_LOG).map(([k, [r]]) => <option key={k} value={k}>{r}</option>)}</Select></Campo>
        <Campo rotulo="Título" htmlFor="log-titulo"><Input id="log-titulo" required minLength={3} maxLength={160} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
        <Campo rotulo="Descrição" htmlFor="log-texto"><Textarea id="log-texto" rows={6} maxLength={10000} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} /></Campo>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={f.publico} onChange={(e) => setF({ ...f, publico: e.target.checked })} /><span><span className="font-medium">Mostrar aos clientes</span><span className="block text-xs text-muted-foreground">Aparece em Avisos → Atualizações da plataforma.</span></span></label>
        <Button type="submit" carregando={salvando}>{f.id ? 'Salvar' : 'Criar log'}</Button>
      </form>
    </Modal>
  </>
}
