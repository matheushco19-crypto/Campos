import { NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

  return NextResponse.json({
    ok: true,
    supabaseUrlConfigured: Boolean(url),
    supabaseKeyConfigured: Boolean(key),
    supabaseHost: url ? new URL(url).host : null,
    nodeEnv: process.env.NODE_ENV,
  })
}
