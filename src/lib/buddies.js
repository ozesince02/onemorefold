// Buddies (D-029, D-045): your own figures as your buddies may see them, and how a buddy's figures
// read on their card. Worked out on your device with the tracker's own maths (monthStats, the
// summaries' best run), so a buddy never sees a number your tracker disagrees with. Pure functions
// of the state and a date, checked by scripts/check-buddies.mjs.
// Voice (docs/design.md): every number says what it counts; a quiet week is quieter, not a failure.
import { monthKey, shiftMonth, daysIn, pad } from './dates.js';
import { monthStats } from './stats.js';
import { bestRun } from './summaries.js';

export const LEVELS = ['none', 'doing', 'habits'];
export const LEVEL_LABELS = { none: 'Just buddies', doing: "How I'm doing", habits: 'My habits' };
export const LEVEL_HINTS = {
  none: "That you're buddies, and your tag. Nothing about your habits.",
  doing: 'Your totals over the last 7 and 30 days, the trend and your longest run going. No habit names.',
  habits: 'The totals, plus the habits you pick, each with its name and this month so far.',
};
export const BUDDY_LIMIT = 50;
export const INVITE_LIMIT = 10;
export const INVITE_DAYS = 7;

// Done and due over `days` days ending on `end` ({ y, m, d }), counted as the month grid's daily
// score counts them (D-041: today is due from the start of the day).
function tally(state, end, days, now, cache) {
  let done = 0, due = 0;
  let { y, m } = end;
  let d = end.d;
  for (let i = 0; i < days; i++) {
    if (d < 1) { ({ y, m } = shiftMonth(y, m, -1)); d = daysIn(y, m); }
    const key = monthKey(y, m);
    const month = state.months[key];
    if (month?.habits.length) {
      if (!cache.has(key)) cache.set(key, monthStats(month, y, m, now));
      const day = cache.get(key).perDay[d - 1];
      if (day) { done += day.done; due += day.goal; }
    }
    d--;
  }
  return { done, due, end: { y, m, d } };
}

// The row for buddy_figures. `shared`: habit ids picked for at least one buddy at "My habits";
// private habits are left out here as well as by the database.
export function figuresOf(state, now, shared = []) {
  const cache = new Map();
  const week = tally(state, now, 7, now, cache);
  const prev = tally(state, week.end, 7, now, cache);
  const month = tally(state, now, 30, now, cache);
  const key = monthKey(now.y, now.m);
  const picked = new Set(shared);
  const habits = [];
  if (picked.size && state.months[key]?.habits.length) {
    if (!cache.has(key)) cache.set(key, monthStats(state.months[key], now.y, now.m, now));
    for (const h of cache.get(key).habits) {
      if (!picked.has(h.id) || state.private?.[h.id]) continue;
      const due = Math.min(99, h.daysSoFar || 0);
      habits.push({ slug: h.id, name: h.name, done: Math.min(due, h.doneSoFar || 0), due });
    }
  }
  return {
    as_of: `${now.y}-${pad(now.m)}-${pad(now.d)}`,
    week_done: week.done, week_due: week.due,
    prev_done: prev.done, prev_due: prev.due,
    month_done: month.done, month_due: month.due,
    run: Math.min(9999, bestRun(state, now)?.n || 0),
    habits,
  };
}

// Which way a buddy's week is going, against the week before: 'rising' | 'steady' | 'quieter',
// or '' when either week had nothing due.
export function trendOf(f) {
  if (!f?.week_due || !f.prev_due) return '';
  const diff = f.week_done / f.week_due - f.prev_done / f.prev_due;
  return diff >= 0.05 ? 'rising' : diff <= -0.05 ? 'quieter' : 'steady';
}

// How old a buddy's figures are, in whole days (0 = today), or null without figures.
export function ageOf(asOf, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || '')) return null;
  const [y, m, d] = asOf.split('-').map(Number);
  return Math.round((Date.UTC(now.y, now.m - 1, now.d) - Date.UTC(y, m - 1, d)) / 86400000);
}
