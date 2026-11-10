-- One More Fold: buddies (D-029, D-044, D-045). Run once in the Supabase SQL editor, after the
-- earlier files. Tested on real Postgres by scripts/check-schema.mjs (npm run check).
--
-- What it adds:
--   * user tags (name#TAG) on profiles, unique, with the same checks as src/lib/tags.js;
--   * private habits, never shown to any buddy;
--   * invites: one-time links, stored only as a hash of the secret, good for 7 days;
--   * buddies: two rows per pair, one per direction, each saying what that person shares;
--   * buddy_figures: each person's own totals, worked out by their own device with the tracker's
--     maths and kept up to date there (D-045);
--   * my_buddies(): the only way to read anything about a buddy. It checks the pair exists both
--     ways and returns only what that buddy's level allows, without private habits.
--
-- Rules (docs/security.md): row-level security on every table; nobody reads another person's
-- rows directly; anything that touches two people's rows is a SECURITY DEFINER function that
-- acts only for the caller (auth.uid()); signed-out visitors can call nothing.

-- ---------- User tags ----------
-- name: 3 to 16 letters or numbers in any language, single spaces between words. The database
-- refuses what could deceive (invisible and direction-changing characters, symbols, emoji) and
-- names that pass as the team; the app's check (src/lib/tags.js) is stricter still.
alter table public.profiles
  add column tag_name text,
  add column tag_code text,
  add constraint tag_together check ((tag_name is null) = (tag_code is null)),
  add constraint tag_code_shape check (tag_code ~ '^[A-Z0-9]{3,5}$'),
  add constraint tag_name_shape check (
    char_length(tag_name) between 3 and 16
    and tag_name !~ '^ | $|  '
    and tag_name !~ '[\x01-\x1f\x7f-\x9f!-/:-@\[-`{-~\u00a0\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u2000-\u200f\u2028-\u202f\u205f-\u206f\u2190-\u2bff\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\uffff\U0001F000-\U0001FAFF\U000E0000-\U000E007F]'
    and lower(replace(tag_name, ' ', '')) !~ '^(eightfold|onemorefold|admin|administrator|support|moderator|official|system)'
  );

-- No two people share a name and tag, ignoring capitals.
create unique index profiles_tag on public.profiles (lower(tag_name), tag_code) where tag_name is not null;

-- Choose or change your tag. 'taken' when someone else has it; bad shapes are refused outright.
create function public.set_my_tag(p_name text, p_code text)
returns text language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_name is null or p_code is null then raise exception 'a tag needs a name and a code' using errcode = '22023'; end if;
  update public.profiles set tag_name = p_name, tag_code = upper(p_code) where id = (select auth.uid());
  return 'ok';
exception when unique_violation then
  return 'taken';
end $$;

-- ---------- Private habits ----------
alter table public.habits add column private boolean not null default false;

-- ---------- Invites ----------
-- The secret travels after '#' in the link, so it never reaches a server log; only its SHA-256
-- is stored. Used once, or gone after 7 days.
create table public.invites (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at <= created_at + interval '7 days'),
  used_at timestamptz
);
create index invites_user on public.invites (user_id);

-- ---------- Buddies ----------
-- One row per direction: (user_id, buddy_id) says what user_id shares with buddy_id.
--   level 'none' = just buddies, 'doing' = how I'm doing, 'habits' = my habits (the chosen ones).
-- Rows are made only by accept_invite() and removed only by remove_buddy(), always in pairs.
create table public.buddies (
  user_id uuid not null references public.profiles (id) on delete cascade,
  buddy_id uuid not null references public.profiles (id) on delete cascade,
  level text not null default 'doing' check (level in ('none', 'doing', 'habits')),
  habits text[] not null default '{}' check (
    cardinality(habits) <= 50
    and array_to_string(habits, ',') ~ '^([a-z0-9][a-z0-9-]{0,63}(,[a-z0-9][a-z0-9-]{0,63})*)?$'
    and cardinality(habits) = coalesce(array_length(string_to_array(array_to_string(habits, ','), ','), 1), 0)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, buddy_id),
  check (user_id <> buddy_id)
);
create index buddies_buddy on public.buddies (buddy_id);
create trigger set_updated_at before update on public.buddies for each row execute function private.set_updated_at();

