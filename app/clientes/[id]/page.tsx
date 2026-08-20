import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin'
import ClientProfileView from './ClientProfileView'
import ClientPageStyles from '../ClientPageStyles'

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireAdmin()

  const [{ data: client }, { data: family }, { data: alerts }, { data: accounts }, { data: docs }, { data: reviews }] = await Promise.all([
    supabase.from('clients').select('id,full_name,email,phone,cpf_cnpj,birth_date,postal_code,address,neighborhood,city,state,client_code,status,fee_type,fee_value,contract_status,suitability_status,suitability_profile,ips_status,last_meeting_at').eq('id',id).maybeSingle(),
    supabase.from('client_family_members').select('id,full_name,relationship,email,phone').eq('client_id',id).order('full_name'),
    supabase.from('client_alerts').select('id,title,due_at').eq('client_id',id).eq('status','open').order('due_at').limit(8),
    supabase.from('accounts').select('id,institution_id,account_type,masked_identifier,status').eq('client_id',id).order('institution_id'),
    supabase.from('documents').select('id,file_name,document_type,processing_status').eq('client_id',id).order('uploaded_at',{ascending:false}).limit(8),
    supabase.from('reviews').select('id,reason,severity,created_at').eq('client_id',id).eq('status','open').order('created_at',{ascending:false}),
  ])

  if (!client) notFound()
  return <><ClientPageStyles/><ClientProfileView client={client} family={family??[]} alerts={alerts??[]} accounts={accounts??[]} docs={docs??[]} reviews={reviews??[]}/></>
}
