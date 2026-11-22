import { useId, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ImageUp, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { Button, Campo, Input, Select, Textarea } from '@/components/ui'
import { CORES_ITEM, CORES_SELO, type ItemSite, type LinkSite } from '@/lib/conteudoSite'
import { icone, NOMES_ICONES } from '@/pages/landing/icones'
import { cn } from '@/lib/utils'

export function mover<T>(lista: T[], i: number, d: -1 | 1): T[] {
  const j = i + d
  if (j < 0 || j >= lista.length) return lista
  const n = [...lista]
  ;[n[i], n[j]] = [n[j], n[i]]
  return n
}

export function Texto({ rotulo, valor, mudar, longo, ajuda, placeholder }: { rotulo: string; valor: string; mudar: (v: string) => void; longo?: boolean; ajuda?: string; placeholder?: string }) {
  const id = useId()
  return (
    <Campo rotulo={rotulo} htmlFor={id} ajuda={ajuda}>
      {longo ? <Textarea id={id} rows={3} maxLength={4000} value={valor} placeholder={placeholder} onChange={(e) => mudar(e.target.value)} /> : <Input id={id} maxLength={4000} value={valor} placeholder={placeholder} onChange={(e) => mudar(e.target.value)} />}
    </Campo>
  )
}

export function Opcoes({ rotulo, valor, mudar, opcoes, ajuda }: { rotulo: string; valor: string; mudar: (v: string) => void; opcoes: [string, string][]; ajuda?: string }) {
  const id = useId()
  return (
    <Campo rotulo={rotulo} htmlFor={id} ajuda={ajuda}>
      <Select id={id} value={valor} onChange={(e) => mudar(e.target.value)}>
        {opcoes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </Select>
    </Campo>
  )
}

export function EscolherIcone({ rotulo = 'Ícone', valor, mudar, vazio = '' }: { rotulo?: string; valor: string; mudar: (v: string) => void; vazio?: string }) {
  const id = useId()
  const I = icone(valor)
  return (
    <Campo rotulo={rotulo} htmlFor={id}>
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-muted">{valor && valor !== vazio ? <I className="h-5 w-5" /> : '–'}</span>
        <Select id={id} value={valor} onChange={(e) => mudar(e.target.value)}>
          <option value={vazio}>Sem ícone</option>
          {NOMES_ICONES.map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
    </Campo>
  )
}

export function Cor({ rotulo, valor, mudar }: { rotulo: string; valor: string; mudar: (v: string) => void }) {
  const id = useId()
  return (
    <Campo rotulo={rotulo} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input id={id} type="color" value={valor} onChange={(e) => mudar(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-xl border bg-card p-1" />
        <Input value={valor} maxLength={7} onChange={(e) => mudar(e.target.value)} />
      </div>
    </Campo>
  )
}

export function Marcar({ rotulo, valor, mudar }: { rotulo: string; valor: boolean; mudar: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={valor} onChange={(e) => mudar(e.target.checked)} className="h-4 w-4 accent-emerald-500" /> {rotulo}
    </label>
  )
}

/** Campo de imagem: cola um endereço ou envia um arquivo para o armazenamento público do site. */
export function Imagem({ rotulo, valor, mudar, ajuda }: { rotulo: string; valor: string; mudar: (v: string) => void; ajuda?: string }) {
  const id = useId()
  const arquivo = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  async function enviar(f: File) {
    if (!f.type.startsWith('image/')) return toast.error('Escolha um arquivo de imagem')
    if (f.size > 5 * 1024 * 1024) return toast.error('Imagem maior que 5 MB')
    setEnviando(true)
    try {
      const nome = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60)
      const caminho = `landing/${Date.now()}-${nome}`
      const { error } = await supabase.storage.from('site').upload(caminho, f, { contentType: f.type, cacheControl: '31536000' })
      if (error) throw error
      mudar(supabase.storage.from('site').getPublicUrl(caminho).data.publicUrl)
      toast.success('Imagem enviada')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setEnviando(false) }
  }
  return (
    <Campo rotulo={rotulo} htmlFor={id} ajuda={ajuda ?? 'Envie um arquivo ou cole um endereço https://'}>
      <div className="flex items-center gap-2">
        {valor && <img src={valor} alt="" className="h-10 w-10 shrink-0 rounded-lg border object-cover" />}
        <Input id={id} value={valor} placeholder="https://…" onChange={(e) => mudar(e.target.value)} />
        <Button type="button" variante="contorno" tamanho="icone" className="shrink-0" carregando={enviando} title="Enviar imagem" onClick={() => arquivo.current?.click()}>{!enviando && <ImageUp className="h-4 w-4" />}</Button>
        {valor && <Button type="button" variante="fantasma" tamanho="icone" className="shrink-0" title="Remover imagem" onClick={() => mudar('')}><Trash2 className="h-4 w-4" /></Button>}
        <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) enviar(f) }} />
      </div>
    </Campo>
  )
}

export function Botao({ rotulo, valor, mudar }: { rotulo: string; valor: LinkSite; mudar: (v: LinkSite) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Texto rotulo={`${rotulo} · texto`} valor={valor.texto} mudar={(texto) => mudar({ ...valor, texto })} ajuda="Vazio = botão escondido" />
      <Texto rotulo={`${rotulo} · link`} valor={valor.link} mudar={(link) => mudar({ ...valor, link })} placeholder="/cadastro, #planos, https://…" />
    </div>
  )
}

function Linha({ children, i, total, mover: m, remover }: { children: ReactNode; i: number; total: number; mover: (d: -1 | 1) => void; remover: () => void }) {
  return (
    <div className="flex gap-2 rounded-xl border bg-muted/30 p-2">
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
      <div className="flex shrink-0 flex-col gap-1">
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={i === 0} onClick={() => m(-1)} title="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={i === total - 1} onClick={() => m(1)} title="Descer"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={remover} title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}

export function ListaTextos({ rotulo, valor, mudar, novo = 'Novo item' }: { rotulo: string; valor: string[]; mudar: (v: string[]) => void; novo?: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{rotulo}</p>
      {valor.map((t, i) => (
        <Linha key={i} i={i} total={valor.length} mover={(d) => mudar(mover(valor, i, d))} remover={() => mudar(valor.filter((_, k) => k !== i))}>
          <Input value={t} maxLength={4000} aria-label={`${rotulo} ${i + 1}`} onChange={(e) => mudar(valor.map((x, k) => (k === i ? e.target.value : x)))} />
        </Linha>
      ))}
      <Button type="button" tamanho="sm" variante="contorno" onClick={() => mudar([...valor, novo])}><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
    </div>
  )
}

export function ListaLinks({ rotulo, valor, mudar }: { rotulo: string; valor: LinkSite[]; mudar: (v: LinkSite[]) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{rotulo}</p>
      {valor.map((l, i) => (
        <Linha key={i} i={i} total={valor.length} mover={(d) => mudar(mover(valor, i, d))} remover={() => mudar(valor.filter((_, k) => k !== i))}>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={l.texto} placeholder="Texto" aria-label="Texto do link" onChange={(e) => mudar(valor.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)))} />
            <Input value={l.link} placeholder="#ancora, /pagina, https://…" aria-label="Endereço do link" onChange={(e) => mudar(valor.map((x, k) => (k === i ? { ...x, link: e.target.value } : x)))} />
          </div>
        </Linha>
      ))}
      <Button type="button" tamanho="sm" variante="contorno" onClick={() => mudar([...valor, { texto: 'Novo link', link: '#' }])}><Plus className="h-3.5 w-3.5" /> Adicionar link</Button>
    </div>
  )
}

export type CamposItem = { icone?: boolean; selo?: boolean; cor?: 'selo' | 'gradiente'; rotuloTitulo?: string; rotuloTexto?: string }

export function ListaItens({ rotulo, valor, mudar, campos }: { rotulo: string; valor: ItemSite[]; mudar: (v: ItemSite[]) => void; campos: CamposItem }) {
  const trocar = (i: number, p: Partial<ItemSite>) => mudar(valor.map((x, k) => (k === i ? { ...x, ...p } : x)))
  const cores = campos.cor === 'gradiente' ? CORES_ITEM : CORES_SELO
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{rotulo} <span className="text-muted-foreground">({valor.length})</span></p>
      {valor.map((it, i) => (
        <Linha key={i} i={i} total={valor.length} mover={(d) => mudar(mover(valor, i, d))} remover={() => mudar(valor.filter((_, k) => k !== i))}>
          <Texto rotulo={campos.rotuloTitulo ?? 'Título'} valor={it.titulo} mudar={(titulo) => trocar(i, { titulo })} />
          <Texto rotulo={campos.rotuloTexto ?? 'Texto'} valor={it.texto} longo mudar={(texto) => trocar(i, { texto })} />
          {(campos.icone || campos.selo || campos.cor) && (
            <div className={cn('grid gap-2', campos.selo || campos.cor ? 'sm:grid-cols-2' : '')}>
              {campos.icone && <EscolherIcone valor={it.icone} mudar={(v) => trocar(i, { icone: v })} />}
              {campos.selo && <Texto rotulo="Etiqueta" valor={it.selo} mudar={(selo) => trocar(i, { selo })} placeholder="Ex.: Disponível" />}
              {campos.cor && <Opcoes rotulo={campos.cor === 'gradiente' ? 'Cor do ícone' : 'Cor da etiqueta'} valor={it.cor || cores[0]} mudar={(cor) => trocar(i, { cor })} opcoes={cores.map((c): [string, string] => [c, c[0].toUpperCase() + c.slice(1)])} />}
            </div>
          )}
        </Linha>
      ))}
      <Button type="button" tamanho="sm" variante="contorno" onClick={() => mudar([...valor, { icone: campos.icone ? 'Sparkles' : '', titulo: 'Novo item', texto: '', selo: '', cor: '' }])}><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
    </div>
  )
}
