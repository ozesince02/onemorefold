-- One More Fold: gangs, the challenges of Flock (D-030, D-044, D-046). Run once in the Supabase SQL
-- editor, after the earlier files. Tested on real Postgres by scripts/check-schema.mjs.
--
-- A gang is a habit two to ten people take on together, each ticking their own. Joining links one
-- of your habits to the gang; members see each other's ticks on that one habit, between the gang's
-- dates, and nothing else. Everything goes through functions that act only for auth.uid().
--
-- Also: card secrets are now hashed by the database, not the browser, so a stored hash is no
-- longer something that could be sent back in place of the secret (review of 11 Nov 2026).

-- ---------- Gangs ----------
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60 and name !~ '[\x01-\x1f\x7f]' and name = btrim(name)),
  cadence text not null default 'daily'
    check (cadence in ('daily', 'weekdays', 'times_per_week', 'weekly', 'monthly')),
  weekdays smallint[] check (weekdays is null or (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(weekdays) between 1 and 7)),
  times_per_week smallint check (times_per_week between 1 and 7),
  starts date not null check (starts between '2026-01-01' and '2199-01-01'),
  ends date not null,
  created_at timestamptz not null default now(),
  check ((cadence = 'weekdays') = (weekdays is not null)),
  check ((cadence = 'times_per_week') = (times_per_week is not null)),
  check (ends between starts + 6 and starts + 366)
);

