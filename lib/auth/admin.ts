import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub

  if (!userId) redirect('/login')

  const { data: access } = await supabase.rpc('get_my_access')
  const current = access?.[0]

  if (!current?.is_active || String(current.role).toLowerCase() !== 'admin') {
    redirect('/login?error=unauthorized')
  }

  return {
    supabase,
    userId,
    fullName: current.full_name || 'Admin',
  }
}
