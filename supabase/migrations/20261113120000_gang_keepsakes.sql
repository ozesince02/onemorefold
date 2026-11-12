-- One More Fold: keepsakes of finished gangs (D-047). Run once in the Supabase SQL editor, after
-- the earlier files. Tested on real Postgres by scripts/check-schema.mjs.
--
-- When a gang ends, each member can keep its result on their Year: the gang's name, dates and
-- schedule, how many gang cranes everyone folded together, and each member's tag and figures. It's
-- a copy in your own rows, so it stays after everyone has left and the gang itself is gone. Only you
-- read it; nobody else's rows are touched.

create table public.gang_keepsakes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null,
  name text not null check (char_length(name) between 1 and 60 and name !~ '[\x01-\x1f\x7f]'),
  cadence text not null check (cadence in ('daily', 'weekdays', 'times_per_week', 'weekly', 'monthly')),
  starts date not null check (starts between '2026-01-01' and '2199-01-01'),
  ends date not null,
  cranes smallint not null check (cranes between 0 and 400),
  periods smallint not null check (periods between 0 and 400),
  unit text not null check (unit in ('day', 'week', 'month')),
  members jsonb not null check (jsonb_typeof(members) = 'array' and jsonb_array_length(members) between 1 and 10 and pg_column_size(members) <= 4096),
  created_at timestamptz not null default now(),
  primary key (user_id, challenge_id),
  check (ends between starts + 6 and starts + 366),
  check (cranes <= periods)
);

-- Each member is exactly { name, code, done, due }: a tag as profiles allow, and their figures.
create function private.check_gang_keepsake() returns trigger
language plpgsql set search_path = '' as $$
declare
  e jsonb;
begin
  for e in select value from jsonb_array_elements(new.members) loop
    if jsonb_typeof(e) <> 'object'
      or (select count(*) from jsonb_object_keys(e)) <> 4
      or jsonb_typeof(e->'name') <> 'string' or char_length(e->>'name') not between 3 and 16
      or (e->>'name') ~ '[\x01-\x1f\x7f<>]'
      or jsonb_typeof(e->'code') <> 'string' or (e->>'code') !~ '^[A-Z0-9]{3,5}$'
      or jsonb_typeof(e->'done') <> 'number' or jsonb_typeof(e->'due') <> 'number'
      or (e->>'done') !~ '^\d{1,3}$' or (e->>'due') !~ '^\d{1,3}$'
      or (e->>'done')::int > (e->>'due')::int
    then
      raise exception 'gang_keepsakes: a member must be {name, code, done, due}' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
create trigger check_gang_keepsake before insert or update on public.gang_keepsakes
  for each row execute function private.check_gang_keepsake();

-- At most 100 keepsakes a person: five years of a gang every three weeks.
create function private.limit_gang_keepsakes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.gang_keepsakes where user_id = new.user_id) >= 100 then
    raise exception 'One More Fold limit: 100 gang keepsakes' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger limit_gang_keepsakes before insert on public.gang_keepsakes
  for each row execute function private.limit_gang_keepsakes();

alter table public.gang_keepsakes enable row level security;
create policy "own keepsakes" on public.gang_keepsakes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.gang_keepsakes from anon, authenticated;
grant select, insert, delete on public.gang_keepsakes to authenticated;
revoke all on function private.check_gang_keepsake(), private.limit_gang_keepsakes() from public;
