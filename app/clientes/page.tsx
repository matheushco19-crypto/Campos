import { requireAdmin } from '@/lib/auth/admin'
import ClientList from './ClientList'
import AdminSidebar from '../AdminSidebar'
import ClientPageStyles from './ClientPageStyles'

export default async function ClientsPage() {
  const { supabase, fullName } = await requireAdmin()
  const [{ data: clients }, { data: consultants }] = await Promise.all([
    supabase.from('clients').select('id,full_name,email,cpf_cnpj,client_code,fee_type,fee_value,consultant_id,status,created_at').eq('status','active').order('full_name'),
    supabase.from('users').select('id,full_name,role').eq('is_active',true).in('role',['admin','advisor']).order('full_name'),
  ])
  return <main className="app-shell"><AdminSidebar userName={fullName}/><section className="content"><ClientPageStyles/><ClientList initialClients={clients??[]} consultants={consultants??[]}/></section></main>
}
