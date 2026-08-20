'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) redirect('/login?error=missing')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) redirect('/login?error=credentials')

  // Authorization is checked after authentication, against the application's
  // own public.users table. This keeps Auth identity and application role separate.
  const { data: appUser, error: roleError } = await supabase
    .from('users')
    .select('id,role,is_active')
    .eq('id', data.user.id)
    .maybeSingle()

  if (roleError || !appUser || !appUser.is_active || appUser.role !== 'admin') {
    await supabase.auth.signOut()
    redirect('/login?error=unauthorized')
  }

  redirect('/')
}
