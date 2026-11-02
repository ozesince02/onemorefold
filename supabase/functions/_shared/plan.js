// Who gets which reminder on this run (D-028). Pure: rows in, a list of messages out, so Node can
// check it (scripts/check-push.mjs) and the Edge Function only fetches rows and sends.
// lib/ holds exact copies of the app's own modules (npm run shared), so the sender and the tracker
// agree on what "due" means.
import { rowsToState } from './lib/sync/rows.js';
import { upcomingReminders, stillDue, pushText } from './lib/reminders-core.js';
import { wallClock, pad, shiftMonth } from './lib/dates.js';
import { dailySummary, weeklyRecap } from './lib/summaries.js';

export const DAILY_CAP = 30; // notifications a person can get in a day, whatever happens
export const LOG_DAYS = 14;  // how long the send log keeps a row

// Each person's own date and time right now. An unknown time zone falls back to UTC.
export function clocks(settings, now) {
  return settings.map((s) => {
    let clock;
    try { clock = wallClock(now, s.time_zone); } catch { clock = wallClock(now, 'UTC'); }
    const y = clock.getFullYear(), m = clock.getMonth() + 1;
    const prev = shiftMonth(y, m, -1);
    return {
      user_id: s.user_id, off: s.off || [], clock, month: `${y}-${pad(m)}-01`, day: `${y}-${pad(m)}-${pad(clock.getDate())}`,
      prevMonth: `${prev.y}-${pad(prev.m)}-01`,
      reminders: s.reminders !== false, daily: !!s.daily, weekly: !!s.weekly, summaryTime: s.summary_time || '21:30',
    };
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

// ---------- Daily summary and weekly recap (D-042) ----------
// Sent on the run whose half hour holds the person's summary time (a late run still counts), so at
// most once a day each; the recap only on Sundays, in the person's own time zone.
const minutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const slotOf = (clock) => Math.floor((clock.getHours() * 60 + clock.getMinutes()) / 30) * 30;

export function summariesDue(p) {
  const now = slotOf(p.clock) === minutes(p.summaryTime);
  return { daily: p.daily && now, weekly: p.weekly && now && p.clock.getDay() === 0 };
}

// people: from clocks(). habitMonths and ticks: rows for this month and the one before (summaries
// look back for runs and the week before). sent: today's push_log rows. Returns messages to send.
export function planSummaries({ people, habitMonths, ticks, sent }) {
  const out = [];
  for (const p of people) {
    const due = summariesDue(p);
    if (!due.daily && !due.weekly) continue;
    try {
      const mine = (r) => r.user_id === p.user_id && (r.month === p.month || r.month === p.prevMonth);
      const state = rowsToState({
        months: [{ month: p.prevMonth }, { month: p.month }],
        habit_months: habitMonths.filter(mine),
        ticks: ticks.filter((t) => t.user_id === p.user_id && (t.day.startsWith(p.month.slice(0, 8)) || t.day.startsWith(p.prevMonth.slice(0, 8)))),
      });
      const now = { y: p.clock.getFullYear(), m: p.clock.getMonth() + 1, d: p.clock.getDate() };
      const since = { y: Number(p.prevMonth.slice(0, 4)), m: Number(p.prevMonth.slice(5, 7)) };
      const already = (kind) => sent.some((r) => r.user_id === p.user_id && r.kind === kind && r.day === p.day);
      const add = (kind, slug, text) => text && !already(kind) && out.push({
        user_id: p.user_id, kind, slug, day: p.day,
        payload: { ...text, tag: `${p.day}:${slug}`, habitId: slug, date: p.day },
      });
      if (due.daily) add('daily', 'summary', dailySummary(state, now, since));
      if (due.weekly) add('weekly', 'week-recap', weeklyRecap(state, now));
    } catch { /* one person's odd data skips only them */ }
  }
  return out;
}
