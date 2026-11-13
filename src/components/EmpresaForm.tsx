import { useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { consultarCnpj, type DadosCnpj } from '@/lib/brasilapi'
import { apenasDigitos, cnpjValido, formatarCnpj } from '@/lib/format'
import { Aviso, Badge, Button, Campo, Input } from '@/components/ui'

/** Cadastro de empresa licitante: busca o CNPJ na Receita (BrasilAPI) e grava em `empresas`. */
export function EmpresaForm({ orgId, aoSalvar, textoBotao = 'Cadastrar empresa' }: { orgId: string; aoSalvar: (id: string) => void; textoBotao?: string }) {
  const [cnpj, setCnpj] = useState('')
  const [dados, setDados] = useState<DadosCnpj | null>(null)
  const [razao, setRazao] = useState('')
  const [fantasia, setFantasia] = useState('')
  const [palavras, setPalavras] = useState('')
  const [erro, setErro] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function buscar() {
    setErro('')
    if (!cnpjValido(cnpj)) return setErro('CNPJ inválido. Confira os números.')
    setBuscando(true)
    try {
      const d = await consultarCnpj(cnpj)
      setDados(d)
      setRazao(d.razao_social)
      setFantasia(d.nome_fantasia ?? '')
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setBuscando(false)
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (!cnpjValido(cnpj)) return setErro('CNPJ inválido. Confira os números.')
    if (!razao.trim()) return setErro('Informe a razão social.')
    setSalvando(true)
    const { data, error } = await supabase
      .from('empresas')
      .insert({
        org_id: orgId,
        cnpj: apenasDigitos(cnpj),
        razao_social: razao.trim(),
        nome_fantasia: fantasia.trim() || null,
        porte: dados?.porte ?? null,
        optante_simples: dados?.optante_simples ?? null,
        cnae_principal: dados?.cnae_principal ?? null,
        cnaes: dados?.cnaes ?? [],
        endereco: dados?.endereco ?? {},
        uf: dados?.uf ?? null,
        municipio: dados?.municipio ?? null,
        email: dados?.email ?? null,
        telefone: dados?.telefone ?? null,
        palavras_chave: palavras
          .split(',')
          .map((p) => p.trim().toLowerCase())
          .filter(Boolean),
      })
      .select('id')
      .single()
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    aoSalvar(data.id)
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      {erro && <Aviso>{erro}</Aviso>}
      <Campo rotulo="CNPJ" htmlFor="cnpj">
        <div className="flex gap-2">
          <Input
            id="cnpj"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            value={formatarCnpj(cnpj)}
            onChange={(e) => {
              setCnpj(apenasDigitos(e.target.value))
              setDados(null)
            }}
            onBlur={() => apenasDigitos(cnpj).length === 14 && !dados && buscar()}
            required
          />
          <Button type="button" variante="contorno" onClick={buscar} carregando={buscando} aria-label="Buscar CNPJ">
            {!buscando && <Search className="h-4 w-4" />}
            Buscar
          </Button>
        </div>
      </Campo>

      {dados && (
        <div className="flex flex-wrap gap-2 text-xs">
          {dados.situacao && <Badge cor={dados.situacao === 'ATIVA' ? 'verde' : 'vermelho'}>{dados.situacao}</Badge>}
          {dados.porte && <Badge cor="azul">{dados.porte}</Badge>}
          {dados.municipio && <Badge>{dados.municipio}/{dados.uf}</Badge>}
          {dados.optante_simples && <Badge>Simples Nacional</Badge>}
        </div>
      )}

      <Campo rotulo="Razão social" htmlFor="razao">
        <Input id="razao" required value={razao} onChange={(e) => setRazao(e.target.value)} />
      </Campo>
      <Campo rotulo="Nome fantasia" htmlFor="fantasia">
        <Input id="fantasia" value={fantasia} onChange={(e) => setFantasia(e.target.value)} />
      </Campo>
      <Campo rotulo="O que a empresa vende ou presta?" htmlFor="palavras" ajuda="Palavras-chave separadas por vírgula. O Radar usa isso para achar pregões e dispensas para você.">
        <Input id="palavras" placeholder="ex.: notebook, material de escritório, manutenção predial" value={palavras} onChange={(e) => setPalavras(e.target.value)} />
      </Campo>
      <Button type="submit" className="w-full" carregando={salvando}>
        {textoBotao}
      </Button>
    </form>
  )
}
