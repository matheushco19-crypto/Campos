import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...c: ClassValue[]) => twMerge(clsx(c))

export function Section({ id, eyebrow, title, action, children, className }: { id: string; eyebrow: string; title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn('scroll-mt-32', className)} aria-labelledby={`${id}-title`}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2 id={`${id}-title`} className="mt-1 text-[19px] font-bold tracking-tight text-ink">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border border-line bg-surface', className)}>{children}</div>
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">{children}</div>
}

export function Pill({ children, tone = 'neutral', className }: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'crit'; className?: string }) {
  const tones = {
    neutral: 'bg-muted-soft text-ink-2',
    accent: 'bg-accent-soft text-accent',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    crit: 'bg-crit-soft text-crit',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', tones[tone], className)}>{children}</span>
}
