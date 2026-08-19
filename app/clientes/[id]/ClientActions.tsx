'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

async function sha256(file: File) {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function ClientActions({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function addMovement() {
    setSaving(true); setMessage('')
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setMessage('Sessão expirada.'); setSaving(false); return }
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', auth.user.id).single()
    if (!profile?.tenant_id) { setMessage('Tenant não encontrado.'); setSaving(false); return }
    const value = Number(amount.replace('.', '').replace(',', '.'))
    if (!description.trim() || !Number.isFinite(value) || value <= 0) { setMessage('Informe descrição e valor válidos.'); setSaving(false); return }
    const { error } = await supabase.from('transactions').insert({ tenant_id: profile.tenant_id, client_id: clientId, transaction_date: date, posting_date: date, description_original: description.trim(), description_normalized: description.trim().toLowerCase(), amount: value, direction: 'debit', expense_nature: 'variável', is_active: true, extraction_confidence: 1, classification_confidence: 1, classification_source: 'manual', user_confirmed: true, parser_version: 'manual' })
    setSaving(false)
    if (error) { setMessage(error.message); return }
    setDescription(''); setAmount(''); setOpen(false); window.location.reload()
  }

  async function importPdf() {
    setSaving(true); setMessage('')
    try {
      if (!file) { setMessage('Selecione um PDF.'); return }
      if (file.type !== 'application/pdf') { setMessage('Somente arquivos PDF são aceitos.'); return }
      if (file.size > 50 * 1024 * 1024) { setMessage('O arquivo ultrapassa o limite de 50 MB.'); return }
      const supabase = createClient()
      const hash = await sha256(file)
      const { data, error } = await supabase.functions.invoke('secure-document-upload', { body: { client_id: clientId, file_name: file.name, content_type: file.type, size: file.size, sha256: hash } })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error === 'duplicate_document' ? 'Este documento já foi importado.' : data.error)
      const { error: uploadError } = await supabase.storage.from('client-documents').uploadToSignedUrl(data.path, data.token, file)
      if (uploadError) throw uploadError
      const { error: processError } = await supabase.functions.invoke('document-process', { body: { document_id: data.document.id } })
      if (processError) throw processError
      setMessage('PDF recebido com segurança e colocado na fila de processamento.')
      setFile(null); if (inputRef.current) inputRef.current.value = ''
      setTimeout(() => window.location.reload(), 900)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível importar o PDF.')
    } finally { setSaving(false) }
  }

  return <>
    <div className="action-row"><button className="primary-btn" onClick={() => setOpen(true)}>＋ Adicionar movimentação</button></div>
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><div className="modal-head"><div><p className="eyebrow">Nova movimentação</p><h2>Adicionar lançamento</h2></div><button className="icon-btn" onClick={() => setOpen(false)}>×</button></div><div className="form-grid"><label>Data<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>Valor<input inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} /></label><label className="full">Descrição<input placeholder="Ex.: Restaurante, supermercado..." value={description} onChange={e => setDescription(e.target.value)} /></label></div>{message && <p className="form-error">{message}</p>}<div className="modal-actions"><button className="secondary-btn" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-btn" disabled={saving} onClick={addMovement}>{saving ? 'Salvando...' : 'Salvar movimentação'}</button></div><div className="import-divider"><span>ou</span></div><div className="pdf-import"><div><strong>Importar PDF</strong><small>Extrato ou fatura · até 50 MB · armazenamento privado</small></div><input ref={inputRef} type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />{file && <div className="file-selected">{file.name}<span>{(file.size / 1024 / 1024).toFixed(2)} MB</span></div>}<button className="secondary-btn" disabled={!file || saving} onClick={importPdf}>{saving ? 'Enviando...' : 'Enviar e processar PDF'}</button></div></div></div>}
  </>
}
