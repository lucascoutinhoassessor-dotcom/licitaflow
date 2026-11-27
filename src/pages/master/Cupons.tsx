import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link2, Ticket } from 'lucide-react'
import { linkCupom } from '@/lib/cupom'
import { URL_SITE } from '@/lib/pwa'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora, formatarMoeda } from '@/lib/format'
import { useCatalogoPlanos } from '@/hooks/useCatalogoPlanos'
import { Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Modal, Select, Vazio } from '@/components/ui'

interface Cupom { codigo: string; tipo: 'percentual' | 'valor' | 'dias'; valor: number; plano_id: string | null; descricao: string | null; valido_ate: string | null; max_usos: number | null; usos: number; ativo: boolean; created_at: string }
const VAZIO = { codigo: '', tipo: 'dias' as Cupom['tipo'], valor: '7', plano: '', descricao: '', valido_ate: '', max_usos: '', ativo: true }

export function rotuloCupom(c: Pick<Cupom, 'tipo' | 'valor'>) {
  return c.tipo === 'dias' ? `${c.valor} ${c.valor === 1 ? 'dia' : 'dias'} de acesso` : c.tipo === 'percentual' ? `${c.valor}% de desconto` : `${formatarMoeda(c.valor / 100)} de desconto`
}
/** Código legível e difícil de adivinhar: LF-XXXX-XXXX. */
function gerarCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = crypto.getRandomValues(new Uint8Array(8))
  const s = [...b].map((x) => letras[x % letras.length]).join('')
  return `LF-${s.slice(0, 4)}-${s.slice(4)}`
}

