'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Consultant = { id:string; full_name:string|null; email:string; cpf:string|null; phone:string|null; birth_date:string|null; role:string; is_active:boolean; created_at:string }
const digits=(v:string)=>v.replace(/\D/g,'')
const cpfMask=(v:string)=>{const d=digits(v).slice(0,11);return d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')}
const phoneMask=(v:string)=>{const d=digits(v).slice(0,11);return d.length>10?d.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3'):d.replace(/(\d{2})(\d{4})(\d{4})/,'($1) $2-$3')}
const cpfEdge='https://mdfjzmztawyirstpfmpt.supabase.co/functions/v1/admin-consultants'

export default function ConsultantList({initialConsultants}:{initialConsultants:Consultant[]}) {
  const [consultants,setConsultants]=useState(initialConsultants)
  const [query,setQuery]=useState('')
  const [drawer,setDrawer]=useState(false)
  const [saving,setSaving]=useState(false)
  const [lookingUp,setLookingUp]=useState(false)
  const [verified,setVerified]=useState(false)
  const [message,setMessage]=useState('')
  const [form,setForm]=useState({cpf:'',birth_date:'',full_name:'',email:'',phone:''})
  const field=(k:string,v:string)=>setForm(p=>({...p,[k]:v}))
  const visible=useMemo(()=>consultants.filter(c=>{const q=query.trim().toLowerCase();return !q||String(c.full_name||'').toLowerCase().includes(q)||String(c.email||'').toLowerCase().includes(q)||String(c.cpf||'').includes(digits(q))}),[consultants,query])

  async function lookupCpf(){
    const cpf=digits(form.cpf)
    if(cpf.length!==11){setMessage('Informe um CPF com 11 dígitos.');setVerified(false);return}
    if(!form.birth_date){setMessage('Informe a data de nascimento para validar o CPF na Receita Federal.');setVerified(false);return}
    setLookingUp(true);setMessage('')
    try {
      const supabase=createClient(); const {data:{session}}=await supabase.auth.getSession(); if(!session) throw Error('Sessão expirada.')
      const r=await fetch(cpfEdge,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'lookup_cpf',cpf,birth_date:form.birth_date})})
      const d=await r.json(); if(!r.ok) throw Error(d.error||'Não foi possível consultar o CPF.')
      setForm(p=>({...p,cpf:d.cpf,full_name:d.full_name,birth_date:d.birth_date}))
      setVerified(true); setMessage(`CPF confirmado na base ${d.source || 'oficial'}.`)
    } catch(e){setVerified(false);setMessage(e instanceof Error?e.message:'Não foi possível consultar o CPF.')} finally {setLookingUp(false)}
  }

  async function createRecord(){
    if(!verified){setMessage('Consulte e confirme o CPF antes de criar o profissional.');return}
    if(!form.email.trim()||digits(form.phone).length<10){setMessage('E-mail e telefone válidos são obrigatórios.');return}
    setSaving(true);setMessage('')
    try {
      const supabase=createClient(); const {data:{session}}=await supabase.auth.getSession(); if(!session) throw Error('Sessão expirada.')
      const r=await fetch(cpfEdge,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'create_consultant',...form,cpf:digits(form.cpf),phone:digits(form.phone)})})
      const d=await r.json(); if(!r.ok) throw Error(d.error||'Não foi possível criar o consultor.')
      setConsultants(p=>[d.consultant,...p].sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'pt-BR')))
      setDrawer(false);setForm({cpf:'',birth_date:'',full_name:'',email:'',phone:''});setVerified(false);setMessage('')
    } catch(e){setMessage(e instanceof Error?e.message:'Não foi possível criar o consultor.')} finally {setSaving(false)}
  }

  return <div className="admin-page consultant-page">
    <header className="page-header"><div><p className="eyebrow">Workspace · Administração</p><h1>Consultores</h1><p className="muted">Gerencie os Advisors que terão acesso aos clientes do workspace.</p></div><div className="client-toolbar"><div className="search-box">⌕<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar profissional..."/></div><button className="primary-btn" onClick={()=>{setMessage('');setDrawer(true)}}>＋ Adicionar Consultor</button></div></header>
    {message&&!drawer&&<div className="form-message error">{message}</div>}
    {visible.length===0?<section className="empty-page"><div className="empty-illustration">A</div><h2>{consultants.length===0?'Nenhum consultor cadastrado':'Nenhum profissional encontrado'}</h2><p>{consultants.length===0?'Adicione os Advisors do time para poder atribuí-los aos clientes.':'Ajuste sua pesquisa para encontrar um profissional.'}</p>{consultants.length===0&&<button className="primary-btn" onClick={()=>setDrawer(true)}>＋ Adicionar Consultor</button>}</section>:<section className="panel client-table-panel"><div className="table-wrap"><table className="client-table"><thead><tr><th>Profissional</th><th>CPF</th><th>Telefone</th><th>E-mail</th><th>Acesso</th></tr></thead><tbody>{visible.map(c=><tr key={c.id}><td><div className="client-name-cell"><span className="table-avatar">{String(c.full_name||'A').split(/\s+/).map(n=>n[0]).slice(0,2).join('')}</span><span><strong>{c.full_name}</strong><small>Advisor</small></span></div></td><td>{cpfMask(c.cpf||'')}</td><td>{phoneMask(c.phone||'')}</td><td>{c.email}</td><td><span className="contract-status active"><i/> Ativo</span></td></tr>)}</tbody></table></div></section>}
    {drawer&&<div className="drawer-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setDrawer(false)}}><aside className="client-drawer consultant-drawer" role="dialog" aria-modal="true"><div className="drawer-header"><div><p className="eyebrow">Cadastro de equipe</p><h2>Novo consultor</h2><p className="muted">O profissional receberá um convite para acessar o Campos.</p></div><button className="icon-btn" onClick={()=>!saving&&setDrawer(false)}>×</button></div><div className="drawer-section"><div className="drawer-section-title"><span>⌃</span> Identificação</div><div className="drawer-grid"><label>CPF*<div className="input-with-action"><input value={cpfMask(form.cpf)} onChange={e=>{field('cpf',digits(e.target.value));setVerified(false)}} placeholder="000.000.000-00"/><button type="button" onClick={lookupCpf} disabled={lookingUp}>{lookingUp?'Consultando...':'Validar'}</button></div></label><label>Data de Nascimento*<input type="date" value={form.birth_date} onChange={e=>{field('birth_date',e.target.value);setVerified(false)}}/></label><label className="full">Nome Completo*<input value={form.full_name} readOnly className="readonly" placeholder="Preenchido após validação do CPF"/></label></div>{verified&&<div className="verified-badge">✓ CPF confirmado na Receita Federal/SERPRO</div>}</div><div className="drawer-section"><div className="drawer-section-title"><span>⌃</span> Contato e acesso</div><div className="drawer-grid"><label>E-mail*<input type="email" value={form.email} onChange={e=>field('email',e.target.value)} placeholder="profissional@empresa.com"/></label><label>Telefone*<input value={phoneMask(form.phone)} onChange={e=>field('phone',digits(e.target.value))} placeholder="(00) 00000-0000"/></label></div></div>{message&&<div className="form-message error">{message}</div>}<div className="drawer-footer"><button className="secondary-btn" disabled={saving} onClick={()=>setDrawer(false)}>Cancelar</button><button className="primary-btn" disabled={saving||!verified} onClick={createRecord}>{saving?'Criando...':'Criar consultor'}</button></div></aside></div>}
  </div>
}
