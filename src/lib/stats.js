// Everything the sheet's formulas used to do, as plain functions of the data.
import { daysIn, weekday, sheetWeeks, monthKey, shiftMonth } from './dates.js';
import { cadenceOf, isFlexible, isDueDay, unitOf, habitWeeks, defaultGoal } from './schedule.js';

export const pct = (a, b) => (b > 0 ? a / b : 0);

// Two ways to read a habit, and a view that shows both (see docs/decisions.md, D-006):
//   days: ticks against the days that have happened so far this month;
//   goal: ticks against the habit's monthly goal, as the sheet's PROGRESS column did.
export const VIEWS = ['days', 'goal', 'both'];
export const VIEW_LABELS = { days: 'Days', goal: 'Goal', both: 'Both' };

// One month, the way a monthly tab showed it.
export function monthStats(month, y, m, now) {
  const days = daysIn(y, m);
  const isCurrent = now && now.y === y && now.m === m;
  const isFuture = now && (y > now.y || (y === now.y && m > now.m));
  const lastDay = isFuture ? 0 : isCurrent ? now.d : days;

  // A day is "over" once it's before today (or the month is past). Today is not over, so an
  // unticked today never breaks a run, but it is due: the Days view counts it from the start
  // (D-041).
  const over = (d) => d <= lastDay && !(isCurrent && d === now.d);

  const habits = (month?.habits || []).map((h) => {
    const set = new Set(month.checks[h.id] || []);
    const start = h.start || 1;
    const cadence = cadenceOf(h);
    const flexible = isFlexible(h);
    // cells: null before the habit started, otherwise ticked or not.
    // due:   'due' (a fixed day), 'rest' (a weekday habit's day off), 'flex' (any day counts), null.
    const cells = Array.from({ length: days }, (_, i) => (i + 1 < start ? null : set.has(i + 1)));
    const due = cells.map((c, i) => (c === null ? null : flexible ? 'flex' : isDueDay(h, y, m, i + 1) ? 'due' : 'rest'));
    const done = cells.filter(Boolean).length;

    // Units: days for daily and weekday habits, weeks for weekly ones, the month for monthly.
    // dueSoFar/doneSoFar feed the Days view; credit (units completed this month) feeds the Goal view.
    let dueSoFar = 0, doneSoFar = 0, credit = 0, longest = 0;
    if (!flexible) {
      let run = 0;
      due.forEach((k, i) => {
        if (k !== 'due') return; // rest days neither break nor extend a run
        const d = i + 1;
        if (cells[i]) { credit++; run++; longest = Math.max(longest, run); } else if (over(d)) run = 0;
        if (d <= lastDay || cells[i]) { dueSoFar++; if (cells[i]) doneSoFar++; }
      });
    } else if (cadence === 'monthly') {
      credit = Math.min(1, done);
      const monthOver = lastDay === days && !isCurrent;
      dueSoFar = monthOver ? 1 : credit;
      doneSoFar = credit;
      longest = credit;
    } else {
      let run = 0;
      for (const w of habitWeeks(h, y, m)) {
        const ticks = cells.slice(w.from - 1, w.to).filter(Boolean).length;
        const got = Math.min(ticks, w.target);
        credit += got;
        const weekOver = over(w.to);
        if (weekOver) { dueSoFar += w.target; doneSoFar += got; } else if (w.from <= lastDay) { dueSoFar += got; doneSoFar += got; }
        if (ticks >= w.target) { run++; longest = Math.max(longest, run); } else if (weekOver) run = 0;
      }
    }
    return {
      ...h,
      cadence,
      unit: unitOf(h),
      cells,
      due,
      done,
      credit,
      possible: flexible ? defaultGoal(h, y, m) : due.filter((k) => k === 'due').length,
      left: h.goal - credit,
      progress: pct(credit, h.goal),
      goalPct: pct(credit, h.goal),
      doneSoFar,
      daysSoFar: dueSoFar,
      daysPct: pct(doneSoFar, dueSoFar),
      longest,
    };
  });

  // A day's score counts the habits due that day, plus flexible habits ticked that day,
  // so a weekly habit never makes a day look worse.
  const perDay = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const live = habits.filter((h) => h.due[i] === 'due' || (h.due[i] === 'flex' && h.cells[i]));
    const done = live.filter((h) => h.cells[i]).length;
    return { day, weekday: weekday(y, m, day), done, goal: live.length, left: live.length - done, pct: pct(done, live.length), past: day <= lastDay };
  });

  const weeks = sheetWeeks(days).map((w) => {
    const slice = perDay.slice(w.from - 1, w.to);
    const done = slice.reduce((s, d) => s + d.done, 0);
    const possible = slice.reduce((s, d) => s + d.goal, 0);
    return { ...w, done, possible, pct: pct(done, possible) };
  });

  const done = habits.reduce((s, h) => s + h.done, 0);
  const possible = habits.reduce((s, h) => s + h.possible, 0);
  const target = habits.reduce((s, h) => s + (h.goal || 0), 0);
  // A habit past its goal counts as its goal, so one overachiever can't hide the rest.
  const goalMet = habits.reduce((s, h) => s + Math.min(h.credit, h.goal || 0), 0);
  const doneSoFar = habits.reduce((s, h) => s + h.doneSoFar, 0);
  const daysSoFar = habits.reduce((s, h) => s + h.daysSoFar, 0);
  const perfectDays = perDay.filter((d) => d.goal > 0 && d.done === d.goal).length;
  const top = rankHabits(habits, 'goal').slice(0, 10);

  return {
    y, m, days, lastDay, isCurrent, habits, perDay, weeks, top, perfectDays,
    total: {
      done, possible, target,
      pct: pct(done, possible),          // every box in the whole month: the sheet's success rate
      targetPct: pct(done, target),      // raw, as the sheet's "overall daily progress"
      goalMet, goalPct: pct(goalMet, target),
      doneSoFar, daysSoFar, daysPct: pct(doneSoFar, daysSoFar),
    },
  };
}