export default function Cupons() {
  const qc = useQueryClient()
  const planos = useCatalogoPlanos()
  const q = useQuery({ queryKey: ['admin-cupons'], queryFn: async () => { const { data, error } = await supabase.from('cupons').select('*').order('created_at', { ascending: false }); if (error) throw error; return data as Cupom[] } })
  const [f, setF] = useState(VAZIO)
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  function editar(c?: Cupom) {
    setF(c ? { codigo: c.codigo, tipo: c.tipo, valor: String(c.tipo === 'valor' ? c.valor / 100 : c.valor), plano: c.plano_id ?? '', descricao: c.descricao ?? '', valido_ate: c.valido_ate ?? '', max_usos: c.max_usos ? String(c.max_usos) : '', ativo: c.ativo } : { ...VAZIO, codigo: gerarCodigo() })
    setAberto(true)
  }
  async function salvar(e: FormEvent) {
    e.preventDefault()
    const valor = f.tipo === 'valor' ? Math.round(Number(f.valor.replace(',', '.')) * 100) : Math.round(Number(f.valor))
    if (!(valor > 0)) return toast.error('Informe um valor maior que zero.')
    setSalvando(true)
    try {
      const { error } = await supabase.rpc('admin_salvar_cupom', { p_codigo: f.codigo, p_tipo: f.tipo, p_valor: valor, p_plano: f.plano || null, p_descricao: f.descricao || null, p_valido_ate: f.valido_ate || null, p_max_usos: f.max_usos ? Number(f.max_usos) : null, p_ativo: f.ativo })
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['admin-cupons'] })
      toast.success('Cupom salvo.'); setAberto(false)
    } catch (e) { toast.error(mensagemErro(e)) } finally { setSalvando(false) }
  }
  async function alternar(c: Cupom) {
    const { error } = await supabase.rpc('admin_salvar_cupom', { p_codigo: c.codigo, p_tipo: c.tipo, p_valor: c.valor, p_plano: c.plano_id, p_descricao: c.descricao, p_valido_ate: c.valido_ate, p_max_usos: c.max_usos, p_ativo: !c.ativo })
    if (error) return toast.error(mensagemErro(error))
    await qc.invalidateQueries({ queryKey: ['admin-cupons'] })
  }
  async function excluir(c: Cupom) {
    if (!confirm(`Excluir o cupom ${c.codigo}? Quem já usou continua com o benefício.`)) return
    const { error } = await supabase.rpc('admin_excluir_cupom', { p_codigo: c.codigo })
    if (error) return toast.error(mensagemErro(error))
    await qc.invalidateQueries({ queryKey: ['admin-cupons'] }); toast.success('Cupom excluído.')
  }
  const hoje = new Date().toISOString().slice(0, 10)
  return <>
    <CabecalhoPagina titulo="Cupons" descricao="Crie cupons de desconto na assinatura ou de dias de acesso. No cupom de dias, o acesso é liberado na hora e o cliente recebe a confirmação no e-mail cadastrado." acoes={<Button onClick={() => editar()}>Novo cupom</Button>} />
    {q.isLoading && <Carregando />}{q.isError && <Aviso>{mensagemErro(q.error)}</Aviso>}
    {q.data && !q.data.length && <Vazio icone={Ticket} titulo="Nenhum cupom ainda" texto="Crie um cupom de dias para liberar um teste maior, ou de desconto para a assinatura." acao={<Button onClick={() => editar()}>Criar cupom</Button>} />}
    <div className="space-y-3">{q.data?.map((c) => {
      const vencido = !!c.valido_ate && c.valido_ate < hoje, esgotado = c.max_usos !== null && c.usos >= c.max_usos
      return <Card key={c.codigo} className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2"><code className="rounded bg-muted px-2 py-0.5 font-mono text-sm font-bold">{c.codigo}</code><Badge cor={c.tipo === 'dias' ? 'azul' : 'verde'}>{rotuloCupom(c)}</Badge>
            <Badge cor={!c.ativo || vencido || esgotado ? 'neutro' : 'verde'}>{!c.ativo ? 'Desativado' : vencido ? 'Vencido' : esgotado ? 'Esgotado' : 'Ativo'}</Badge>
            {c.plano_id && <Badge>Plano {planos.data?.find((p) => p.id === c.plano_id)?.nome ?? c.plano_id}</Badge>}</p>
          {c.descricao && <p className="mt-1 text-sm text-muted-foreground">{c.descricao}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Usos: {c.usos}{c.max_usos ? ` de ${c.max_usos}` : ' (sem limite)'}{c.valido_ate ? ` · válido até ${new Date(`${c.valido_ate}T12:00:00`).toLocaleDateString('pt-BR')}` : ''} · criado {formatarDataHora(c.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button tamanho="sm" variante="contorno" onClick={() => { void navigator.clipboard?.writeText(c.codigo); toast.success('Código copiado.') }}>Copiar código</Button>
          <Button tamanho="sm" variante="contorno" onClick={() => { void navigator.clipboard?.writeText(linkCupom(URL_SITE, { codigo: c.codigo, tipo: c.tipo, plano: c.plano_id })); toast.success(c.tipo === 'dias' ? 'Link copiado: abre o cadastro com o cupom aplicado.' : 'Link copiado: abre o checkout com o cupom aplicado.') }}><Link2 className="mr-1 h-4 w-4" />Copiar link</Button>
          <Button tamanho="sm" variante="contorno" onClick={() => editar(c)}>Editar</Button>
          <Button tamanho="sm" variante="contorno" onClick={() => alternar(c)}>{c.ativo ? 'Desativar' : 'Ativar'}</Button>
          <Button tamanho="sm" variante="perigo" onClick={() => excluir(c)}>Excluir</Button>
        </div>
      </Card>
    })}</div>
    <Modal aberto={aberto} aoFechar={() => { if (!salvando) setAberto(false) }} titulo={q.data?.some((c) => c.codigo === f.codigo) ? `Editar ${f.codigo}` : 'Novo cupom'}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Código" htmlFor="cp-codigo"><div className="flex gap-2"><Input id="cp-codigo" required pattern="[A-Za-z0-9_\-]{3,40}" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value.toUpperCase().replace(/\s/g, '') })} /><Button type="button" variante="contorno" onClick={() => setF({ ...f, codigo: gerarCodigo() })}>Gerar</Button></div></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Tipo" htmlFor="cp-tipo"><Select id="cp-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Cupom['tipo'] })}><option value="dias">Dias de acesso</option><option value="percentual">Desconto em %</option><option value="valor">Desconto em R$</option></Select></Campo>
          <Campo rotulo={f.tipo === 'dias' ? 'Dias' : f.tipo === 'percentual' ? 'Percentual (%)' : 'Valor (R$ por cobrança)'} htmlFor="cp-valor"><Input id="cp-valor" required inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
        </div>
        {f.tipo !== 'dias' && <Campo rotulo="Vale para o plano" htmlFor="cp-plano"><Select id="cp-plano" value={f.plano} onChange={(e) => setF({ ...f, plano: e.target.value })}><option value="">Qualquer plano</option>{planos.data?.filter((p) => p.id !== 'trial').map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</Select></Campo>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Válido até (opcional)" htmlFor="cp-validade"><Input id="cp-validade" type="date" value={f.valido_ate} onChange={(e) => setF({ ...f, valido_ate: e.target.value })} /></Campo>
          <Campo rotulo="Limite de usos (opcional)" htmlFor="cp-max"><Input id="cp-max" type="number" min={1} value={f.max_usos} onChange={(e) => setF({ ...f, max_usos: e.target.value })} /></Campo>
        </div>
        <Campo rotulo="Descrição interna (opcional)" htmlFor="cp-desc"><Input id="cp-desc" maxLength={300} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: parceria com a associação X" /></Campo>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />Cupom ativo</label>
        <p className="text-xs text-muted-foreground">{f.tipo === 'dias' ? 'Pelo link, o cliente cria a conta e os dias entram sozinhos; quem já tem conta usa em Meu plano → “Tenho um cupom” ou no checkout. Os dias somam ao prazo de acesso, liberam a conta bloqueada e a confirmação vai para o e-mail cadastrado.' : 'Pelo link, o checkout abre com o cupom aplicado; o cliente também pode digitar o código no checkout. O desconto vale para todas as cobranças da assinatura (mínimo de R$ 1,00).'} Cada organização usa um cupom uma vez.</p>
        <Button type="submit" carregando={salvando}>Salvar cupom</Button>
      </form>
    </Modal>
  </>
}
