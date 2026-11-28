import { Fragment } from 'react'
import { blocos, type Trecho } from '@/lib/markdownSimples'

function Trechos({ lista }: { lista: Trecho[] }) {
  return (
    <>
      {lista.map((t, i) => {
        if (t.t === 'negrito') return <strong key={i} className="font-semibold">{t.v}</strong>
        if (t.t === 'italico') return <em key={i}>{t.v}</em>
        if (t.t === 'codigo') return <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{t.v}</code>
        if (t.t === 'link') return <a key={i} href={t.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">{t.v}</a>
        return <Fragment key={i}>{t.v}</Fragment>
      })}
    </>
  )
}

/** Resposta da IA formatada (títulos, listas, negrito, código e links), sem HTML cru. */
export function TextoIA({ texto }: { texto: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocos(texto).map((b, i) => {
        if (b.tipo === 'titulo') return <p key={i} className={b.nivel === 1 ? 'text-base font-semibold' : 'font-semibold'}><Trechos lista={b.trechos} /></p>
        if (b.tipo === 'lista') {
          const Lista = b.ordenada ? 'ol' : 'ul'
          return <Lista key={i} className={`space-y-1 pl-5 ${b.ordenada ? 'list-decimal' : 'list-disc'}`}>{b.itens.map((it, j) => <li key={j}><Trechos lista={it} /></li>)}</Lista>
        }
        if (b.tipo === 'codigo') return <pre key={i} className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{b.texto}</pre>
        return <p key={i}><Trechos lista={b.trechos} /></p>
      })}
    </div>
  )
}
