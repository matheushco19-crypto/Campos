'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Client = { id: string; full_name: string; preferred_name: string | null; status: string }

type Mode = 'movement' | 'pdf' | null

function parseAmount(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(/R\$/gi, '')
  if (normalized.includes(',')) return Number(normalized.replace(/\./g, '').replace(',', '.'))
  return Number(normalized)
}

async function sha256(file: File) {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function DashboardActions({ clients }: { clients: Client[] }) {
  const [mode, setMode] = useState<Mode>(null)
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!clientId && clients[0]) setClientId(clients[0].id)
  }, [clientId, clients])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMode(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function open(nextMode: Exclude<Mode, null>) {
    setMessage('')
    setSuccess(false)
    setMode(nextMode)
  }

  function close() {
    if (saving) return
    setMode(null)
    setMessage('')
    setSuccess(false)
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function addMovement() {
    setSaving(true)
    setMessage('')
    setSuccess(false)
    try {
      if (!clientId) throw new Error('Selecione um cliente.')
      if (!description.trim()) throw new Error('Informe uma descrição.')
      const value = parseAmount(amount)
      if (!Number.isFinite(value) || value <= 0) throw new Error('Informe um valor válido.')

      const supabase = createClient()
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error('Sessão expirada. Faça login novamente.')
      const { data: profile, error: profileError } = await supabase.from('users').select('tenant_id').eq('id', auth.user.id).single()
      if (profileError || !profile?.tenant_id) throw new Error('Não foi possível identificar o tenant da sessão.')

      const { error } = await supabase.from('transactions').insert({
        tenant_id: profile.tenant_id,
        client_id: clientId,
        transaction_date: date,
        posting_date: date,
        description_original: description.trim(),
        description_normalized: description.trim().toLowerCase(),
        amount: value,
        direction,
        expense_nature: direction === 'debit' ? 'variable' : 'na',
        is_active: true,
        extraction_confidence: 1,
        classification_confidence: 1,
        classification_source: 'manual',
        user_confirmed: true,
        parser_version: 'manual',
      })
      if (error) throw new Error(error.message)

      setSuccess(true)
      setMessage('Movimentação adicionada com sucesso.')
      setDescription('')
      setAmount('')
      setTimeout(() => window.location.reload(), 700)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a movimentação.')
    } finally {
      setSaving(false)
    }
  }

  async function importPdf() {
    setSaving(true)
    setMessage('')
    setSuccess(false)
    try {
      if (!clientId) throw new Error('Selecione um cliente.')
      if (!file) throw new Error('Selecione um PDF.')
      if (file.type !== 'application/pdf') throw new Error('Somente arquivos PDF são aceitos.')
      if (file.size <= 0 || file.size > 50 * 1024 * 1024) throw new Error('O PDF deve ter até 50 MB.')

      const supabase = createClient()
      const hash = await sha256(file)
      const { data, error } = await supabase.functions.invoke('secure-document-upload', {
        body: { client_id: clientId, file_name: file.name, content_type: file.type, size: file.size, sha256: hash },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error === 'duplicate_document' ? 'Este documento já foi importado.' : data.error)
      if (!data?.document?.id || !data.path || !data.token) throw new Error('O servidor não retornou os dados de upload esperados.')

      const { error: uploadError } = await supabase.storage.from('client-documents').uploadToSignedUrl(data.path, data.token, file)
      if (uploadError) throw new Error(uploadError.message)

      setMessage('PDF enviado. Processando extrato...')
      const { data: processed, error: processError } = await supabase.functions.invoke('document-process', { body: { document_id: data.document.id } })
      if (processError) throw new Error(processError.message)
      if (processed?.error) throw new Error(processed.detail || processed.error)

      setSuccess(true)
      setMessage(processed?.status === 'review_required'
        ? 'PDF processado, mas a reconciliação exige revisão.'
        : `PDF processado com sucesso. ${processed?.transactions ?? 0} movimentações identificadas.`)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setTimeout(() => window.location.reload(), 1200)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível importar o PDF.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="topbar-actions">
        <button className="secondary-btn" type="button" onClick={() => open('pdf')}>Importar documento</button>
        <button className="primary-btn" type="button" onClick={() => open('movement')}>＋ Adicionar movimentação</button>
      </div>

      {mode && (
        <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
          <div className="modal dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-modal-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow">{mode === 'movement' ? 'Lançamento manual' : 'Ingestão de documento'}</p>
                <h2 id="dashboard-modal-title">{mode === 'movement' ? 'Adicionar movimentação' : 'Importar documento'}</h2>
                <p className="muted">{mode === 'movement' ? 'Registre uma entrada ou saída que não veio de um extrato.' : 'Envie um extrato BTG em PDF para o parser financeiro.'}</p>
              </div>
              <button className="icon-btn" type="button" onClick={close} aria-label="Fechar">×</button>
            </div>

            <div className="form-grid">
              <label className="full">Cliente
                <select value={clientId} onChange={event => setClientId(event.target.value)} disabled={saving}>
                  <option value="">Selecione...</option>
                  {clients.map(client => <option key={client.id} value={client.id}>{client.preferred_name || client.full_name}</option>)}
                </select>
              </label>

              {mode === 'movement' ? (
                <>
                  <label>Data<input type="date" value={date} onChange={event => setDate(event.target.value)} disabled={saving} /></label>
                  <label>Tipo<select value={direction} onChange={event => setDirection(event.target.value as 'debit' | 'credit')} disabled={saving}><option value="debit">Saída / despesa</option><option value="credit">Entrada / receita</option></select></label>
                  <label>Valor<input inputMode="decimal" placeholder="R$ 0,00" value={amount} onChange={event => setAmount(event.target.value)} disabled={saving} /></label>
                  <label className="full">Descrição<input placeholder="Ex.: Restaurante, supermercado, honorários..." value={description} onChange={event => setDescription(event.target.value)} disabled={saving} /></label>
                </>
              ) : (
                <label className="full">Arquivo PDF
                  <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={event => setFile(event.target.files?.[0] ?? null)} disabled={saving} />
                </label>
              )}
            </div>

            {file && mode === 'pdf' && <div className="file-selected"><span>{file.name}</span><span>{(file.size / 1024 / 1024).toFixed(2)} MB</span></div>}
            {message && <div className={`form-message ${success ? 'success' : 'error'}`} role="status">{message}</div>}

            <div className="modal-actions">
              <button className="secondary-btn" type="button" onClick={close} disabled={saving}>Cancelar</button>
              {mode === 'movement' ? (
                <button className="primary-btn" type="button" onClick={addMovement} disabled={saving}>{saving ? 'Salvando...' : 'Salvar movimentação'}</button>
              ) : (
                <button className="primary-btn" type="button" onClick={importPdf} disabled={saving || !file}>{saving ? 'Processando...' : 'Enviar e processar PDF'}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
