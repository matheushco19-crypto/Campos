'use client'

import { ChevronDown, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import type { EventCluster } from '@/core/schemas'
import { TOPIC_LABELS } from '@/lib/topics'
import { fmtTimeBRT, REGION_LABEL } from '@/lib/format'
import { clusterProvenance } from '@/lib/provenance'
import { cn } from './ui'
import { VerificationBadge } from './VerificationBadge'

export function NewsList({ clusters }: { clusters: EventCluster[] }) {
  const [topic, setTopic] = useState<string>('all')
  const [open, setOpen] = useState<string | null>(null)
  const topics = [...new Set(clusters.map((c) => c.topic))]
  const list = clusters.filter((c) => topic === 'all' || c.topic === topic)
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Filtrar por tema">
        {['all', ...topics].map((t) => (
          <button key={t} role="tab" aria-selected={topic === t} onClick={() => setTopic(t)} className={cn('rounded-full px-3 py-1 text-[12px] font-semibold', topic === t ? 'bg-navy text-white' : 'bg-muted-soft text-ink-2 hover:bg-line')}>
            {t === 'all' ? `Todos (${clusters.length})` : TOPIC_LABELS[t] ?? t}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {list.map((c) => {
          const isOpen = open === c.id
          const sources = [...new Set(c.sources.map((s) => s.source))]
          return (
            <li key={c.id}>
              <div className="flex items-start gap-3 px-4 py-3">
                <ImportanceBar v={c.importance} />
                <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen} className="min-w-0 flex-1 text-left">
                  <div className="text-[14px] leading-snug font-semibold text-ink">{c.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-3">
                    <span>{TOPIC_LABELS[c.topic] ?? c.topic}</span>·<span>{REGION_LABEL[c.region]}</span>·<span className="tnum">{fmtTimeBRT(c.last_published_at)}</span>·
                    <span className="font-semibold text-ink-2">{sources.length > 1 ? `${sources.length} fontes` : sources[0]}</span>
                  </div>
                </button>
                <VerificationBadge p={clusterProvenance(c)} compact />
                <ChevronDown aria-hidden className={cn('mt-1 size-4 shrink-0 text-ink-3 transition-transform', isOpen && 'rotate-180')} />
              </div>
              {isOpen && (
                <ul className="space-y-1 bg-surface-2 px-4 py-3 pl-9 text-[12.5px]">
                  {c.sources.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-28 shrink-0 font-semibold text-ink-2">{s.source}</span>
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1 text-accent hover:underline">
                        {s.headline} <ExternalLink aria-hidden className="inline size-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
        {!list.length && <li className="px-4 py-6 text-center text-sm text-ink-3">Nenhum evento coletado.</li>}
      </ul>
    </div>
  )
}

function ImportanceBar({ v }: { v: number }) {
  return (
    <span className="mt-1 flex h-8 w-1 shrink-0 flex-col justify-end overflow-hidden rounded-full bg-muted-soft" title={`Importância ${Math.round(v)}/100`} aria-label={`Importância ${Math.round(v)} de 100`}>
      <span className="w-full rounded-full bg-accent" style={{ height: `${Math.max(12, v)}%` }} />
    </span>
  )
}
