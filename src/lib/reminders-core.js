// When is a habit due? Pure functions of the data and a Date, so they can be tested in Node.
import { monthKey, minutesOf, pad } from './dates.js';
import { isFlexible, isDueDay, flexibleOpen, unitOf } from './schedule.js';

export const LATE_WINDOW = 120; // minutes after the nudge during which a missed one still fires
export const SNOOZE_MINUTES = 10;

const DEFAULTS = { enabled: false, lead: 0, off: {}, log: {} };
export const settingsOf = (state) => ({ ...DEFAULTS, ...state.reminders });
export const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const logKey = (date, id) => `${dateKey(date)}:${id}`;

// Habits that have a time, are switched on, are due today by their schedule (D-013) and are not
// ticked yet. A weekday habit rests on its days off; a weekly or monthly one stops once it's met.
function candidates(state, date) {
  const r = settingsOf(state);
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const month = state.months[monthKey(y, m)];
  if (!month) return [];
  return month.habits
    .filter((h) => {
      const ticks = month.checks[h.id] || [];
      if (!h.time || r.off[h.id] || (h.start || 1) > d || ticks.includes(d)) return false;
      return isFlexible(h) ? flexibleOpen(h, ticks, y, m, d) : isDueDay(h, y, m, d);
    })
    .sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
}

// The reminders that should fire right now.
export function dueReminders(state, date = new Date()) {
  const r = settingsOf(state);
  if (!r.enabled) return [];
  const mins = date.getHours() * 60 + date.getMinutes();
  return candidates(state, date).flatMap((h) => {
    const key = logKey(date, h.id);
    const log = r.log[key];
    const at = minutesOf(h.time) - r.lead;
    if (log?.snoozeUntil) return date.getTime() >= log.snoozeUntil ? [{ habit: h, key, late: true }] : [];
    if (log?.firedAt) return [];
    if (mins < at || mins >= at + LATE_WINDOW) return [];
    return [{ habit: h, key, late: mins > minutesOf(h.time) }];
  });
}

// The next reminder still to come today, for the "next nudge" line.
export function nextReminder(state, date = new Date()) {
  const r = settingsOf(state);
  if (!r.enabled) return null;
  const mins = date.getHours() * 60 + date.getMinutes();
  return candidates(state, date)
    .map((h) => ({ habit: h, at: minutesOf(h.time) - r.lead }))
    .filter((x) => x.at > mins)
    .sort((a, b) => a.at - b.at)[0] || null;
}

// ---------- Closed-app reminders (D-028) ----------
// The sender runs every 30 minutes, at :00 and :30. Each run reminds habits due after its half
// hour began, up to and including the next one: (slot, slot + 30]. A run that starts late still
// covers its own half hour, and the 00:00 run also takes habits at exactly 00:00.
export const PUSH_WINDOW = 30;

// date: the person's wall clock (dates.js wallClock). off: their habits switched off.
export function upcomingReminders(state, date, off = {}) {
  const mins = date.getHours() * 60 + date.getMinutes();
  const slot = Math.floor(mins / PUSH_WINDOW) * PUSH_WINDOW;
  return candidates({ ...state, reminders: { ...DEFAULTS, enabled: true, off } }, date).filter((h) => {
    const at = minutesOf(h.time);
    return (at > slot && at <= slot + PUSH_WINDOW) || (slot === 0 && at === 0);
  });
}

// What the notification says. It may arrive up to half an hour early, so it names the time.
export function pushText(habit, { again = false } = {}) {
  const unit = unitOf(habit);
  const when = unit === 'day' ? '' : ` Any day this ${unit} counts.`;
  if (again) return { title: `${habit.name} · ${habit.time}`, body: `Still to do: ${habit.name}. There's still time${unit === 'day' ? ' today' : ` this ${unit}`}.` };
  return { title: `${habit.name} · ${habit.time}`, body: `Next up: ${habit.name} at ${habit.time}.${when}` };
}

// Habits someone asked to hear about again (Later, D-039): only those still due and not ticked.
export function stillDue(state, date, off = {}) {
  return candidates({ ...state, reminders: { ...DEFAULTS, enabled: true, off } }, date);
}
