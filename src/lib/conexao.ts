/** Libera a requisição quando a rede demora ou a consulta é cancelada. */
export async function consultarComLimite<T>(consulta: (signal: AbortSignal) => PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  let cancelar: () => void
  let timer: ReturnType<typeof setTimeout>
  const limite = new Promise<never>((_, reject) => {
    cancelar = () => {
      controller.abort()
      reject(new Error('A conexão foi interrompida ou demorou demais. Tente novamente.'))
    }
    timer = setTimeout(cancelar, 15_000)
    if (signal?.aborted) cancelar()
    else signal?.addEventListener('abort', cancelar, { once: true })
  })
  try { return await Promise.race([limite, Promise.resolve().then(() => consulta(controller.signal))]) }
  finally { clearTimeout(timer!); signal?.removeEventListener('abort', cancelar!) }
}