-- ---------- Figures (D-045) ----------
-- Your own totals, as your device last worked them out: due habits done over the 7 days to as_of,
-- the 7 before (for the trend) and the 30 to as_of; the longest run still going (in days); and,
-- only for habits you share with someone by name, this month's done and due so far.
create table public.buddy_figures (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  as_of date not null check (as_of between '2026-01-01' and '2199-12-31'),
  week_done smallint not null check (week_done between 0 and 1550),
  week_due smallint not null check (week_due between 0 and 1550),
  prev_done smallint not null check (prev_done between 0 and 1550),
  prev_due smallint not null check (prev_due between 0 and 1550),
  month_done smallint not null check (month_done between 0 and 1550),
  month_due smallint not null check (month_due between 0 and 1550),
  run smallint not null default 0 check (run between 0 and 9999),
  habits jsonb not null default '[]'::jsonb
    check (jsonb_typeof(habits) = 'array' and jsonb_array_length(habits) <= 50 and pg_column_size(habits) <= 12288),
  updated_at timestamptz not null default now(),
  check (week_done <= week_due and prev_done <= prev_due and month_done <= month_due)
);
create trigger set_updated_at before update on public.buddy_figures for each row execute function private.set_updated_at();

-- Each shared habit is exactly { slug, name, done, due }: a habit id, a name as habits allow, and
-- this month's counts.
create function private.check_buddy_figures() returns trigger
language plpgsql set search_path = '' as $$
declare
  e jsonb;
begin
  for e in select value from jsonb_array_elements(new.habits) loop
    if jsonb_typeof(e) <> 'object'
      or (select count(*) from jsonb_object_keys(e)) <> 4
      or jsonb_typeof(e->'slug') <> 'string' or (e->>'slug') !~ '^[a-z0-9][a-z0-9-]{0,63}$'
      or jsonb_typeof(e->'name') <> 'string' or char_length(e->>'name') not between 1 and 120
      or jsonb_typeof(e->'done') <> 'number' or jsonb_typeof(e->'due') <> 'number'
      or (e->>'done') !~ '^\d{1,2}$' or (e->>'due') !~ '^\d{1,2}$'
      or (e->>'done')::int > (e->>'due')::int
    then
      raise exception 'buddy_figures: a shared habit must be {slug, name, done, due}' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
create trigger check_buddy_figures before insert or update on public.buddy_figures
  for each row execute function private.check_buddy_figures();

-- ---------- Row-level security ----------
alter table public.invites enable row level security;
alter table public.buddies enable row level security;
alter table public.buddy_figures enable row level security;

create policy "own invites" on public.invites for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "take back own invites" on public.invites for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy "own sharing" on public.buddies for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "change own sharing" on public.buddies for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own figures" on public.buddy_figures for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.invites, public.buddies, public.buddy_figures from anon, authenticated;
grant select, delete on public.invites to authenticated;
grant select on public.buddies to authenticated;
grant update (level, habits) on public.buddies to authenticated;
grant select, insert, update, delete on public.buddy_figures to authenticated;

-- ---------- Functions ----------
-- Hand over your card: store the hash of a new invite. At most 10 open at a time; needs a tag.
create function public.create_invite(p_hash text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  until timestamptz := now() + interval '7 days';
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = me and tag_name is not null) then
    raise exception 'choose a tag first' using errcode = '22023';
  end if;
  delete from public.invites where user_id = me and (used_at is not null or expires_at < now());
  if (select count(*) from public.invites where user_id = me) >= 10 then
    raise exception 'One More Fold limit: 10 open invites' using errcode = '22023';
  end if;
  insert into public.invites (token_hash, user_id, expires_at) values (p_hash, me, until);
  return until;
end $$;

-- What an invite says before it's accepted: who sent it, or why it can't be used.
--   state: 'ok' | 'gone' (used, expired or never existed) | 'self' | 'already' (already buddies)
create function public.peek_invite(p_hash text)
returns table (state text, tag_name text, tag_code text)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  inv public.invites;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into inv from public.invites i where i.token_hash = p_hash and i.used_at is null and i.expires_at > now();
  if inv.user_id is null then return query select 'gone'::text, null::text, null::text; return; end if;
  return query
    select case when inv.user_id = me then 'self'
                when exists (select 1 from public.buddies b where b.user_id = me and b.buddy_id = inv.user_id) then 'already'
                else 'ok' end,
           p.tag_name, p.tag_code
    from public.profiles p where p.id = inv.user_id;
