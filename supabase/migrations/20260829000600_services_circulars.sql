create table if not exists mo_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  requested_office_id uuid not null references offices(id),
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'PENDING' check (status in ('PENDING','UNDER_REVIEW','APPROVED','REJECTED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table mo_transfer_requests enable row level security;
create policy mo_transfer_read on mo_transfer_requests for select using (applicant_id = auth.uid() or is_staff());
create policy mo_transfer_insert on mo_transfer_requests for insert with check (applicant_id = auth.uid() and exists (select 1 from applications a where a.id = application_id and a.owner_id = auth.uid()));
create policy mo_transfer_staff_update on mo_transfer_requests for update using (is_staff()) with check (is_staff());
grant select, insert on mo_transfer_requests to authenticated;
grant update on mo_transfer_requests to authenticated;

create table if not exists circulars (
  id uuid primary key default gen_random_uuid(), title text not null, circular_date date not null,
  file_url text not null, published boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table circulars enable row level security;
create policy circulars_public_read on circulars for select using (published = true or is_admin());
create policy circulars_admin_write on circulars for all using (is_admin()) with check (is_admin());
grant select on circulars to anon, authenticated;
grant insert, update, delete on circulars to authenticated;
