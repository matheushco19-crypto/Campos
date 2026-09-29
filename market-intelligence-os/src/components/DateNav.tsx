'use client'

import { CalendarDays, ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { fmtDate, fmtTimeBRT } from '@/lib/format'
import { cn } from './ui'

export function DateNav(props: { date: string; today: string; prevDate: string | null; nextDate: string | null; availableDates: string[]; generatedAt: string | null; versions: { version: number; generated_at: string; status: string }[]; version: number | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const go = (d: string | null, v?: number) => d && start(() => router.push(`/?date=${d}${v ? `&v=${v}` : ''}`))
  const hasData = props.availableDates.includes(props.date)

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
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2 sm:gap-3', pending && 'opacity-60')}>
      <div className="flex items-baseline gap-3">
        <div className="text-[22px] font-extrabold tracking-tight text-white tnum sm:text-[26px]">{fmtDate(props.date)}</div>
        <div className="text-[12px] font-semibold text-white/60">
          {props.generatedAt ? `atualizado ${fmtTimeBRT(props.generatedAt)}` : hasData ? '' : 'sem briefing'}
          {props.date === props.today && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-white/80">hoje</span>}
        </div>
      </div>
      <div className="flex w-full min-w-0 items-center gap-1.5 sm:ml-auto sm:w-auto">
        <NavBtn label="Data anterior (←)" disabled={!props.prevDate} onClick={() => go(props.prevDate)}>
          <ChevronLeft className="size-4" />
        </NavBtn>
        <label className="relative inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2.5 text-[12.5px] font-semibold text-white hover:bg-white/10">
          <CalendarDays className="size-4 text-white/70" aria-hidden />
          <span className="sr-only">Selecionar data</span>
          <input
            type="date"
            value={props.date}
            max={props.today}
            onChange={(e) => go(e.target.value)}
            className="w-[112px] min-w-0 bg-transparent text-white outline-none [color-scheme:dark]"
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
        {props.versions.length > 1 && (
          <select
            aria-label="Versão do briefing"
            value={props.version ?? props.versions[0].version}
            onChange={(e) => go(props.date, Number(e.target.value))}
            className="h-9 min-w-0 max-w-[46vw] flex-1 truncate rounded-lg border border-white/15 bg-white/5 px-2 text-[12.5px] font-semibold text-white outline-none sm:max-w-none sm:flex-none [color-scheme:dark]"
          >
            {props.versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version} · {fmtTimeBRT(v.generated_at)} · {v.status}
              </option>
            ))}
          </select>
        )}
        <ThemeToggle />
      </div>
    </div>
  )
}

function NavBtn({ children, label, disabled, onClick }: { children: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-9 place-items-center rounded-lg border border-white/15 bg-white/5 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30">
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
    <button type="button" onClick={toggle} aria-label="Alternar tema" className="grid size-9 place-items-center rounded-lg border border-white/15 bg-white/5 text-white hover:bg-white/10">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
