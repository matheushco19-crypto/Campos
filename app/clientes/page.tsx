import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientList from './ClientList'

export default async function ClientsPage(){
 const supabase=await createClient()
 const {data:auth}=await supabase.auth.getClaims()
 if(!auth?.claims?.sub)redirect('/login')
 const {data:user}=await supabase.from('users').select('full_name,role').eq('id',auth.claims.sub).maybeSingle()
 if(user?.role!=='admin')redirect('/')
 const [{data:clients},{data:consultants}]=await Promise.all([
  supabase.from('clients').select('id,full_name,email,cpf_cnpj,client_code,fee_type,fee_value,consultant_id,status,created_at').eq('status','active').order('full_name'),
  supabase.from('users').select('id,full_name,role').eq('is_active',true).in('role',['admin','consultor']).order('full_name')
 ])
 return <main className="content"><ClientList initialClients={clients??[]} consultants={consultants??[]}/></main>
}
