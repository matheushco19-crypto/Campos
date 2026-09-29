'use client'

import { useEffect, useState } from 'react'
import { cn } from './ui'

export const SECTIONS = [
  ['overview', 'Overview'],
  ['markets', 'Markets'],
  ['macro', 'Macro'],
  ['news', 'News'],
  ['intelligence', 'Intelligence'],
  ['uhnw', 'UHNW'],
  ['content', 'Content'],
  ['calendar', 'Calendar'],
  ['research', 'Research'],
  ['history', 'History'],
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
      { rootMargin: '-140px 0px -60% 0px' },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])
  return (
    <nav aria-label="Seções" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {SECTIONS.map(([id, label]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? 'true' : undefined}
              className={cn(
                'block rounded-md px-3 py-1.5 text-[12.5px] font-semibold tracking-wide transition-colors',
                active === id ? 'bg-white text-navy' : 'text-white/65 hover:bg-white/10 hover:text-white',
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
