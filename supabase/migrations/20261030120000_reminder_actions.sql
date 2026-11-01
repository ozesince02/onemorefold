-- One More Fold: Done and Later on reminders sent with the app closed (D-039).
-- Run once in the Supabase SQL editor, after the earlier files. Nothing here deletes data.
-- Tested against real Postgres by scripts/check-schema.mjs (npm run check).
--
--   push_actions       one row per reminder sent: the hash of its one-time token. Server only.
--   push_log           gains "remind again" (Later) and a count of sends, so Later can't loop.
--   act_on_reminder()  what the act-reminder function calls: uses a token once, then ticks the
--                      habit (Done) or queues the reminder again (Later). Service role only.

-- ---------- Tables ----------

create table public.push_actions (
  -- SHA-256 of the token, in hex. The token itself only ever exists inside the encrypted
  -- notification on the person's devices.
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  day date not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '2 days')
);
create index push_actions_expiry on public.push_actions (expires_at);

alter table public.push_log
  add column remind_again_at timestamptz,
  add column sends smallint not null default 1 check (sends between 1 and 3);

-- ---------- Using a token ----------

-- Returns 'done', 'later', 'last' (Later on the third send: nothing more is queued), or 'gone'
-- (unknown, used, expired, or the habit no longer exists).
-- The token is marked used first, in the same statement that checks it, so two presses can't both
-- act. A Done for a habit removed since the reminder went out changes nothing.
create function public.act_on_reminder(p_hash text, p_act text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if p_act not in ('done', 'later') then raise exception 'unknown action' using errcode = '22023'; end if;
  update public.push_actions set used_at = now()
    where token_hash = p_hash and used_at is null and expires_at > now()
    returning user_id, slug, day into r;
  if not found then return 'gone'; end if;

  if p_act = 'done' then
    begin
      insert into public.ticks (user_id, slug, day) values (r.user_id, r.slug, r.day)
        on conflict do nothing;
    exception when foreign_key_violation then
      return 'gone';
    end;
    return 'done';
  end if;

  update public.push_log set remind_again_at = now()
    where user_id = r.user_id and kind = 'remind' and slug = r.slug and day = r.day and sends < 3;
  if not found then return 'last'; end if;
  return 'later';
end $$;

-- ---------- Who may do what ----------

alter table public.push_actions enable row level security;
-- No policies: only the service role (the two Edge Functions) reads or writes push_actions.
revoke all on public.push_actions from anon, authenticated;
revoke all on function public.act_on_reminder(text, text) from public, anon, authenticated;
grant execute on function public.act_on_reminder(text, text) to service_role;
