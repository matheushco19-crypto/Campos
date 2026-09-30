import Link from 'next/link'
import { Activity } from 'lucide-react'
import { Markets } from '@/components/brief/Markets'
import { SectionNav } from '@/components/SectionNav'
import { DateNav } from '@/components/DateNav'
import { MarketTape } from '@/components/MarketTape'
import { loadDashboard } from '@/lib/dashboard-data'
import { Panel } from '@/components/ui'

export const dynamic = 'force-dynamic'

type SP = Promise<{ [key: string]: string | string[] | undefined }>

export default async function Page({ searchParams }: { searchParams: SP }) {
  const raw = await searchParams
  const one = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v
  const params = { date: one(raw.date), compare: one(raw.compare) }
  const d = await loadDashboard(params)
  return (
    <div className="min-h-screen">
      <header className="bg-deck text-white">
        <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Market Intelligence OS">
              <span aria-hidden className="grid size-7 place-items-center rounded-md bg-white text-[11px] font-black tracking-tight text-deck">MI</span>
              <span className="text-[11px] font-extrabold tracking-[0.24em] text-white/90">MARKET INTELLIGENCE <span className="text-accent">OS</span></span>
            </Link>
            <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
              <DateNav date={d.date} today={d.today} prevDate={d.prevDate} nextDate={d.nextDate} availableDates={d.availableDates} versions={d.versions} version={null} />
              <Link href="/admin" className="grid size-8 place-items-center rounded-md border border-white/15 bg-white/5 text-white hover:bg-white/10" aria-label="Administração" title="Administração">
                <Activity className="size-4" />
              </Link>
            </div>
          </div>
          {d.snapshot && <div className="border-t border-white/10"><MarketTape rows={d.snapshot.market_snapshot} facts={d.facts} /></div>}
        </div>
      </header>
      <div className="sticky top-0 z-40 border-b border-white/10 bg-deck/95 backdrop-blur">
        <div className="mx-auto max-w-[1320px] px-4 sm:px-6"><SectionNav /></div>
      </div>
      <main className="mx-auto max-w-[1320px] space-y-10 px-4 pt-7 pb-10 sm:px-6 sm:pt-10">
        {d.snapshot ? (
          <Markets s={d.snapshot} date={d.date} facts={d.facts} factById={new Map(d.facts.map((f) => [f.id, f]))} history={d.history} availableDates={d.availableDates} compare={d.compare} />
        ) : (
          <Panel className="p-6"><h1 className="text-xl font-extrabold text-ink">Mercados</h1><p className="mt-2 text-sm text-ink-3">Nenhum snapshot disponível para esta data.</p></Panel>
        )}
      </main>
    </div>
  )
}
