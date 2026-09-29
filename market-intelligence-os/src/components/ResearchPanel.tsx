'use client'

import { Loader2, Play, Search, Send } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { ResearchRequest } from '@/core/schemas'
import { fmtDateTimeBRT } from '@/lib/format'
import { cn, Pill } from './ui'

const TONE: Record<string, 'ok' | 'warn' | 'crit' | 'neutral' | 'accent'> = { COMPLETED: 'ok', PENDING: 'neutral', IN_PROGRESS: 'accent', FAILED: 'crit', CONFLICT: 'warn' }

export function ResearchPanel({ requests }: { requests: ResearchRequest[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [, start] = useTransition()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (q.trim().length < 5) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q, requested_by: 'orchestrator' }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`)
      setQ('')
      start(() => router.refresh())
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <form onSubmit={submit} className="mb-3 flex gap-2">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:ring-2 focus-within:ring-accent">
          <Search aria-hidden className="size-4 text-ink-3" />
          <span className="sr-only">Pergunta para o Agent 1</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: Qual o IPCA em 12 meses? Como fechou o Nikkei?" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" />
        </label>
        <button disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-navy px-4 text-[13px] font-semibold text-white hover:bg-navy-2 disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Pesquisar
        </button>
      </form>
      {err && <p className="mb-2 text-[12px] text-crit">{err}</p>}
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {requests.slice(0, 8).map((r) => (
          <li key={r.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Pill tone={TONE[r.status]}>{r.status}</Pill>
              <span className="text-[11px] text-ink-3">{r.requested_by} · {fmtDateTimeBRT(r.created_at)}</span>
            </div>
            <div className="mt-1 text-[13px] font-semibold text-ink">{r.question}</div>
            {r.response && <div className="mt-0.5 text-[12.5px] text-ink-2">{r.response.summary}{r.response.notes ? ` ${r.response.notes}` : ''}</div>}
          </li>
        ))}
        {!requests.length && <li className="px-4 py-5 text-center text-[13px] text-ink-3">Nenhuma research request ainda.</li>}
      </ul>
    </div>
  )
}

export function RunNowButton() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const run = async () => {
    setState('running')
    try {
      const res = await fetch('/api/run', { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setState('done')
      setMsg(`${j.status} · ${j.snapshot ?? ''}`)
      router.refresh()
    } catch (e) {
      setState('error')
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={state === 'running'} className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[12px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-60')}>
        {state === 'running' ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Rodar Morning Intelligence agora
      </button>
      {msg && <span className={cn('text-[11.5px]', state === 'error' ? 'text-crit' : 'text-ink-3')}>{msg}</span>}
    </span>
  )
}
