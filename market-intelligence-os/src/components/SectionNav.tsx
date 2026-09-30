'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from './ui'

/** Same order as the brief (01 Overview … 05 Agenda), then the standalone pages. */
export const SECTIONS = [
  ['overview', 'Overview'],
  ['intelligence', 'Intelligence'],
  ['uhnw', 'UHNW'],
  ['content', 'Conteúdo'],
  ['calendar', 'Agenda'],
  ['markets', 'Mercados'],
  ['history', 'Histórico'],
] as const

export function SectionNav() {
  const pathname = usePathname()
  const pageActive = pathname === '/mercados' ? 'markets' : pathname === '/historico' ? 'history' : 'overview'
  return (
    <nav aria-label="Seções" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-0.5">
        {SECTIONS.map(([id, label]) => {
          const external = id === 'markets' || id === 'history'
          const href = external ? (id === 'markets' ? '/mercados' : '/historico') : id === 'overview' ? '/' : '/#' + id
          const active = pageActive === id
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative block px-3 py-2.5 text-[12.5px] font-bold tracking-wide transition-colors',
                  'after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors',
                  active ? 'text-white after:bg-accent' : 'text-white/55 after:bg-transparent hover:text-white',
                )}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
