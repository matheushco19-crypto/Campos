import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub

  if (!userId) redirect('/login')

  // Prefer the centralized access RPC, but keep a direct users-table fallback.
  // An authorization lookup hiccup must never silently send an authenticated
  // admin back to the overview page.
  const { data: access } = await supabase.rpc('get_my_access')
  let current = access?.[0]

  if (!current?.is_active || String(current.role).toLowerCase() !== 'admin') {
    const { data: directUser } = await supabase
      .from('users')
      .select('full_name,role,is_active')
      .eq('id', userId)
      .maybeSingle()

    current = directUser ?? current
  }

  if (!current?.is_active || String(current.role).toLowerCase() !== 'admin') {
    redirect('/login?error=unauthorized')
  }

  return {
    supabase,
    userId,
    fullName: current.full_name || 'Admin',
  }
}
