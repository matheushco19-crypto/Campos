'use client'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
export default function AdminSidebar({userName='Admin'}:{userName?:string}){
 const pathname=usePathname()
 const item=(href:string,label:string,icon:string)=><Link className={`nav-item ${pathname===href?'active':''}`} href={href}>{label}<span>{icon}</span></Link>
 return <aside className="sidebar"><div className="brand"><div className="brand-mark">C</div><div><strong>Campos</strong><span>Wealth OS</span></div></div><div className="workspace-label">WORKSPACE</div><nav className="nav" aria-label="Workspace">{item('/','Visão geral','⌂')}{item('/clientes','Clientes','→')}{item('/documentos','Documentos','⌁')}{item('/revisoes','Revisões','0')}{item('/gestao-financeira','Gestão Financeira','↗')}</nav><div className="sidebar-section">PLATAFORMA</div><nav className="nav compact"><Link className="nav-item" href="/objetivos">Objetivos <span>○</span></Link><Link className="nav-item" href="/investimentos">Investimentos <span>◇</span></Link><Link className="nav-item" href="/configuracoes">Configurações <span>⚙</span></Link></nav><div className="sidebar-footer"><div className="avatar">{userName.split(/\s+/).map(x=>x[0]).slice(0,2).join('')}</div><div><strong>{userName}</strong><span>admin</span></div></div></aside>
}
