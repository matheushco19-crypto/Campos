'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function redirectForRole(role: string): string {
  switch (role.toLowerCase()) {
    case 'admin':
      return '/'
    case 'analista':
    case 'analyst':
      return '/analista'
    case 'cliente':
    case 'client':
      return '/cliente'
    default:
      return '/login?error=unauthorized'
  }
}

function getSiteOrigin(requestHeaders: Headers): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (configured) return configured

  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'https'
  if (host) return `${protocol}://${host}`
  return 'http://localhost:3000'
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) redirect('/login?error=missing')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) redirect('/login?error=credentials')

  const { data: appUser, error: roleError } = await supabase
    .from('users')
    .select('id,role,is_active')
    .eq('id', data.user.id)
    .maybeSingle()

  if (roleError || !appUser || !appUser.is_active) {
    await supabase.auth.signOut()
    redirect('/login?error=unauthorized')
  }

  const destination = redirectForRole(appUser.role)
  if (destination.startsWith('/login')) {
    await supabase.auth.signOut()
    redirect(destination)
  }

  redirect(destination)
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) redirect('/esqueci-senha?error=missing')

  const requestHeaders = await headers()
  const redirectTo = `${getSiteOrigin(requestHeaders)}/auth/confirm?next=/redefinir-senha`
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) redirect('/esqueci-senha?error=request')
  redirect('/esqueci-senha?sent=1')
}

// Shared authentication is intentionally role-aware: the same login is used by admin, analyst, and client accounts.
