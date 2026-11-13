import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarCnpj } from '@/lib/format'
import { useOrg } from '@/providers/OrgProvider'
import { Badge, Button, CabecalhoPagina, Card, Input, Modal } from '@/components/ui'
import { EmpresaForm } from '@/components/EmpresaForm'
import type { Empresa } from '@/types/db'

function PalavrasChave({ empresa, podeEditar, aoSalvar }: { empresa: Empresa; podeEditar: boolean; aoSalvar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(empresa.palavras_chave.join(', '))
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const palavras = texto
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean)
    const { error } = await supabase.from('empresas').update({ palavras_chave: palavras }).eq('id', empresa.id)
    setSalvando(false)
    if (error) return toast.error(mensagemErro(error))
    toast.success('Perfil de atuação atualizado.')
    setEditando(false)
    aoSalvar()
  }

  if (editando) {
    return (
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="palavras separadas por vírgula" autoFocus />
        <div className="flex gap-2">
          <Button tamanho="sm" onClick={salvar} carregando={salvando}>
            Salvar
          </Button>
          <Button tamanho="sm" variante="fantasma" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {empresa.palavras_chave.length === 0 ? (
        <span className="text-xs text-warning">Sem palavras-chave: o Radar não saberá o que buscar.</span>
      ) : (
        empresa.palavras_chave.map((p) => <Badge key={p} cor="azul">{p}</Badge>)
      )}
      {podeEditar && (
        <button onClick={() => setEditando(true)} className="ml-1 text-xs text-primary hover:underline">
          editar
        </button>
      )}
    </div>
  )
}

export default function Empresas() {
  const { org, empresas, podeAdministrar, podeEditar, recarregar } = useOrg()
  const [novo, setNovo] = useState(false)

  async function excluir(e: Empresa) {
    if (!confirm(`Excluir ${e.razao_social}? Todos os processos, documentos e contratos desta empresa serão apagados. Esta ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('empresas').delete().eq('id', e.id)
    if (error) return toast.error(mensagemErro(error))
    toast.success('Empresa excluída.')
    recarregar()
  }

  return (
    <>
      <CabecalhoPagina
        titulo={org?.tipo === 'assessoria' ? 'Empresas clientes' : 'Empresas'}
        descricao="Empresas (CNPJ) que participam das licitações."
        acoes={
          podeAdministrar && (
            <Button onClick={() => setNovo(true)}>
              <Plus className="h-4 w-4" /> Nova empresa
            </Button>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {empresas.map((e) => (
          <Card key={e.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{e.nome_fantasia || e.razao_social}</div>
                {e.nome_fantasia && <div className="truncate text-sm text-muted-foreground">{e.razao_social}</div>}
                <div className="mt-1 text-sm tabular-nums text-muted-foreground">{formatarCnpj(e.cnpj)}</div>
              </div>
              {podeAdministrar && empresas.length > 1 && (
                <button onClick={() => excluir(e)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Excluir empresa">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {e.porte && <Badge>{e.porte}</Badge>}
              {e.municipio && <Badge>{e.municipio}/{e.uf}</Badge>}
              {e.optante_simples && <Badge>Simples</Badge>}
            </div>
            <PalavrasChave empresa={e} podeEditar={podeEditar} aoSalvar={recarregar} />
          </Card>
        ))}
      </div>

      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Nova empresa">
        {org && (
          <EmpresaForm
            orgId={org.id}
            aoSalvar={() => {
              toast.success('Empresa cadastrada.')
              setNovo(false)
              recarregar()
            }}
          />
        )}
      </Modal>
    </>
  )
}