// The figure one view puts first for a habit or a month total ("both" leads with days).
export const primaryPct = (x, view) => (view === 'goal' ? x.goalPct : x.daysPct);

export function rankHabits(habits, view) {
  return [...habits].sort((a, b) => primaryPct(b, view) - primaryPct(a, view) || b.done - a.done);
}

// Current streak for one habit, walking back across months while the habit keeps the same kind
// of schedule. The unit follows the schedule: days (rest days skipped), weeks or months.
// The current day, week or month is never a miss yet: if it isn't done, the streak counts up to
// the one before it.
export function currentStreak(state, id, now) {
  return streakOf(state, id, now).n;
}

export function streakOf(state, id, now) {
  const habitAt = (y, m) => state.months[monthKey(y, m)]?.habits.find((h) => h.id === id);
  const ticks = (y, m) => state.months[monthKey(y, m)]?.checks[id] || [];
  const first = habitAt(now.y, now.m);
  if (!first) return { n: 0, unit: 'day' };
  const unit = unitOf(first);
  let n = 0;

  if (unit === 'day') {
    let { y, m } = now;
    let d = now.d;
    for (let guard = 0; guard < 800; guard++) {
      if (d < 1) {
        ({ y, m } = shiftMonth(y, m, -1));
        d = daysIn(y, m);
      }
      const h = habitAt(y, m);
      if (!h || unitOf(h) !== 'day' || d < (h.start || 1)) break;
      const isToday = y === now.y && m === now.m && d === now.d;
      if (isDueDay(h, y, m, d)) {
        if (ticks(y, m).includes(d)) n++;
        else if (!isToday) break;
      }
      d--;
    }
    return { n, unit };
  }

  if (unit === 'month') {
    let { y, m } = now;
    for (let guard = 0; guard < 120; guard++) {
      const h = habitAt(y, m);
      if (!h || unitOf(h) !== 'month') break;
      const isNow = y === now.y && m === now.m;
      if (ticks(y, m).length) n++;
      else if (!isNow) break;
      ({ y, m } = shiftMonth(y, m, -1));
    }
    return { n, unit };
  }

  // Weeks: walk this month's weeks backwards from the current one, then earlier months.
  let { y, m } = now;
  let fromDay = now.d;
  for (let guard = 0; guard < 60; guard++) {
    const h = habitAt(y, m);
    if (!h || unitOf(h) !== 'week') break;
    const list = ticks(y, m);
    const weeks = habitWeeks(h, y, m).filter((w) => w.from <= fromDay).reverse();
    let broke = false;
    for (const w of weeks) {
      const got = list.filter((t) => t >= w.from && t <= w.to).length;
      const isCurrentWeek = y === now.y && m === now.m && now.d >= w.from && now.d <= w.to;
      if (got >= w.target) n++;
      else if (!isCurrentWeek) { broke = true; break; }
    }
    if (broke) break;
    ({ y, m } = shiftMonth(y, m, -1));
    fromDay = daysIn(y, m);
  }
  return { n, unit };
}

export const runWords = ({ n, unit }) => `${n}-${unit} run`;

// The "Annual Progress Tracker" tab, plus the crane count.
export function yearStats(state, year, now) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const month = state.months[monthKey(year, m)];
    if (!month || !month.habits.length) return { m, rate: null, daysRate: null, goalRate: null, done: 0, possible: 0 };
    const s = monthStats(month, year, m, now);
    const started = s.total.daysSoFar > 0;
    return {
      m,
      daysRate: started ? s.total.daysPct : null,
      goalRate: started ? s.total.goalPct : null,
      rate: started ? s.total.daysPct : null, // the default reading; see rateOf() for a chosen view
      done: s.total.done, possible: s.total.possible, perfectDays: s.perfectDays,
    };
  });
  const cranes = months.reduce((s, x) => s + x.done, 0);
  return { year, months, cranes, ...summarise(months, 'days') };
}

export const rateOf = (mo, view) => (view === 'goal' ? mo.goalRate : mo.daysRate);

// Best month and average for one view.
export function summarise(months, view) {
  const rated = months.filter((x) => rateOf(x, view) !== null);
  const best = rated.reduce((a, b) => (rateOf(b, view) > (a ? rateOf(a, view) : -1) ? b : a), null);
  return { best, bestRate: best ? rateOf(best, view) : null, average: pct(rated.reduce((s, x) => s + rateOf(x, view), 0), rated.length) };
}

export const percent = (x, digits = 0) => `${(x * 100).toFixed(digits)}%`;
