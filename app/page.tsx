import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin'
import AdminSidebar from './AdminSidebar'
import DashboardActions from './DashboardActions'
import OpenPdfButton from './OpenPdfButton'

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase()
}

export default async function HomePage() {
  const { supabase, fullName } = await requireAdmin()

  const [{ data: clients }, { data: docs }, { data: reviews }] = await Promise.all([
    supabase.from('clients').select('id,full_name,preferred_name,status,updated_at').eq('status','active').order('updated_at',{ascending:false}),
    supabase.from('documents').select('id,file_name,processing_status,data_integrity_status,uploaded_at').order('uploaded_at',{ascending:false}).limit(6),
    supabase.from('reviews').select('id,reason,severity,created_at').eq('status','open').order('created_at',{ascending:false}).limit(6),
  ])

  return <main className="app-shell">
    <AdminSidebar userName={fullName}/>
    <section className="content">
      <header className="topbar">
        <div><p className="eyebrow">Workspace · Administração</p><h1>Visão geral</h1><p className="muted">Uma visão rápida da operação, dos clientes e da qualidade da base.</p></div>
        <div className="topbar-actions"><Link className="secondary-btn" href="/clientes" prefetch={false}>Clientes</Link><Link className="secondary-btn" href="/gestao-financeira" prefetch={false}>Gestão Financeira</Link><DashboardActions clients={clients ?? []}/></div>
      </header>
      <section className="period-bar"><div><span>Base operacional</span><strong>Dados atuais do workspace</strong></div><div className="period-summary"><span>Clientes ativos</span><strong>{clients?.length || 0}</strong></div></section>
      <section className="metrics"><div className="metric-card accent"><span>Clientes ativos</span><strong>{clients?.length || 0}</strong><small>base atendida</small></div><div className="metric-card"><span>Documentos recentes</span><strong>{docs?.length || 0}</strong><small>últimos documentos</small></div><div className="metric-card"><span>Revisões abertas</span><strong>{reviews?.length || 0}</strong><small>{reviews?.length ? 'itens para validação' : 'base limpa'}</small></div></section>
      <section className="content-grid">
        <div className="panel"><div className="panel-head"><div><h2>Clientes recentes</h2><p className="muted">Acesso rápido aos dossiês.</p></div><Link className="text-btn" href="/clientes" prefetch={false}>Ver todos →</Link></div>{clients?.length ? <div className="client-grid">{clients.slice(0,6).map(c => <Link className="client-card" href={`/clientes/${c.id}`} prefetch={false} key={c.id}><div className="client-avatar">{initials(c.full_name)}</div><div><strong>{c.preferred_name || c.full_name}</strong><span>Ativo</span></div><b>›</b></Link>)}</div> : <div className="empty"><strong>Você não tem clientes ativos no momento.</strong><span>Adicione seu primeiro cliente para começar.</span><Link className="primary-btn" href="/clientes" prefetch={false}>Adicionar cliente</Link></div>}</div>
        <div className="panel"><div className="panel-head"><div><h2>Central de revisão</h2><p className="muted">Itens que precisam de validação.</p></div><span className="counter">{reviews?.length || 0}</span></div>{reviews?.length ? <div className="review-list">{reviews.map(r => <div className="review-item" key={r.id}><span className={`severity ${r.severity}`}>{r.severity}</span><div><strong>{r.reason}</strong><small>{new Date(r.created_at).toLocaleString('pt-BR')}</small></div></div>)}</div> : <div className="empty"><div className="empty-icon">✓</div><strong>Base limpa</strong><span>Nenhuma revisão aberta no momento.</span></div>}</div>
      </section>
      <section className="panel" id="documentos"><div className="panel-head"><div><h2>Documentos recentes</h2><p className="muted">Parsing, integridade e origem dos dados.</p></div><OpenPdfButton/></div><div className="table-wrap"><table><thead><tr><th>Documento</th><th>Processamento</th><th>Integridade</th></tr></thead><tbody>{docs?.map(d => <tr key={d.id}><td><strong>{d.file_name || 'Documento'}</strong><small>{new Date(d.uploaded_at).toLocaleString('pt-BR')}</small></td><td><span className={`pill ${d.processing_status}`}>{d.processing_status}</span></td><td><span className={`pill ${d.data_integrity_status}`}>{d.data_integrity_status}</span></td></tr>)}{!docs?.length && <tr><td colSpan={3} className="table-empty">Nenhum documento importado.</td></tr>}</tbody></table></div></section>
    </section>
  </main>
}