end $$;

-- Swap cards: both become buddies. The sender shares "How I'm doing" to start (D-029); the one
-- accepting picks their own level. Returns 'ok' | 'gone' | 'self' | 'already' | 'full'.
create function public.accept_invite(p_hash text, p_level text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  inv public.invites;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_level not in ('none', 'doing', 'habits') then raise exception 'unknown level' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = me and tag_name is not null) then
    raise exception 'choose a tag first' using errcode = '22023';
  end if;
  select * into inv from public.invites i where i.token_hash = p_hash and i.used_at is null and i.expires_at > now() for update;
  if inv.user_id is null then return 'gone'; end if;
  if inv.user_id = me then return 'self'; end if;
  if exists (select 1 from public.buddies where user_id = me and buddy_id = inv.user_id) then return 'already'; end if;
  if (select count(*) from public.buddies where user_id = me) >= 50
    or (select count(*) from public.buddies where user_id = inv.user_id) >= 50 then
    return 'full';
  end if;
  insert into public.buddies (user_id, buddy_id, level) values (inv.user_id, me, 'doing'), (me, inv.user_id, p_level);
  update public.invites set used_at = now() where token_hash = p_hash;
  return 'ok';
end $$;

-- "Not now": the link stops working, and the sender isn't told.
create function public.decline_invite(p_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.invites set used_at = now()
    where token_hash = p_hash and used_at is null and user_id <> (select auth.uid());
end $$;

-- Remove a buddy: both directions at once; neither sees anything about the other from then on.
create function public.remove_buddy(p_buddy uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.buddies
    where (user_id = me and buddy_id = p_buddy) or (user_id = p_buddy and buddy_id = me);
end $$;

-- Your buddies, each with their tag, what you share with them, and what they share with you:
-- figures only from 'doing' up, named habits only at 'habits' and only the ones they picked,
-- never a private habit. A pair counts only while both rows exist.
create function public.my_buddies()
returns table (
  buddy uuid, tag_name text, tag_code text, since timestamptz,
  my_level text, my_habits text[], their_level text,
  as_of date, week_done int, week_due int, prev_done int, prev_due int, month_done int, month_due int, run int,
  habits jsonb
)
language sql stable security definer set search_path = '' as $$
  select m.buddy_id, p.tag_name, p.tag_code, m.created_at,
         m.level, m.habits, o.level,
         case when o.level <> 'none' then f.as_of end,
         case when o.level <> 'none' then f.week_done end,
         case when o.level <> 'none' then f.week_due end,
         case when o.level <> 'none' then f.prev_done end,
         case when o.level <> 'none' then f.prev_due end,
         case when o.level <> 'none' then f.month_done end,
         case when o.level <> 'none' then f.month_due end,
         case when o.level <> 'none' then f.run end,
         case when o.level = 'habits' and f.user_id is not null then coalesce((
           select jsonb_agg(jsonb_build_object('name', e->>'name', 'done', (e->>'done')::int, 'due', (e->>'due')::int) order by e->>'name')
           from jsonb_array_elements(f.habits) e
           where (e->>'slug') = any (o.habits)
             and not exists (select 1 from public.habits h where h.user_id = o.user_id and h.slug = e->>'slug' and h.private)
         ), '[]'::jsonb) else '[]'::jsonb end
  from public.buddies m
  join public.buddies o on o.user_id = m.buddy_id and o.buddy_id = m.user_id
  join public.profiles p on p.id = m.buddy_id
  left join public.buddy_figures f on f.user_id = m.buddy_id
  where m.user_id = (select auth.uid())
  order by m.created_at, p.tag_name
$$;

revoke all on function public.set_my_tag(text, text), public.create_invite(text), public.peek_invite(text),
  public.accept_invite(text, text), public.decline_invite(text), public.remove_buddy(uuid), public.my_buddies()
  from public, anon;
grant execute on function public.set_my_tag(text, text), public.create_invite(text), public.peek_invite(text),
  public.accept_invite(text, text), public.decline_invite(text), public.remove_buddy(uuid), public.my_buddies()
  to authenticated;
revoke all on function private.check_buddy_figures() from public;
