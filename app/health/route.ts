import { NextResponse } from 'next/server'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/lib/supabase/config'

export async function GET() {
  return NextResponse.json({
    ok: true,
    supabaseUrlConfigured: Boolean(SUPABASE_URL),
    supabaseKeyConfigured: Boolean(SUPABASE_PUBLISHABLE_KEY),
    supabaseHost: new URL(SUPABASE_URL).host,
    nodeEnv: process.env.NODE_ENV,
  })
}
