-- Wealth OS / Supabase hardening migration 1.1
-- Auth profile linkage, private storage bucket, hardened RLS, security-invoker views.
-- IMPORTANT: This migration was already executed manually in the production SQL Editor on 2026-08-19.
-- Do NOT execute it again. Register it as applied in migration history before using `supabase db push`.

create schema if not exists private;

alter table public.users alter column tenant_id drop not null;
alter table public.users alter column role set default 'client';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_id_auth_users_fkey') then
    alter table public.users add constraint users_id_auth_users_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

create or replace function private.current_tenant_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.tenant_id from public.users u where u.id = (select auth.uid()) limit 1;
$$;

create or replace function private.current_user_role() returns text
language sql stable security definer set search_path = '' as $$
  select u.role from public.users u where u.id = (select auth.uid()) limit 1;
$$;

create or replace function private.is_tenant_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select u.tenant_id is not null from public.users u where u.id=(select auth.uid()) limit 1)
    and
    (select u.role in ('admin','advisor','analyst') from public.users u where u.id=(select auth.uid()) limit 1),
    false
  );
$$;

create or replace function private.client_user_has_access(p_client_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_client_access uca
    join public.clients c on c.id = uca.client_id and c.tenant_id = uca.tenant_id
    where uca.user_id = (select auth.uid())
      and uca.client_id = p_client_id
      and uca.tenant_id = (select private.current_tenant_id())
  );
$$;

do $$ begin
  execute 'revoke execute on function private.current_tenant_id() from public, anon, authenticated';
  execute 'revoke execute on function private.current_user_role() from public, anon, authenticated';
  execute 'revoke execute on function private.is_tenant_staff() from public, anon, authenticated';
  execute 'revoke execute on function private.client_user_has_access(uuid) from public, anon, authenticated';
end $$;

revoke execute on function public.current_tenant_id() from public, anon, authenticated;
revoke execute on function public.current_user_role() from public, anon, authenticated;
revoke execute on function public.is_tenant_staff() from public, anon, authenticated;
revoke execute on function public.client_user_has_access(uuid) from public, anon, authenticated;

create or replace function private.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, tenant_id, email, full_name, role)
  values (
    new.id,
    nullif(new.raw_app_meta_data ->> 'tenant_id','')::uuid,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case
      when new.raw_app_meta_data ->> 'role' in ('admin','advisor','analyst','client')
        then new.raw_app_meta_data ->> 'role'
      else 'client'
    end
  )
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure private.handle_new_auth_user();

