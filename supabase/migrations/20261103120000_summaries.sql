-- One More Fold: a daily summary and a weekly recap, sent with the app closed (D-042).
-- Run once in the Supabase SQL editor, after the earlier files. Nothing here deletes data.
-- Tested against real Postgres by scripts/check-schema.mjs (npm run check).
--
--   push_settings  gains two switches (both off) and the time they arrive, on the hour or half hour,
--                  because the sender runs at :00 and :30.
--   push_log       may now also note a sent summary ('daily') or recap ('weekly'), so neither is
--                  sent twice.

alter table public.push_settings
  add column daily boolean not null default false,
  add column weekly boolean not null default false,
  add column summary_time time not null default '21:30'
    check (extract(minute from summary_time) in (0, 30) and extract(second from summary_time) = 0);

alter table public.push_log drop constraint push_log_kind_check;
alter table public.push_log add constraint push_log_kind_check check (kind in ('remind', 'daily', 'weekly'));
