'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function updatePassword(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const confirmation = String(formData.get('confirmation') ?? '')

  if (password.length < 8) redirect('/redefinir-senha?error=weak')
  if (password !== confirmation) redirect('/redefinir-senha?error=mismatch')

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) redirect('/redefinir-senha?error=update')
  await supabase.auth.signOut()
  redirect('/login?message=password-updated')
}
