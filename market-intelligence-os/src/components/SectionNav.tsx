'use client'

import { useEffect, useState } from 'react'
import { cn } from './ui'

export const SECTIONS = [
  ['overview', 'Overview'],
  ['markets', 'Mercados'],
  ['intelligence', 'Intelligence'],
  ['content', 'Conteúdo'],
  ['calendar', 'Agenda'],
  ['history', 'Histórico'],
] as const

export function SectionNav() {
  const [active, setActive] = useState('overview')
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-120px 0px -60% 0px' },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])
  return (
    <nav aria-label="Seções" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-0.5">
        {SECTIONS.map(([id, label]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? 'true' : undefined}
              className={cn(
                'relative block px-3 py-2.5 text-[12.5px] font-bold tracking-wide transition-colors',
                'after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors',
                active === id ? 'text-white after:bg-accent' : 'text-white/55 after:bg-transparent hover:text-white',
              )}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
