-- Fix the onboarding tables introduced after the generic hardening migration.
-- Their old policies referenced revoked public helper functions and were not tenant/client aware.
drop policy if exists client_alerts_tenant_access on public.client_alerts;
drop policy if exists client_category_targets_tenant_access on public.client_category_targets;
drop policy if exists client_family_members_tenant_access on public.client_family_members;

create policy client_alerts_staff_all on public.client_alerts for all to authenticated
using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()))
with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy client_alerts_client_read on public.client_alerts for select to authenticated
using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));

create policy client_category_targets_staff_all on public.client_category_targets for all to authenticated
using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()))
with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy client_category_targets_client_read on public.client_category_targets for select to authenticated
using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));

create policy client_family_members_staff_all on public.client_family_members for all to authenticated
using (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()))
with check (tenant_id=(select private.current_tenant_id()) and (select private.is_tenant_staff()));
create policy client_family_members_client_read on public.client_family_members for select to authenticated
using (tenant_id=(select private.current_tenant_id()) and (select private.client_user_has_access(client_id)));

create index if not exists idx_client_alerts_client on public.client_alerts(client_id);
create index if not exists idx_client_alerts_tenant_status_due on public.client_alerts(tenant_id,status,due_at);
create index if not exists idx_client_family_members_client on public.client_family_members(client_id);
create index if not exists idx_client_family_members_tenant on public.client_family_members(tenant_id);
create index if not exists idx_client_category_targets_client on public.client_category_targets(client_id);
create index if not exists idx_client_category_targets_category on public.client_category_targets(category_id);
create index if not exists idx_client_category_targets_tenant on public.client_category_targets(tenant_id);
create index if not exists idx_clients_consultant on public.clients(consultant_id);
