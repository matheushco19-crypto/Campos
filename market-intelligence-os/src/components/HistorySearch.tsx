'use client'

import { Search } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { fmtDate } from '@/lib/format'

type Hit = { date: string; version: number; kind: string; text: string }

export function HistorySearch() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (q.trim().length < 3) {
      setHits([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/history?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        if (res.ok) setHits((await res.json()).hits)
      } catch {}
      setLoading(false)
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])
  return (
    <div>
      <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:ring-2 focus-within:ring-accent">
        <Search aria-hidden className="size-4 text-ink-3" />
        <span className="sr-only">Pesquisa histórica</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar em todos os briefings (ex.: Copom, tarifa, Nvidia)" className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-3" />
        {loading && <span className="text-[11px] text-ink-3">…</span>}
      </label>
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
          {hits.map((h, i) => (
            <li key={i}>
              <Link href={`/?date=${h.date}&v=${h.version}`} className="block px-3 py-2 hover:bg-surface-2">
                <span className="text-[11px] font-semibold text-ink-3">{fmtDate(h.date)} · {h.kind}</span>
                <span className="block text-[13px] text-ink">{h.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
