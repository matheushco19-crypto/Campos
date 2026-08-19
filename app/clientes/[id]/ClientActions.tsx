'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ClientActions({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function addMovement() {
    setSaving(true)
    setMessage('')
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setMessage('Sessão expirada.'); setSaving(false); return }
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', auth.user.id).single()
    if (!profile?.tenant_id) { setMessage('Tenant não encontrado.'); setSaving(false); return }
    const value = Number(amount.replace('.', '').replace(',', '.'))
    if (!description.trim() || !Number.isFinite(value) || value <= 0) { setMessage('Informe descrição e valor válidos.'); setSaving(false); return }
    const { error } = await supabase.from('transactions').insert({
      tenant_id: profile.tenant_id,
      client_id: clientId,
      transaction_date: date,
      posting_date: date,
      description_original: description.trim(),
      description_normalized: description.trim().toLowerCase(),
      amount: value,
      direction: 'debit',
      expense_nature: 'variável',
      is_active: true,
      extraction_confidence: 1,
      classification_confidence: 1,
      classification_source: 'manual',
      user_confirmed: true,
      parser_version: 'manual',
    })
    setSaving(false)
    if (error) { setMessage(error.message); return }
    setDescription(''); setAmount(''); setOpen(false); window.location.reload()
  }

  return <>
    <button className="primary-btn" onClick={() => setOpen(true)}>＋ Adicionar movimentação</button>
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><div className="modal-head"><div><p className="eyebrow">Nova movimentação</p><h2>Adicionar lançamento</h2></div><button className="icon-btn" onClick={() => setOpen(false)}>×</button></div><div className="form-grid"><label>Data<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>Valor<input inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} /></label><label className="full">Descrição<input placeholder="Ex.: Restaurante, supermercado..." value={description} onChange={e => setDescription(e.target.value)} /></label></div>{message && <p className="form-error">{message}</p>}<div className="modal-actions"><button className="secondary-btn" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-btn" disabled={saving} onClick={addMovement}>{saving ? 'Salvando...' : 'Salvar movimentação'}</button></div></div></div>}
  </>
}
