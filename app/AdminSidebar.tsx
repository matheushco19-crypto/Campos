'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/', label: 'Visão geral', icon: '⌂' },
  { href: '/clientes', label: 'Clientes', icon: '→' },
  { href: '/consultores', label: 'Consultores', icon: '●' },
  { href: '/gestao-financeira', label: 'Gestão Financeira', icon: '↗' },
]

export default function AdminSidebar({ userName = 'Admin' }: { userName?: string }) {
  const pathname = usePathname()
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark">C</div><div><strong>Campos</strong><span>Wealth OS</span></div></div>
    <div className="workspace-label">WORKSPACE</div>
    <nav className="nav" aria-label="Workspace">
      {items.map(item => <Link key={item.href} className={`nav-item ${pathname === item.href ? 'active' : ''}`} href={item.href} prefetch={false}>{item.label}<span>{item.icon}</span></Link>)}
    </nav>
    <div className="sidebar-footer"><div className="avatar">{userName.split(/\s+/).map(x=>x[0]).slice(0,2).join('')}</div><div><strong>{userName}</strong><span>admin</span></div></div>
  </aside>
}
