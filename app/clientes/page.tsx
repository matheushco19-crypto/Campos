import {redirect} from 'next/navigation'
import {createClient} from '@/lib/supabase/server'
import ClientList from './ClientList'
import AdminSidebar from '../AdminSidebar'
export default async function ClientsPage(){const s=await createClient();const {data:a}=await s.auth.getClaims();if(!a?.claims?.sub)redirect('/login');const {data:u}=await s.from('users').select('full_name,role').eq('id',a.claims.sub).maybeSingle();if(u?.role!=='admin')redirect('/');const [{data:clients},{data:consultants}]=await Promise.all([s.from('clients').select('id,full_name,email,cpf_cnpj,client_code,fee_type,fee_value,consultant_id,status,created_at').eq('status','active').order('full_name'),s.from('users').select('id,full_name,role').eq('is_active',true).in('role',['admin','consultor']).order('full_name')]);return <main className="app-shell"><AdminSidebar userName={u?.full_name||'Admin'}/><section className="content"><ClientList initialClients={clients??[]} consultants={consultants??[]}/></section></main>}
