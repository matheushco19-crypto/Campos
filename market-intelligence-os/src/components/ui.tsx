import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...c: ClassValue[]) => twMerge(clsx(c))

export function Section({ id, index, eyebrow, title, lead, action, children, className }: { id: string; index?: string; eyebrow: string; title: string; lead?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn('scroll-mt-28', className)} aria-labelledby={`${id}-title`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <div className="eyebrow flex items-center gap-2">
            {index && <span className="text-accent tnum">{index}</span>}
            {eyebrow}
          </div>
          <h2 id={`${id}-title`} className="mt-1 text-[21px] leading-tight font-extrabold tracking-tight text-ink sm:text-[23px]">
            {title}
          </h2>
          {lead && <p className="mt-1 max-w-2xl text-[13px] text-ink-3">{lead}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Panel({ children, className, as: As = 'div' }: { children: React.ReactNode; className?: string; as?: 'div' | 'article' | 'aside' | 'li' }) {
  return <As className={cn('min-w-0 rounded-xl border border-line bg-surface', className)}>{children}</As>
}

export function Empty({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-ink-3', className)}>{children}</div>
}

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'crit' | 'solid'

export function Pill({ children, tone = 'neutral', className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-muted-soft text-ink-2',
    accent: 'bg-accent-soft text-accent',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    crit: 'bg-crit-soft text-crit',
    solid: 'bg-ink text-surface',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide whitespace-nowrap', tones[tone], className)}>{children}</span>
}

/** Small uppercase label used inside cards ("POR QUE ACONTECEU"). */
export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('text-[10px] font-extrabold tracking-[0.16em] text-ink-3 uppercase', className)}>{children}</div>
}
