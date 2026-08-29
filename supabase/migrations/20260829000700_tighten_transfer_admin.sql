drop policy if exists mo_transfer_staff_update on mo_transfer_requests;
create policy mo_transfer_admin_update on mo_transfer_requests for update
  using (is_admin()) with check (is_admin());
