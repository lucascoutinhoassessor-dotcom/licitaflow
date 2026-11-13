import { useState, type FormEvent } from 'react'
import { Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Campo, Input, Select } from '@/components/ui'
import { SeletorEmpresa, useEmpresaPadrao } from '@/components/Situacoes'
import { CATEGORIAS_DOC, CERTIDOES_COMUNS, type CategoriaDoc } from '@/lib/dominio'
import { supabase, mensagemErro } from '@/lib/supabase'
import { useSalvar } from '@/hooks/useDados'
import { useOrg } from '@/providers/OrgProvider'
import type { Documento } from '@/types/db'

const TAMANHO_MAX = 50 * 1024 * 1024

/** Abre o arquivo do documento (link temporário de 5 minutos). */
export async function abrirArquivo(path: string) {
  const { data, error } = await supabase.storage.from('arquivos').createSignedUrl(path, 300)
  if (error) return toast.error(mensagemErro(error))
  window.open(data.signedUrl, '_blank', 'noopener')
}

export function DocumentoForm({
  documento,
  processoId,
  categoriaInicial = 'certidao',
  aoSalvar,
}: {
  documento?: Documento
  processoId?: string
  categoriaInicial?: CategoriaDoc
  aoSalvar: () => void
}) {
  const { org } = useOrg()
  const padrao = useEmpresaPadrao()
  const [empresa, setEmpresa] = useState(documento?.empresa_id ?? padrao)
  const [categoria, setCategoria] = useState<CategoriaDoc>(documento?.categoria ?? categoriaInicial)
  const [nome, setNome] = useState(documento?.nome ?? '')
  const [numero, setNumero] = useState(documento?.numero ?? '')
  const [emissao, setEmissao] = useState(documento?.emissao ?? '')
  const [validade, setValidade] = useState(documento?.validade ?? '')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const { salvar } = useSalvar('documentos')

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (arquivo && arquivo.size > TAMANHO_MAX) return toast.error('O arquivo passa de 50 MB.')
    setEnviando(true)
    try {
      let storage: Record<string, unknown> = {}
      if (arquivo) {
        const ext = arquivo.name.includes('.') ? arquivo.name.split('.').pop() : 'bin'
        const caminho = `${org!.id}/documentos/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from('arquivos').upload(caminho, arquivo, { contentType: arquivo.type || undefined })
        if (error) throw error
        if (documento?.storage_path) await supabase.storage.from('arquivos').remove([documento.storage_path])
        storage = { storage_path: caminho, tamanho_bytes: arquivo.size, mime_type: arquivo.type || null }
      }
      await salvar.mutateAsync({
        id: documento?.id,
        dados: {
          empresa_id: empresa || null,
          processo_id: documento?.processo_id ?? processoId ?? null,
          categoria,
          tipo: categoria === 'certidao' ? nome : null,
          nome: nome.trim() || arquivo?.name || 'Documento',
          numero,
          emissao,
          validade,
          ...storage,
        },
      })
      toast.success(documento ? 'Documento atualizado.' : 'Documento cadastrado.')
      aoSalvar()
    } catch (err) {
      toast.error(mensagemErro(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {!processoId && <SeletorEmpresa valor={empresa} aoMudar={setEmpresa} id="doc-empresa" />}
      <Campo rotulo="Categoria" htmlFor="doc-cat">
        <Select id="doc-cat" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaDoc)}>
          {Object.entries(CATEGORIAS_DOC).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo rotulo="Nome" htmlFor="doc-nome">
        <Input id="doc-nome" list="certidoes-comuns" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: CND Federal" />
        <datalist id="certidoes-comuns">
          {CERTIDOES_COMUNS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Campo>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Número" htmlFor="doc-num">
          <Input id="doc-num" value={numero} onChange={(e) => setNumero(e.target.value)} />
        </Campo>
        <Campo rotulo="Emissão" htmlFor="doc-emissao">
          <Input id="doc-emissao" type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
        </Campo>
        <Campo rotulo="Validade" htmlFor="doc-validade">
          <Input id="doc-validade" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
        </Campo>
      </div>
      <Campo rotulo={documento?.storage_path ? 'Substituir arquivo' : 'Arquivo (PDF, imagem…)'} htmlFor="doc-arquivo" ajuda="Até 50 MB. Fica guardado de forma privada na sua conta.">
        <label htmlFor="doc-arquivo" className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-input px-3 py-3 text-sm text-muted-foreground hover:bg-muted">
          <Paperclip className="h-4 w-4" />
          <span className="truncate">{arquivo ? arquivo.name : 'Escolher arquivo'}</span>
        </label>
        <input id="doc-arquivo" type="file" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
      </Campo>
      <Button type="submit" className="w-full" carregando={enviando}>
        {documento ? 'Salvar documento' : 'Cadastrar documento'}
      </Button>
    </form>
  )
}
