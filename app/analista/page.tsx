import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AnalystPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  const { data: user } = await supabase.from('users').select('full_name,role,is_active').eq('id', auth.claims.sub).maybeSingle()
  if (!user?.is_active || !['analista', 'analyst'].includes(user.role.toLowerCase())) redirect('/login?error=unauthorized')

  return (
    <main className="page">
      <section className="card">
        <div className="logo">Campos Wealth OS</div>
        <p className="subtitle">Área do analista</p>
        <p className="muted">Olá, {user.full_name ?? 'usuário'}. O workspace de analista será habilitado nesta área.</p>
      </section>
    </main>
  )
}
