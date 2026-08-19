import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) redirect('/login')

  return (
    <main className="shell">
      <section className="panel">
        <div className="kicker">Wealth OS</div>
        <h1 className="title">Gestão Financeira</h1>
        <p className="muted">Ambiente autenticado conectado ao Supabase. A base do produto está pronta para receber o primeiro fluxo de documentos.</p>
      </section>
    </main>
  )
}
