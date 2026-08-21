import { requireAdmin } from '@/lib/auth/admin'
import AdminSidebar from '../AdminSidebar'
import ConsultantList from './ConsultantList'
import ConsultantPageStyles from './ConsultantPageStyles'

export default async function ConsultantsPage() {
  const { supabase, fullName } = await requireAdmin()
  const { data: consultants } = await supabase
    .from('users')
    .select('id,full_name,email,cpf,phone,birth_date,role,is_active,created_at')
    .eq('role','advisor')
    .eq('is_active',true)
    .order('full_name')

  return <main className="app-shell">
    <AdminSidebar userName={fullName}/>
    <section className="content">
      <ConsultantPageStyles />
      <ConsultantList initialConsultants={consultants ?? []}/>
    </section>
  </main>
}
