create table if not exists office_ratings (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, user_id)
);

alter table office_ratings enable row level security;
create policy "public can read office ratings" on office_ratings for select using (true);
create policy "users can rate offices" on office_ratings for insert with check (auth.uid() = user_id);
create policy "users can update their office ratings" on office_ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function rate_office(p_office uuid, p_rating smallint)
returns office_ratings language plpgsql security invoker set search_path = public as $$
declare result office_ratings;
begin
  if auth.uid() is null then raise exception 'Sign in to rate an office'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5'; end if;
  insert into office_ratings (office_id, user_id, rating)
  values (p_office, auth.uid(), p_rating)
  on conflict (office_id, user_id) do update set rating = excluded.rating, updated_at = now()
  returning * into result;
  return result;
end;
$$;
grant execute on function rate_office(uuid, smallint) to authenticated;
