import { motion } from 'framer-motion'

/** Robozinho do "Minha IA": cabeça com antena que pisca, olhos que piscam e sorriso. `ligado` = IA do cliente conectada. */
export function RoboIA({ tamanho = 56, ligado = false, animado = true }: { tamanho?: number; ligado?: boolean; animado?: boolean }) {
  const cor = ligado ? '#10b981' : '#38bdf8'
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="robo-cabeca" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e293b" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      {/* antena */}
      <line x1="32" y1="9" x2="32" y2="17" stroke={cor} strokeWidth="2.5" strokeLinecap="round" />
      <motion.circle cx="32" cy="7" r="4" fill={cor}
        animate={animado ? { opacity: [1, 0.35, 1], scale: [1, 1.25, 1] } : undefined}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} style={{ transformOrigin: '32px 7px' }} />
      {/* orelhas */}
      <rect x="5" y="30" width="6" height="12" rx="3" fill={cor} opacity="0.85" />
      <rect x="53" y="30" width="6" height="12" rx="3" fill={cor} opacity="0.85" />
      {/* cabeça */}
      <rect x="10" y="17" width="44" height="38" rx="13" fill="url(#robo-cabeca)" stroke={cor} strokeWidth="2.5" />
      {/* tela do rosto */}
      <rect x="16" y="24" width="32" height="22" rx="8" fill="#020617" opacity="0.9" />
      {/* olhos que piscam */}
      {[25, 39].map((x) => (
        <motion.ellipse key={x} cx={x} cy="33" rx="3.6" ry="4" fill={cor}
          animate={animado ? { scaleY: [1, 1, 0.1, 1, 1] } : undefined}
          transition={{ duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }} style={{ transformOrigin: `${x}px 33px` }} />
      ))}
      {/* sorriso */}
      <path d="M25 40 Q32 45 39 40" fill="none" stroke={cor} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
