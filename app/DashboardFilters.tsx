'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type Client = { id: string; full_name: string; preferred_name: string | null }

export default function DashboardFilters({ clients }: { clients: Client[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState(params.get('client') ?? '')

  function apply() {
    const next = new URLSearchParams(params.toString())
    if (clientId) next.set('client', clientId)
    else next.delete('client')
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}#financeiro`)
    setOpen(false)
  }

  function clear() {
    const next = new URLSearchParams(params.toString())
    next.delete('client')
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`)
    setClientId('')
    setOpen(false)
  }

  return (
    <>
      <button className="secondary-btn" type="button" onClick={() => setOpen(true)}>Filtrar{clientId ? ' · 1' : ''}</button>
      {open && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
        <div className="modal filter-modal" role="dialog" aria-modal="true" aria-labelledby="filter-title">
          <div className="modal-head"><div><p className="eyebrow">Visão consolidada</p><h2 id="filter-title">Filtrar dados</h2><p className="muted">Refine o dashboard por cliente. Os dados permanecem isolados pelo tenant.</p></div><button className="icon-btn" type="button" onClick={() => setOpen(false)}>×</button></div>
          <label className="filter-label">Cliente<select value={clientId} onChange={event => setClientId(event.target.value)}><option value="">Todos os clientes</option>{clients.map(client => <option key={client.id} value={client.id}>{client.preferred_name || client.full_name}</option>)}</select></label>
          <div className="modal-actions"><button className="secondary-btn" type="button" onClick={clear}>Limpar</button><button className="primary-btn" type="button" onClick={apply}>Aplicar filtros</button></div>
        </div>
      </div>}
    </>
  )
}
