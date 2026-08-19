import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  const [{ data: client }, { data: accounts }, { data: documents }, { data: transactions }, { data: reviews }] = await Promise.all([
    supabase.from('clients').select('id,full_name,preferred_name,status,email,phone').eq('id', id).maybeSingle(),
    supabase.from('accounts').select('id,institution_id,account_type,masked_identifier,card_brand,card_product,status').eq('client_id', id).order('institution_id'),
    supabase.from('documents').select('id,file_name,document_type,processing_status,data_integrity_status,semantic_classification_status,period_start,period_end,uploaded_at').eq('client_id', id).order('uploaded_at', { ascending: false }),
    supabase.from('transactions').select('id,transaction_date,description_original,amount,direction,expense_nature,is_transfer,is_investment_flow,is_card_payment,classification_confidence').eq('client_id', id).eq('is_active', true).order('transaction_date', { ascending: false }).limit(30),
    supabase.from('reviews').select('id,reason,severity,status,created_at').eq('client_id', id).eq('status', 'open').order('created_at', { ascending: false }),
  ])

  if (!client) notFound()

  const totalCredits = (transactions ?? []).filter(t => t.direction === 'credit').reduce((s, t) => s + Number(t.amount), 0)
  const totalDebits = (transactions ?? []).filter(t => t.direction === 'debit').reduce((s, t) => s + Number(t.amount), 0)

  return (
    <main className="content client-page">
      <div className="detail-top"><div><Link href="/" className="back">← Visão geral</Link><p className="eyebrow">Dossiê financeiro</p><h1>{client.preferred_name || client.full_name}</h1><p className="muted">{client.status === 'active' ? 'Cliente ativo' : client.status}</p></div><span className="pill processed">{client.status}</span></div>

      <section className="metrics">
        <div className="metric-card"><span>Contas</span><strong>{accounts?.length ?? 0}</strong><small>instituições conectadas</small></div>
        <div className="metric-card"><span>Documentos</span><strong>{documents?.length ?? 0}</strong><small>no dossiê</small></div>
        <div className="metric-card"><span>Entradas</span><strong>{brl.format(totalCredits)}</strong><small>amostra carregada</small></div>
        <div className="metric-card"><span>Saídas</span><strong>{brl.format(totalDebits)}</strong><small>amostra carregada</small></div>
      </section>

      <section className="panel"><div className="panel-head"><div><h2>Contas e instituições</h2><p className="muted">Relacionamentos detectados a partir dos documentos importados.</p></div></div><div className="client-grid">{(accounts ?? []).map(a => <div className="client-card" key={a.id}><div className="client-avatar">{a.institution_id === 'nubank' ? 'N' : 'B'}</div><div><strong>{a.institution_id === 'nubank' ? 'Nubank' : 'BTG Pactual'}</strong><span>{a.account_type} · {a.masked_identifier || 'identificador protegido'}</span></div></div>)}</div></section>

      <section className="panel"><div className="panel-head"><div><h2>Documentos</h2><p className="muted">Fluxo de importação e integridade.</p></div></div><div className="table-wrap"><table><thead><tr><th>Documento</th><th>Período</th><th>Processamento</th><th>Integridade</th><th>Semântica</th></tr></thead><tbody>{(documents ?? []).map(d => <tr key={d.id}><td><strong>{d.file_name}</strong><small>{d.document_type}</small></td><td>{d.period_start && d.period_end ? `${new Date(d.period_start).toLocaleDateString('pt-BR')} – ${new Date(d.period_end).toLocaleDateString('pt-BR')}` : '—'}</td><td><span className={`pill ${d.processing_status}`}>{d.processing_status}</span></td><td><span className={`pill ${d.data_integrity_status}`}>{d.data_integrity_status}</span></td><td><span className={`pill ${d.semantic_classification_status}`}>{d.semantic_classification_status}</span></td></tr>)}</tbody></table></div></section>

      <section className="grid-2"><div className="panel"><div className="panel-head"><div><h2>Transações</h2><p className="muted">As 30 mais recentes da amostra ativa.</p></div></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Tipo</th><th>Conf.</th></tr></thead><tbody>{(transactions ?? []).map(t => <tr key={t.id}><td>{new Date(t.transaction_date).toLocaleDateString('pt-BR')}</td><td><strong>{t.description_original}</strong><small>{t.is_investment_flow ? 'fluxo de investimento' : t.is_card_payment ? 'pagamento de cartão' : t.is_transfer ? 'transferência' : t.expense_nature || '—'}</small></td><td className={t.direction === 'credit' ? 'positive' : 'negative'}>{t.direction === 'credit' ? '+' : '-'}{brl.format(Number(t.amount))}</td><td>{t.direction === 'credit' ? 'Entrada' : 'Saída'}</td><td>{Math.round(Number(t.classification_confidence || 0) * 100)}%</td></tr>)}</tbody></table></div></div>

        <div className="panel"><div className="panel-head"><div><h2>Pendências</h2><p className="muted">Validações que exigem atenção do assessor.</p></div></div>{(reviews ?? []).length === 0 ? <div className="empty">Nenhuma pendência aberta.</div> : <div className="review-list">{reviews?.map(r => <div className="review-item" key={r.id}><span className={`severity ${r.severity}`}>{r.severity}</span><div><strong>{r.reason}</strong><small>{new Date(r.created_at).toLocaleString('pt-BR')}</small></div></div>)}</div>}</div></section>
    </main>
  )
}
