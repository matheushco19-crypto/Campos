'use client'

import { CalendarDays, ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { fmtTimeBRT } from '@/lib/format'
import { cn } from './ui'

export function DateNav(props: { date: string; today: string; prevDate: string | null; nextDate: string | null; availableDates: string[]; versions: { version: number; generated_at: string; status: string }[]; version: number | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const go = (d: string | null, v?: number) => d && start(() => router.push(`/?date=${d}${v ? `&v=${v}` : ''}`))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return
      if (e.key === 'ArrowLeft' && props.prevDate) go(props.prevDate)
      if (e.key === 'ArrowRight' && props.nextDate) go(props.nextDate)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', pending && 'opacity-60')} aria-busy={pending}>
      <NavBtn label="Data anterior (←)" disabled={!props.prevDate} onClick={() => go(props.prevDate)}>
        <ChevronLeft className="size-4" />
      </NavBtn>
      <label className="relative inline-flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2 text-[12px] font-semibold text-white hover:bg-white/10">
        <CalendarDays className="size-3.5 text-white/70" aria-hidden />
        <span className="sr-only">Selecionar data</span>
        <input
          type="date"
          value={props.date}
          max={props.today}
          onChange={(e) => go(e.target.value)}
          className="w-[104px] min-w-0 bg-transparent text-white tnum outline-none [color-scheme:dark]"
          list="mi-dates"
        />
        <datalist id="mi-dates">
          {props.availableDates.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </label>
      <NavBtn label="Data seguinte (→)" disabled={!props.nextDate} onClick={() => go(props.nextDate)}>
        <ChevronRight className="size-4" />
      </NavBtn>
      {props.date !== props.today && (
        <button type="button" onClick={() => go(props.today)} className="hidden h-8 rounded-md border border-white/15 px-2.5 text-[12px] font-semibold text-white/85 hover:bg-white/10 sm:inline-flex sm:items-center">
          Hoje
        </button>
      )}
      {props.versions.length > 1 && (
        <select
          aria-label="Versão do briefing"
          value={props.version ?? ''}
          onChange={(e) => go(props.date, Number(e.target.value) || undefined)}
          className="hidden h-8 max-w-[240px] min-w-0 truncate rounded-md border border-white/15 bg-white/5 px-1.5 text-[12px] font-semibold text-white outline-none sm:block [color-scheme:dark]"
        >
          <option value="">Atual</option>
          {props.versions.map((v) => (
            <option key={v.version} value={v.version}>
              v{v.version} · {fmtTimeBRT(v.generated_at)} · {STATUS_PT[v.status] ?? v.status}
            </option>
          ))}
        </select>
      )}
      <ThemeToggle />
    </div>
  )
}

const STATUS_PT: Record<string, string> = { PUBLISHED: 'publicado', AWAITING_ANALYSIS: 'aguardando análise', DRAFT_FACTS_ONLY: 'só fatos', FAILED_QC: 'reprovado no QC' }

function NavBtn({ children, label, disabled, onClick }: { children: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-8 place-items-center rounded-md border border-white/15 bg-white/5 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30">
      {children}
    </button>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null)
  useEffect(() => {
    const t = document.documentElement.dataset.theme
    setDark(t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches)
  }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    try {
      localStorage.setItem('mi-theme', next ? 'dark' : 'light')
    } catch {}
  }
  return (
    <button type="button" onClick={toggle} aria-label="Alternar tema" className="grid size-8 place-items-center rounded-md border border-white/15 bg-white/5 text-white hover:bg-white/10">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
