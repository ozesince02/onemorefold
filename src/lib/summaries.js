// The daily summary and the weekly recap (D-042): what they say, worked out from the same
// monthStats and streakOf the tracker shows, so a notification never disagrees with the app. Pure
// functions of the state and a date, so Node checks them (scripts/check-summaries.mjs) and the
// send-reminders function runs an exact copy (npm run shared).
// Voice (docs/design.md): every number says what it counts, a miss is a fall, never a failure.
import { monthKey, shiftMonth, daysIn } from './dates.js';
import { monthStats, streakOf, percent } from './stats.js';
import { unitOf } from './schedule.js';

// The day's row from monthStats: habits due that day, plus flexible ones ticked that day.
function dayOf(state, y, m, d, now) {
  const month = state.months[monthKey(y, m)];
  if (!month || !month.habits.length) return { done: 0, goal: 0 };
  return monthStats(month, y, m, now).perDay[d - 1] || { done: 0, goal: 0 };
}

// The best run still going today, in days, among daily and weekday habits: { name, n } or null.
// `since` is the first month the caller has data for; a run that reaches back to it may be longer.
export function bestRun(state, now, since = null) {
  const month = state.months[monthKey(now.y, now.m)];
  let best = null;
  for (const h of month?.habits || []) {
    if (unitOf(h) !== 'day') continue;
    const { n } = streakOf(state, h.id, now);
    if (n >= 2 && (!best || n > best.n)) best = { name: h.name, n };
  }
  if (best && since) {
    // Days available from the start of `since` to today: a run that long may continue further back.
    let span = 0;
    for (let { y, m } = since; y < now.y || (y === now.y && m <= now.m); ({ y, m } = shiftMonth(y, m, 1))) {
      span += y === now.y && m === now.m ? now.d : daysIn(y, m);
    }
    best.more = best.n >= span - 1;
  }
  return best;
}

// Tonight's summary, or null when nothing was due today (nothing to sum up).
export function dailySummary(state, now, since = null) {
  const today = dayOf(state, now.y, now.m, now.d, now);
  if (!today.goal) return null;
  const { done, goal } = today;
  const run = bestRun(state, now, since);
  const runLine = run ? ` ${run.name}: ${run.more ? 'more than ' : ''}a ${run.n}-day run, still going.` : '';
  let mood;
  if (done === goal) mood = 'A perfect day. A crane takes off.';
  else if (done * 2 >= goal) mood = 'Good folding. Tomorrow, one more.';
  else if (done > 0) mood = 'Every fold counts. Tomorrow, one more.';
  else mood = "Fall seven, rise eight. Tomorrow is one more fold.";
  return {
    title: `Today: ${done} of ${goal} folded`,
    body: `${done} of ${goal} habits due today are done.${runLine} ${mood}`,
  };
}

// The seven days ending on `now`, and the seven before: done and due, and perfect days.
function weekTotals(state, now) {
  const tally = (end) => {
    let done = 0, goal = 0, perfect = 0;
    const most = {};
    let { y, m } = end;
    let d = end.d;
    for (let i = 0; i < 7; i++) {
      if (d < 1) { ({ y, m } = shiftMonth(y, m, -1)); d = daysIn(y, m); }
      const day = dayOf(state, y, m, d, now);
      done += day.done; goal += day.goal;
      if (day.goal && day.done === day.goal) perfect++;
      for (const h of state.months[monthKey(y, m)]?.habits || []) {
        if ((state.months[monthKey(y, m)].checks[h.id] || []).includes(d)) most[h.name] = (most[h.name] || 0) + 1;
      }
      d--;
    }
    return { done, goal, perfect, most, end: { y, m, d } };
  };
  const week = tally(now);
  return { week, last: tally(week.end) }; // tally steps back into the month before when it needs to
}

// Sunday's recap, or null when the week had nothing due.
export function weeklyRecap(state, now) {
  const { week, last } = weekTotals(state, now);
  if (!week.goal) return null;
  const rate = week.done / week.goal;
  let trend = '';
  if (last.goal) {
    const was = last.done / last.goal;
    const diff = Math.round((rate - was) * 100);
    trend = diff > 0 ? ` Up from ${percent(was)} the week before.` : diff < 0 ? ` The week before was ${percent(was)}. Fall seven, rise eight.` : ' Steady with the week before.';
  }
  const top = Object.entries(week.most).sort((a, b) => b[1] - a[1])[0];
  const topLine = top ? ` Most folded: ${top[0]} (${top[1]} of 7 days).` : '';
  const perfectLine = week.perfect ? ` ${week.perfect} perfect ${week.perfect === 1 ? 'day' : 'days'}.` : '';
  return {
    title: `Your week: ${week.done} of ${week.goal} folded`,
    body: `${week.done} of ${week.goal} due this week are done (${percent(rate)} of due).${trend}${perfectLine}${topLine}`,
  };
}