alter table public.documents add column if not exists storage_bucket text not null default 'client-documents';
alter table public.documents add column if not exists storage_path text;
alter table public.documents add column if not exists content_type text;
alter table public.documents add column if not exists file_size_bytes bigint;
alter table public.documents add column if not exists storage_uploaded_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-documents','client-documents',false,52428800,ARRAY['application/pdf']::text[])
on conflict (id) do update set name=excluded.name, public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.storage_client_can_access_path(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.client_user_has_access((storage.foldername(p_path))[2]::uuid);
$$;
revoke execute on function private.storage_client_can_access_path(text) from public, anon, authenticated;

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy wealth_storage_staff_select on storage.objects for select to authenticated using (
  bucket_id='client-documents' and (select private.is_tenant_staff())
  and (storage.foldername(name))[1]=(select private.current_tenant_id())::text
);
create policy wealth_storage_client_select on storage.objects for select to authenticated using (
  bucket_id='client-documents' and not (select private.is_tenant_staff())
  and private.storage_client_can_access_path(name)
);
create policy wealth_storage_staff_insert on storage.objects for insert to authenticated with check (
  bucket_id='client-documents' and (select private.is_tenant_staff())
  and storage.extension(name)='pdf'
  and (storage.foldername(name))[1]=(select private.current_tenant_id())::text
);
create policy wealth_storage_client_insert on storage.objects for insert to authenticated with check (
  bucket_id='client-documents' and not (select private.is_tenant_staff())
  and storage.extension(name)='pdf' and private.storage_client_can_access_path(name)
);
create policy wealth_storage_staff_update on storage.objects for update to authenticated using (
  bucket_id='client-documents' and (select private.is_tenant_staff())
  and (storage.foldername(name))[1]=(select private.current_tenant_id())::text
) with check (
  bucket_id='client-documents' and (select private.is_tenant_staff())
  and storage.extension(name)='pdf' and (storage.foldername(name))[1]=(select private.current_tenant_id())::text
);
create policy wealth_storage_client_update on storage.objects for update to authenticated using (
  bucket_id='client-documents' and not (select private.is_tenant_staff())
  and private.storage_client_can_access_path(name)
) with check (
  bucket_id='client-documents' and not (select private.is_tenant_staff())
  and storage.extension(name)='pdf' and private.storage_client_can_access_path(name)
);
create policy wealth_storage_staff_delete on storage.objects for delete to authenticated using (
  bucket_id='client-documents' and (select private.is_tenant_staff())
  and (storage.foldername(name))[1]=(select private.current_tenant_id())::text
);
create policy wealth_storage_client_delete on storage.objects for delete to authenticated using (
  bucket_id='client-documents' and not (select private.is_tenant_staff())
  and private.storage_client_can_access_path(name)
);

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated;
grant all on all sequences in schema public to service_role;

-- Existing public RLS policies are replaced by tenant/client-aware policies.
do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' and tablename in (
    'tenants','users','clients','family_groups','family_group_members','user_client_access','institutions','accounts','documents','parser_runs','categories','transactions','transaction_links','recurring_patterns','subscriptions','classification_rules','classification_memory','reviews','audit_events','budgets','budget_generation_runs','financial_goals'
  ) loop
    execute format('drop policy if exists %I on public.%I',r.policyname,r.tablename);
  end loop;
end $$;

create policy tenant_select_self on public.tenants for select to authenticated using (id=(select private.current_tenant_id()));
create policy tenant_manage_staff on public.tenants for all to authenticated using (id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy users_select_same_tenant on public.users for select to authenticated using (tenant_id=(select private.current_tenant_id()) and ((select private.is_tenant_staff()) or id=(select auth.uid())));
create policy users_manage_staff on public.users for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy clients_staff_all on public.clients for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy clients_read_assigned on public.clients for select to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(id)));
create policy family_groups_staff_all on public.family_groups for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy family_groups_client_read on public.family_groups for select to authenticated using (tenant_id=(select private.current_tenant_id()) and exists(select 1 from public.family_group_members fgm where fgm.family_group_id=family_groups.id and (select private.client_user_has_access(fgm.client_id))));
create policy family_members_staff_all on public.family_group_members for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy family_members_client_read on public.family_group_members for select to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy access_select on public.user_client_access for select to authenticated using (tenant_id=(select private.current_tenant_id()) and ((select private.is_tenant_staff()) or user_id=(select auth.uid())));
create policy access_manage_staff on public.user_client_access for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy institutions_read on public.institutions for select to authenticated using (true);
create policy institutions_admin_write on public.institutions for all to authenticated using ((select private.current_user_role())='admin' and (select private.current_tenant_id()) is not null) with check ((select private.current_user_role())='admin' and (select private.current_tenant_id()) is not null);
create policy accounts_staff_all on public.accounts for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy accounts_client_all on public.accounts for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id))) with check (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy documents_staff_all on public.documents for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy documents_client_all on public.documents for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id))) with check (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy parser_runs_staff_all on public.parser_runs for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy parser_runs_client_read on public.parser_runs for select to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy categories_read on public.categories for select to authenticated using (tenant_id is null or tenant_id=(select private.current_tenant_id()));
create policy categories_tenant_write on public.categories for insert to authenticated with check (tenant_id=(select private.current_tenant_id()) and not is_system and (select private.is_tenant_staff()));
create policy categories_tenant_update on public.categories for update to authenticated using (tenant_id=(select private.current_tenant_id()) and not is_system and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and not is_system and (select private.is_tenant_staff()));
create policy categories_tenant_delete on public.categories for delete to authenticated using (tenant_id=(select private.current_tenant_id()) and not is_system and (select private.is_tenant_staff()));
create policy transactions_staff_all on public.transactions for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy transactions_client_all on public.transactions for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id))) with check (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy links_staff_all on public.transaction_links for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy links_client_all on public.transaction_links for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id))) with check (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy recurring_staff_all on public.recurring_patterns for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy recurring_client_all on public.recurring_patterns for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id))) with check (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy subscriptions_staff_all on public.subscriptions for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy subscriptions_client_all on public.subscriptions for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id))) with check (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy rules_staff_all on public.classification_rules for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy rules_client_read on public.classification_rules for select to authenticated using (tenant_id=(select private.current_tenant_id()) and client_id is not null and (select private.client_user_has_access(client_id)));
create policy memory_staff_all on public.classification_memory for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy memory_client_read on public.classification_memory for select to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy reviews_staff_all on public.reviews for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy reviews_client_read on public.reviews for select to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy audit_staff_read on public.audit_events for select to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy audit_authenticated_insert on public.audit_events for insert to authenticated with check (tenant_id=(select private.current_tenant_id()));
create policy budgets_staff_all on public.budgets for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy budgets_client_all on public.budgets for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id))) with check (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy budget_runs_staff_all on public.budget_generation_runs for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy budget_runs_client_read on public.budget_generation_runs for select to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));
create policy goals_staff_all on public.financial_goals for all to authenticated using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff())) with check (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));