-- Who's in. Exactly one owner while anyone is in; when the owner leaves, the longest-standing
-- member takes over; when the last one leaves, the gang is gone.
create table public.challenge_members (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  owner boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create unique index challenge_one_owner on public.challenge_members (challenge_id) where owner;
create index challenge_members_user on public.challenge_members (user_id);

-- The habit in your own tracker that is your part of a gang: at most one per gang.
alter table public.habits add column challenge_id uuid references public.challenges (id) on delete set null;
create unique index habits_one_per_challenge on public.habits (user_id, challenge_id) where challenge_id is not null;

-- A habit can only be linked to a gang you're in, once. Anything else is quietly unlinked rather
-- than refused, so a device that hasn't heard you left can still sync the rest of your tracker.
create function private.check_habit_challenge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.challenge_id is not null and (
    not exists (select 1 from public.challenge_members m where m.challenge_id = new.challenge_id and m.user_id = new.user_id)
    or exists (select 1 from public.habits h where h.user_id = new.user_id and h.challenge_id = new.challenge_id and h.slug <> new.slug)
  ) then
    new.challenge_id := null;
  end if;
  return new;
end $$;
create trigger check_habit_challenge before insert or update of challenge_id on public.habits
  for each row execute function private.check_habit_challenge();

-- Someone left (or was removed, or deleted their account): unlink their habit, pass the gang on if
-- they owned it, and remove the gang once nobody is left.
create function private.after_member_left() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  next_owner uuid;
begin
  update public.habits set challenge_id = null where user_id = old.user_id and challenge_id = old.challenge_id;
  if old.owner then
    select m.user_id into next_owner from public.challenge_members m
      where m.challenge_id = old.challenge_id order by m.joined_at, m.user_id limit 1;
    if next_owner is not null then
      update public.challenge_members set owner = true where challenge_id = old.challenge_id and user_id = next_owner;
    end if;
  end if;
  if not exists (select 1 from public.challenge_members m where m.challenge_id = old.challenge_id) then
    delete from public.challenges where id = old.challenge_id;
  end if;
  return old;
end $$;
create trigger after_member_left after delete on public.challenge_members
  for each row execute function private.after_member_left();

alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
-- No policies and no grants: gangs are read and changed only through the functions below.
revoke all on public.challenges, public.challenge_members from anon, authenticated;

-- ---------- Cards: one kind for buddies, another for a gang ----------
alter table public.invites add column challenge_id uuid references public.challenges (id) on delete cascade;

-- The card's secret (32 random bytes, base64url) is hashed here, so only the hash is ever stored.
create function private.card_hash(p_token text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'not a card' using errcode = '22023';
  end if;
  return encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
end $$;

drop function public.create_invite(text);
drop function public.peek_invite(text);
drop function public.accept_invite(text, text);
drop function public.decline_invite(text);

-- Hand over a card: for becoming buddies, or (with p_challenge) for joining a gang you're in.
-- At most 10 open cards a person.
create function public.create_invite(p_token text, p_challenge uuid default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  until timestamptz := now() + interval '7 days';
  c public.challenges;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = me and tag_name is not null) then
    raise exception 'choose a tag first' using errcode = '22023';
  end if;
  if p_challenge is not null then
    select ch.* into c from public.challenges ch
      join public.challenge_members m on m.challenge_id = ch.id and m.user_id = me
      where ch.id = p_challenge;
    if c.id is null then raise exception 'not in that gang' using errcode = '42501'; end if;
    if c.ends < current_date then raise exception 'that gang has ended' using errcode = '22023'; end if;
    until := least(until, (c.ends + 1)::timestamptz);
  end if;
  delete from public.invites where user_id = me and (used_at is not null or expires_at < now());
  if (select count(*) from public.invites where user_id = me) >= 10 then
    raise exception 'One More Fold limit: 10 open invites' using errcode = '22023';
  end if;
  insert into public.invites (token_hash, user_id, expires_at, challenge_id)
    values (private.card_hash(p_token), me, until, p_challenge);
  return until;
end $$;

-- What a card says before it's accepted.
--   kind: 'buddy' | 'gang'
--   state: 'ok' | 'gone' | 'self' | 'already' | 'full' (a gang of 10) | 'ended'
create function public.peek_invite(p_token text)
returns table (
  state text, kind text, tag_name text, tag_code text,
  gang_name text, cadence text, weekdays smallint[], times_per_week smallint, starts date, ends date, members int
)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  inv public.invites;
  c public.challenges;
  n int;
  st text;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into inv from public.invites i
    where i.token_hash = private.card_hash(p_token) and i.used_at is null and i.expires_at > now();
  if inv.user_id is null then
    return query select 'gone'::text, null::text, null::text, null::text, null::text, null::text, null::smallint[], null::smallint, null::date, null::date, null::int;
    return;
  end if;
  if inv.challenge_id is null then
    st := case when inv.user_id = me then 'self'
               when exists (select 1 from public.buddies b where b.user_id = me and b.buddy_id = inv.user_id) then 'already'
               else 'ok' end;
    return query select st, 'buddy'::text, p.tag_name, p.tag_code, null::text, null::text, null::smallint[], null::smallint, null::date, null::date, null::int
      from public.profiles p where p.id = inv.user_id;
    return;
  end if;
  select * into c from public.challenges ch where ch.id = inv.challenge_id;
  select count(*) into n from public.challenge_members m where m.challenge_id = c.id;
  st := case when inv.user_id = me then 'self'
             when exists (select 1 from public.challenge_members m where m.challenge_id = c.id and m.user_id = me) then 'already'
             when c.ends < current_date then 'ended'
             when n >= 10 then 'full'
             else 'ok' end;
  return query select st, 'gang'::text, p.tag_name, p.tag_code, c.name, c.cadence, c.weekdays, c.times_per_week, c.starts, c.ends, n
    from public.profiles p where p.id = inv.user_id;
end $$;

-- Accept a card. Buddies: both become buddies, the sender at "How I'm doing", you at p_level.
-- A gang: you join it (p_level is ignored). Returns the same states as peek_invite.
create function public.accept_invite(p_token text, p_level text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  inv public.invites;
  c public.challenges;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = me and tag_name is not null) then
    raise exception 'choose a tag first' using errcode = '22023';
  end if;
  select * into inv from public.invites i
    where i.token_hash = private.card_hash(p_token) and i.used_at is null and i.expires_at > now() for update;
  if inv.user_id is null then return 'gone'; end if;
  if inv.user_id = me then return 'self'; end if;

  if inv.challenge_id is null then
    if p_level is null or p_level not in ('none', 'doing', 'habits') then raise exception 'unknown level' using errcode = '22023'; end if;
    if exists (select 1 from public.buddies where user_id = me and buddy_id = inv.user_id) then return 'already'; end if;
    if (select count(*) from public.buddies where user_id = me) >= 50
      or (select count(*) from public.buddies where user_id = inv.user_id) >= 50 then
      return 'full';
    end if;
    insert into public.buddies (user_id, buddy_id, level) values (inv.user_id, me, 'doing'), (me, inv.user_id, p_level);
  else
    select * into c from public.challenges ch where ch.id = inv.challenge_id for update;
    if c.id is null then return 'gone'; end if;
    if exists (select 1 from public.challenge_members where challenge_id = c.id and user_id = me) then return 'already'; end if;
    if c.ends < current_date then return 'ended'; end if;
    if (select count(*) from public.challenge_members where challenge_id = c.id) >= 10 then return 'full'; end if;
    if (select count(*) from public.challenge_members where user_id = me) >= 20 then return 'full'; end if;
    insert into public.challenge_members (challenge_id, user_id) values (c.id, me);
  end if;
  update public.invites set used_at = now() where token_hash = inv.token_hash;
  return 'ok';
end $$;

create function public.decline_invite(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.invites set used_at = now()
    where token_hash = private.card_hash(p_token) and used_at is null and user_id <> (select auth.uid());
end $$;

-- ---------- Starting, changing and leaving a gang ----------
-- Start a gang; you're its owner. It starts from yesterday (time zones) to a month ahead, lasts a
-- week to a year, and you can be in at most 20.
create function public.create_gang(p_name text, p_cadence text, p_weekdays smallint[], p_times smallint, p_starts date, p_ends date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  id uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where profiles.id = me and tag_name is not null) then
    raise exception 'choose a tag first' using errcode = '22023';
  end if;
  if p_starts not between current_date - 1 and current_date + 31 then
    raise exception 'a gang starts between today and a month from now' using errcode = '22023';
  end if;
  if (select count(*) from public.challenge_members where user_id = me) >= 20 then
    raise exception 'One More Fold limit: 20 gangs' using errcode = '22023';
  end if;
  insert into public.challenges (name, cadence, weekdays, times_per_week, starts, ends)
    values (p_name, p_cadence, case when p_cadence = 'weekdays' then p_weekdays end,
            case when p_cadence = 'times_per_week' then p_times end, p_starts, p_ends)
    returning challenges.id into id;
  insert into public.challenge_members (challenge_id, user_id, owner) values (id, me, true);
  return id;
end $$;

-- The owner can rename a gang and move its end later (never earlier: nobody's progress is rewritten).
create function public.edit_gang(p_challenge uuid, p_name text, p_ends date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.challenge_members where challenge_id = p_challenge and user_id = me and owner) then
    raise exception 'only the owner can change a gang' using errcode = '42501';
  end if;
  update public.challenges set name = p_name, ends = greatest(ends, p_ends) where id = p_challenge;
end $$;

create function public.leave_gang(p_challenge uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.challenge_members where challenge_id = p_challenge and user_id = (select auth.uid());
end $$;

-- The owner can remove someone else.
create function public.remove_member(p_challenge uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_user = me then raise exception 'use leave_gang' using errcode = '22023'; end if;
  if not exists (select 1 from public.challenge_members where challenge_id = p_challenge and user_id = me and owner) then
    raise exception 'only the owner can remove someone' using errcode = '42501';
  end if;
  delete from public.challenge_members where challenge_id = p_challenge and user_id = p_user;
end $$;

-- Your gangs: one row per gang and member, with that member's ticks on their linked habit between
-- the gang's dates. Only gangs you're in; nothing about any other habit; a private habit's ticks
-- are never returned.
create function public.my_gangs()
returns table (
  challenge uuid, name text, cadence text, weekdays smallint[], times_per_week smallint, starts date, ends date,
  member uuid, tag_name text, tag_code text, joined_at timestamptz, owner boolean, me boolean, linked boolean, days date[]
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.cadence, c.weekdays, c.times_per_week, c.starts, c.ends,
         m.user_id, p.tag_name, p.tag_code, m.joined_at, m.owner, m.user_id = (select auth.uid()),
         h.slug is not null,
         coalesce((select array_agg(t.day order by t.day) from public.ticks t
                   where h.slug is not null and not h.private and t.user_id = m.user_id and t.slug = h.slug
                     and t.day between c.starts and c.ends), '{}')
  from public.challenge_members mine
  join public.challenges c on c.id = mine.challenge_id
  join public.challenge_members m on m.challenge_id = c.id
  join public.profiles p on p.id = m.user_id
  left join public.habits h on h.user_id = m.user_id and h.challenge_id = c.id
  where mine.user_id = (select auth.uid())
  order by c.starts, c.id, m.joined_at, m.user_id
$$;

revoke all on function public.create_invite(text, uuid), public.peek_invite(text), public.accept_invite(text, text),
  public.decline_invite(text), public.create_gang(text, text, smallint[], smallint, date, date),
  public.edit_gang(uuid, text, date), public.leave_gang(uuid), public.remove_member(uuid, uuid), public.my_gangs()
  from public, anon;
grant execute on function public.create_invite(text, uuid), public.peek_invite(text), public.accept_invite(text, text),
  public.decline_invite(text), public.create_gang(text, text, smallint[], smallint, date, date),
  public.edit_gang(uuid, text, date), public.leave_gang(uuid), public.remove_member(uuid, uuid), public.my_gangs()
  to authenticated;
revoke all on function private.card_hash(text), private.check_habit_challenge(), private.after_member_left() from public;
