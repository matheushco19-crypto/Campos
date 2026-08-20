import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ClientPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  const { data: user } = await supabase.from('users').select('full_name,role,is_active').eq('id', auth.claims.sub).maybeSingle()
  if (!user?.is_active || !['cliente', 'client'].includes(user.role.toLowerCase())) redirect('/login?error=unauthorized')

  return (
    <main className="page">
      <section className="card">
        <div className="logo">Campos Wealth OS</div>
        <p className="subtitle">Área do cliente</p>
        <p className="muted">Olá, {user.full_name ?? 'cliente'}. Sua área financeira será disponibilizada nesta conta.</p>
      </section>
    </main>
  )
}