-- RLS-aware dashboard views (Postgres 15+).
drop view if exists public.vw_monthly_category_vs_budget;
drop view if exists public.vw_monthly_category_actuals;
drop view if exists public.vw_monthly_financial_summary;
drop view if exists public.vw_active_transactions;
create view public.vw_active_transactions with (security_invoker=true) as select * from public.transactions where is_active=true;
create view public.vw_monthly_financial_summary with (security_invoker=true) as
select t.tenant_id,t.client_id,date_trunc('month',t.transaction_date)::date as month,
sum(case when t.direction='credit' and not t.is_transfer and not t.is_investment_flow then t.amount else 0 end) as total_income,
sum(case when t.direction='debit' and t.expense_nature in ('fixed','variable','punctual') and not t.is_transfer and not t.is_investment_flow and not t.is_card_payment then t.amount else 0 end) as total_expenses,
sum(case when t.direction='credit' and not t.is_transfer and not t.is_investment_flow then t.amount else 0 end)-sum(case when t.direction='debit' and t.expense_nature in ('fixed','variable','punctual') and not t.is_transfer and not t.is_investment_flow and not t.is_card_payment then t.amount else 0 end) as savings_capacity
from public.transactions t where t.is_active=true group by 1,2,3;
create view public.vw_monthly_category_actuals with (security_invoker=true) as
select t.tenant_id,t.client_id,date_trunc('month',t.transaction_date)::date as month,t.category_id,sum(t.amount) as actual_amount
from public.transactions t where t.is_active=true and t.direction='debit' and t.expense_nature in ('fixed','variable','punctual') and not t.is_transfer and not t.is_investment_flow and not t.is_card_payment group by 1,2,3,4;
create view public.vw_monthly_category_vs_budget with (security_invoker=true) as
select a.tenant_id,a.client_id,a.month,a.category_id,a.actual_amount,coalesce(sum(b.target_amount),0) as budget_amount,
case when coalesce(sum(b.target_amount),0)=0 then null else round((a.actual_amount/sum(b.target_amount))*100,2) end as budget_utilization_pct
from public.vw_monthly_category_actuals a left join public.budgets b on b.client_id=a.client_id and b.category_id=a.category_id and b.period_year=extract(year from a.month)::integer and b.period_month=extract(month from a.month)::integer
group by 1,2,3,4,5;

grant select on public.vw_active_transactions, public.vw_monthly_financial_summary, public.vw_monthly_category_actuals, public.vw_monthly_category_vs_budget to authenticated;
