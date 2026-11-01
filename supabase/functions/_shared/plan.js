// Who gets which reminder on this run (D-028). Pure: rows in, a list of messages out, so Node can
// check it (scripts/check-push.mjs) and the Edge Function only fetches rows and sends.
// lib/ holds exact copies of the app's own modules (npm run shared), so the sender and the tracker
// agree on what "due" means.
import { rowsToState } from './lib/sync/rows.js';
import { upcomingReminders, stillDue, pushText } from './lib/reminders-core.js';
import { wallClock, pad } from './lib/dates.js';

export const DAILY_CAP = 30; // notifications a person can get in a day, whatever happens
export const LOG_DAYS = 14;  // how long the send log keeps a row

// Each person's own date and time right now. An unknown time zone falls back to UTC.
export function clocks(settings, now) {
  return settings.map((s) => {
    let clock;
    try { clock = wallClock(now, s.time_zone); } catch { clock = wallClock(now, 'UTC'); }
    const y = clock.getFullYear(), m = clock.getMonth() + 1;
    return { user_id: s.user_id, off: s.off || [], clock, month: `${y}-${pad(m)}-01`, day: `${y}-${pad(m)}-${pad(clock.getDate())}` };
  });
}

// people: from clocks(). habitMonths and ticks: rows for those people and months. sent: today's
// push_log rows (with remind_again_at, from Later). Returns [{ user_id, slug, day, again, payload }]:
// new reminders, and again: true for ones queued by Later that are still due. At most DAILY_CAP a
// person a day, counting both.
export function planReminders({ people, habitMonths, ticks, sent }) {
  const out = [];
  for (const p of people) {
    // One person's odd data skips only that person, never the whole run.
    try { out.push(...planOne(p, habitMonths, ticks, sent)); } catch { /* left out of this run */ }
  }
  return out;
}

function planOne(p, habitMonths, ticks, sent) {
  const out = [];
  const tables = {
    months: [{ month: p.month }],
    habit_months: habitMonths.filter((r) => r.user_id === p.user_id && r.month === p.month),
    ticks: ticks.filter((t) => t.user_id === p.user_id && t.day.startsWith(p.month.slice(0, 8))),
  };
  if (!tables.habit_months.length) return out;
  const state = rowsToState(tables);
  const already = sent.filter((r) => r.user_id === p.user_id && r.day === p.day);
  let room = DAILY_CAP - already.reduce((n, r) => n + (r.sends || 1), 0);
  const off = Object.fromEntries(p.off.map((slug) => [slug, true]));
  const message = (habit, again) => ({
    user_id: p.user_id,
    slug: habit.id,
    day: p.day,
    again,
    // What the service worker shows. Encrypted for each device; only that browser reads it.
    payload: { ...pushText(habit, { again }), tag: `${p.day}:${habit.id}`, habitId: habit.id, date: p.day },
  });
  // Later (D-039): sent again if it's still due and not ticked; otherwise it quietly lapses.
  const queued = new Set(already.filter((r) => r.remind_again_at).map((r) => r.slug));
  for (const habit of stillDue(state, p.clock, off)) {
    if (room <= 0) break;
    if (!queued.has(habit.id)) continue;
    room--;
    out.push(message(habit, true));
  }
  for (const habit of upcomingReminders(state, p.clock, off)) {
    if (room <= 0) break;
    if (already.some((r) => r.slug === habit.id)) continue;
    room--;
    out.push(message(habit, false));
  }
  return out;
}

// Rows older than LOG_DAYS can go: nothing is ever sent for a day that far back.
export const logCutoff = (now) => new Date(now.getTime() - LOG_DAYS * 86400000).toISOString().slice(0, 10);
