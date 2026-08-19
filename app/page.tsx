import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function HomePage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  const [{ data: user }, { data: clients }, { data: documents }, { data: reviews }, { data: summary }] = await Promise.all([
    supabase.from('users').select('full_name,role').eq('id', auth.claims.sub).maybeSingle(),
    supabase.from('clients').select('id,full_name,preferred_name,status,updated_at').order('updated_at', { ascending: false }),
    supabase.from('documents').select('id,file_name,document_type,processing_status,data_integrity_status,semantic_classification_status,period_start,period_end,uploaded_at,institution_id').order('uploaded_at', { ascending: false }).limit(8),
    supabase.from('reviews').select('id,reason,severity,status,created_at,client_id').eq('status', 'open').order('created_at', { ascending: false }).limit(8),
    supabase.from('vw_monthly_financial_summary').select('month,total_income,total_expenses,savings_capacity').order('month', { ascending: false }).limit(6),
  ])

  const clientCount = clients?.length ?? 0
  const openReviews = reviews?.length ?? 0
  const processedDocs = documents?.filter((d) => d.processing_status === 'processed').length ?? 0
  const latest = summary?.[0]

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">C</div><div><strong>Campos</strong><span>Wealth OS</span></div></div>
        <nav className="nav">
          <Link className="nav-item active" href="/">Visão geral</Link>
          <a className="nav-item" href="#clientes">Clientes</a>
          <a className="nav-item" href="#documentos">Documentos</a>
          <a className="nav-item" href="#revisoes">Revisões</a>
          <a className="nav-item" href="#financeiro">Financeiro</a>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{(user?.full_name ?? 'M').slice(0, 1).toUpperCase()}</div>
          <div><strong>{user?.full_name ?? 'Usuário'}</strong><span>{user?.role ?? 'admin'}</span></div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">Campos Wealth OS</p><h1>Gestão Financeira</h1><p className="muted">Uma visão operacional do patrimônio, documentos e fluxo financeiro.</p></div>
          <div className="topbar-actions"><span className="status-dot"><i /> Sistema online</span><Link className="primary-btn" href="#documentos">Importar documento</Link></div>
        </header>

        <section className="metrics">
          <div className="metric-card"><span>Clientes ativos</span><strong>{clientCount}</strong><small>na carteira atual</small></div>
          <div className="metric-card"><span>Documentos processados</span><strong>{processedDocs}</strong><small>últimos documentos</small></div>
          <div className={`metric-card ${openReviews ? 'warning' : ''}`}><span>Revisões abertas</span><strong>{openReviews}</strong><small>{openReviews ? 'atenção necessária' : 'nenhuma pendência'}</small></div>
          <div className="metric-card"><span>Saldo de poupança</span><strong>{latest ? brl.format(Number(latest.savings_capacity ?? 0)) : '—'}</strong><small>mês mais recente</small></div>
        </section>

        <section className="grid-2" id="financeiro">
          <div className="panel"><div className="panel-head"><div><h2>Fluxo mensal</h2><p className="muted">Receitas, despesas e capacidade de poupança.</p></div></div>
            <div className="table-wrap"><table><thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Poupança</th></tr></thead><tbody>
              {(summary ?? []).map((row) => <tr key={row.month}><td>{new Date(row.month as string).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</td><td className="positive">{brl.format(Number(row.total_income ?? 0))}</td><td>{brl.format(Number(row.total_expenses ?? 0))}</td><td className={Number(row.savings_capacity ?? 0) >= 0 ? 'positive' : 'negative'}>{brl.format(Number(row.savings_capacity ?? 0))}</td></tr>)}
            </tbody></table></div>
          </div>

          <div className="panel" id="revisoes"><div className="panel-head"><div><h2>Central de revisão</h2><p className="muted">Itens que precisam de validação humana.</p></div></div>
            {(reviews ?? []).length === 0 ? <div className="empty">Nenhuma revisão aberta.</div> : <div className="review-list">{reviews?.map((review) => <div className="review-item" key={review.id}><span className={`severity ${review.severity}`}>{review.severity}</span><div><strong>{review.reason}</strong><small>{new Date(review.created_at as string).toLocaleString('pt-BR')}</small></div></div>)}</div>}
          </div>
        </section>

        <section className="panel" id="clientes"><div className="panel-head"><div><h2>Clientes</h2><p className="muted">Acesso rápido aos dossiês financeiros.</p></div><span className="counter">{clientCount}</span></div>
          <div className="client-grid">{(clients ?? []).map((client) => <Link href={`/clientes/${client.id}`} className="client-card" key={client.id}><div className="client-avatar">{client.full_name.slice(0, 1).toUpperCase()}</div><div><strong>{client.preferred_name || client.full_name}</strong><span>{client.status === 'active' ? 'Ativo' : client.status}</span></div><b>›</b></Link>)}</div>
        </section>

        <section className="panel" id="documentos"><div className="panel-head"><div><h2>Documentos recentes</h2><p className="muted">Status do parsing e integridade de dados.</p></div><span className="counter">{documents?.length ?? 0}</span></div>
          <div className="table-wrap"><table><thead><tr><th>Documento</th><th>Instituição</th><th>Período</th><th>Processamento</th><th>Integridade</th></tr></thead><tbody>
            {(documents ?? []).map((doc) => <tr key={doc.id}><td><strong>{doc.file_name ?? 'Documento'}</strong><small>{doc.document_type}</small></td><td>{doc.institution_id ?? '—'}</td><td>{doc.period_start && doc.period_end ? `${new Date(doc.period_start).toLocaleDateString('pt-BR')} – ${new Date(doc.period_end).toLocaleDateString('pt-BR')}` : '—'}</td><td><span className={`pill ${doc.processing_status}`}>{doc.processing_status}</span></td><td><span className={`pill ${doc.data_integrity_status}`}>{doc.data_integrity_status}</span></td></tr>)}
          </tbody></table></div>
        </section>
      </section>
    </main>
  )
}
