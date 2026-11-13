import { useMemo, useState } from 'react'
import { AlertTriangle, FileCheck2, FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, CabecalhoPagina, Card, Carregando, Input, Modal, Select, Vazio } from '@/components/ui'
import { BadgeValidade } from '@/components/Situacoes'
import { DocumentoForm, abrirArquivo } from '@/components/DocumentoForm'
import { CATEGORIAS_DOC, situacaoValidade } from '@/lib/dominio'
import { formatarData } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useLista, useNomeEmpresa, useSalvar } from '@/hooks/useDados'
import { useOrg } from '@/providers/OrgProvider'
import type { Documento } from '@/types/db'

export default function Documentos() {
  const { podeEditar, empresa, empresas } = useOrg()
  const nomeEmpresa = useNomeEmpresa()
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [situacao, setSituacao] = useState('')
  const [editando, setEditando] = useState<Documento | 'novo' | null>(null)
  // Documentos da empresa (os anexos de processo ficam dentro de cada processo)
  const q = useLista<Documento>('documentos', { filtro: (x) => x.is('processo_id', null), chave: ['empresa'], ordem: ['validade', true] })
  const { excluir } = useSalvar('documentos')
  const mostrarEmpresa = !empresa && empresas.length > 1

  const docs = q.data ?? []
  const vencidos = docs.filter((d) => situacaoValidade(d.validade) === 'vencido').length
  const vencendo = docs.filter((d) => situacaoValidade(d.validade) === 'vence_em_breve').length

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return docs.filter(
      (d) =>
        (!categoria || d.categoria === categoria) &&
        (!situacao || situacaoValidade(d.validade) === situacao) &&
        (!t || `${d.nome} ${d.numero}`.toLowerCase().includes(t)),
    )
  }, [docs, busca, categoria, situacao])

  async function remover(d: Documento) {
    if (!confirm(`Excluir "${d.nome}"? O arquivo anexado também será apagado. Esta ação não pode ser desfeita.`)) return
    if (d.storage_path) await supabase.storage.from('arquivos').remove([d.storage_path])
    await excluir.mutateAsync(d.id)
    toast.success('Documento excluído.')
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Documentos e certidões"
        descricao="Habilitação sempre em dia: cadastre a validade e o LicitaFlow avisa antes de vencer."
        acoes={podeEditar && <Button onClick={() => setEditando('novo')}><Plus className="h-4 w-4" /> Novo documento</Button>}
      />

      {(vencidos > 0 || vencendo > 0) && (
        <Card className="mb-4 flex items-center gap-3 border-warning/30 bg-warning/5 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1">
            {vencidos > 0 && <strong className="text-destructive">{vencidos} vencido{vencidos > 1 ? 's' : ''}</strong>}
            {vencidos > 0 && vencendo > 0 && ' e '}
            {vencendo > 0 && <strong className="text-warning">{vencendo} vencendo em até 15 dias</strong>}. Renove para não ser inabilitado.
          </div>
          <Button tamanho="sm" variante="contorno" onClick={() => setSituacao(vencidos > 0 ? 'vencido' : 'vence_em_breve')}>Ver</Button>
        </Card>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar documento" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select className="sm:w-56" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORIAS_DOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select className="sm:w-48" value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
          <option value="">Qualquer situação</option>
          <option value="vencido">Vencidos</option>
          <option value="vence_em_breve">Vencendo</option>
          <option value="valido">Válidos</option>
          <option value="sem_validade">Sem validade</option>
        </Select>
      </div>

      {q.isLoading ? (
        <Carregando />
      ) : docs.length === 0 ? (
        <Vazio
          icone={FileCheck2}
          titulo="Nenhum documento cadastrado"
          texto="Comece pelas certidões mais exigidas: CND Federal, FGTS, CNDT, estadual, municipal e falência."
          acao={podeEditar && <Button onClick={() => setEditando('novo')}><Plus className="h-4 w-4" /> Cadastrar certidão</Button>}
        />
      ) : (
        <Card className="divide-y">
          {lista.map((d) => (
            <div key={d.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{d.nome}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {CATEGORIAS_DOC[d.categoria]}
                    {d.numero ? ` · nº ${d.numero}` : ''}
                    {d.validade ? ` · válido até ${formatarData(d.validade)}` : ''}
                    {mostrarEmpresa && d.empresa_id ? ` · ${nomeEmpresa(d.empresa_id)}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-8 sm:pl-0">
                <BadgeValidade validade={d.validade} />
                {d.storage_path && <Button tamanho="sm" variante="contorno" onClick={() => abrirArquivo(d.storage_path!)}>Abrir</Button>}
                {podeEditar && (
                  <>
                    <button onClick={() => setEditando(d)} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => remover(d)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
          {lista.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nenhum documento com esses filtros.</div>}
        </Card>
      )}

      <Modal aberto={!!editando} aoFechar={() => setEditando(null)} titulo={editando === 'novo' ? 'Novo documento' : 'Editar documento'}>
        {editando && <DocumentoForm documento={editando === 'novo' ? undefined : editando} aoSalvar={() => setEditando(null)} />}
      </Modal>
    </>
  )
}
