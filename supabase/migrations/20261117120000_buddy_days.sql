-- One More Fold: a buddy's month, day by day (D-051). Run once in the Supabase SQL editor, after the
-- earlier files. Tested on real Postgres by scripts/check-schema.mjs (npm run check).
--
-- At "My habits", someone can now also show the days they ticked the habits they picked: the same
-- month grid their own Month tab shows, read-only. It's a separate yes (buddies.days), off for
-- everyone until they turn it on, so nobody who chose "My habits" before shows more than they
-- agreed to.
--
-- buddy_month() is the only way to read it. Like my_buddies(), it checks the pair exists both ways,
-- returns only the picked habits, never a private one, and only while that buddy shares at
-- "My habits" with the days on; and only this month, the next (time zones) and the 11 before.

alter table public.buddies add column days boolean not null default false;
grant update (days) on public.buddies to authenticated;

-- my_buddies() as before, plus whether the days are shown each way.
drop function public.my_buddies();
create function public.my_buddies()
returns table (
  buddy uuid, tag_name text, tag_code text, since timestamptz,
  my_level text, my_habits text[], their_level text,
  as_of date, week_done int, week_due int, prev_done int, prev_due int, month_done int, month_due int, run int,
  habits jsonb, my_days boolean, their_days boolean
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
         ), '[]'::jsonb) else '[]'::jsonb end,
         m.level = 'habits' and m.days,
         o.level = 'habits' and o.days
  from public.buddies m
  join public.buddies o on o.user_id = m.buddy_id and o.buddy_id = m.user_id
  join public.profiles p on p.id = m.buddy_id
  left join public.buddy_figures f on f.user_id = m.buddy_id
  where m.user_id = (select auth.uid())
  order by m.created_at, p.tag_name
$$;

-- One month of a buddy's shared habits: each habit as their tracker has it set up that month (its
-- name, colour, goal, first day and schedule) and the days of that month they ticked it.
create function public.buddy_month(p_buddy uuid, p_month date)
returns table (
  slug text, name text, color text, goal smallint, start_day smallint, cadence text,
  weekdays smallint[], times_per_week smallint, "position" smallint, days smallint[]
)
language sql stable security definer set search_path = '' as $$
  select hm.slug, hm.name, h.color, hm.goal, hm.start_day, hm.cadence, hm.weekdays, hm.times_per_week, hm.position,
         coalesce((select array_agg(extract(day from t.day)::smallint order by t.day)
                   from public.ticks t
                   where t.user_id = hm.user_id and t.slug = hm.slug and t.month = hm.month), '{}')
  from public.buddies m
  join public.buddies o on o.user_id = m.buddy_id and o.buddy_id = m.user_id
  join public.habit_months hm on hm.user_id = o.user_id and hm.month = p_month and hm.slug = any (o.habits)
  join public.habits h on h.user_id = hm.user_id and h.slug = hm.slug
  where m.user_id = (select auth.uid())
    and m.buddy_id = p_buddy
    and o.level = 'habits' and o.days
    and not h.private
    and p_month = date_trunc('month', p_month)::date
    and p_month between (date_trunc('month', current_date) - interval '11 months')::date
                    and (date_trunc('month', current_date) + interval '1 month')::date
  order by hm.position, hm.slug
$$;

revoke all on function public.my_buddies(), public.buddy_month(uuid, date) from public, anon;
grant execute on function public.my_buddies(), public.buddy_month(uuid, date) to authenticated;
