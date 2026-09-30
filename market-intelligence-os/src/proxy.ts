import { NextResponse, type NextRequest } from 'next/server'

/**
 * Dashboard protection: HTTP Basic Auth when DASHBOARD_PASSWORD is set.
 * Machine endpoints (/api/cron, /api/analysis, /api/health) authenticate themselves with CRON_SECRET.
 */
export function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD
  if (!password) {
    // Fail closed on Vercel: a deployment without DASHBOARD_PASSWORD never serves the dashboard openly.
    if (process.env.VERCEL) return new NextResponse('DASHBOARD_PASSWORD não configurada', { status: 503 })
    return NextResponse.next()
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth.startsWith('Basic ')) {
    try {
      const [, pass] = atob(auth.slice(6)).split(':')
      if (pass === password) return NextResponse.next()
    } catch {}
  }
  return new NextResponse('Autenticação necessária', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Market Intelligence OS", charset="UTF-8"' } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron|api/analysis|api/health).*)'],
}
