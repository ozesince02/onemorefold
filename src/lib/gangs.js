// Gangs (D-030, D-044, D-046): a habit taken on together. The database hands each member everyone's
// ticks on the gang's habit, between its dates (my_gangs()); everything shown is worked out here,
// with the tracker's own schedule maths, so a gang never disagrees with anyone's month grid.
// Pure functions of those rows and a date, checked by scripts/check-gangs.mjs.
import { monthKey, shiftMonth, pad } from './dates.js';
import { monthStats, streakOf } from './stats.js';
import { isDueDay, isFlexible, habitWeeks, weekOf, unitOf, CADENCES } from './schedule.js';

export const GANG_SIZE = 10;
export const GANG_LIMIT = 20;
export const GANG_NAME_MAX = 60;
const ID = /^[0-9a-f-]{36}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const dayKey = ({ y, m, d }) => `${y}-${pad(m)}-${pad(d)}`;
export const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
const addDays = ({ y, m, d }, n) => { const t = new Date(Date.UTC(y, m - 1, d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const before = (a, b) => dayKey(a) < dayKey(b);

// my_gangs() rows (one per gang and member) into gangs with their members. Rows that don't look
// right are dropped rather than shown.
export function groupGangs(rows) {
  const gangs = new Map();
  for (const r of rows || []) {
    if (!ID.test(r.challenge) || !ID.test(r.member) || !r.tag_name || !DAY.test(r.starts) || !DAY.test(r.ends) || !CADENCES.includes(r.cadence)) continue;
    if (!gangs.has(r.challenge)) {
      gangs.set(r.challenge, {
        id: r.challenge,
        name: String(r.name || '').slice(0, GANG_NAME_MAX),
        cadence: r.cadence,
        weekdays: r.cadence === 'weekdays' ? (r.weekdays || []).filter((w) => Number.isInteger(w) && w >= 1 && w <= 7) : undefined,
        timesPerWeek: r.cadence === 'times_per_week' ? Math.min(7, Math.max(1, Number(r.times_per_week) || 1)) : undefined,
        starts: r.starts,
        ends: r.ends,
        members: [],
      });
    }
    gangs.get(r.challenge).members.push({
      id: r.member,
      name: String(r.tag_name),
      code: String(r.tag_code || ''),
      owner: r.owner === true,
      me: r.me === true,
      linked: r.linked === true,
      days: new Set((r.days || []).filter((d) => DAY.test(d))),
    });
  }
  return [...gangs.values()];
}

// The gang's habit as the tracker would hold it, for one month.
const habitFor = (g, y, m) => {
  const s = parseDay(g.starts);
  const h = { id: 'gang', name: g.name, goal: 1, time: '', start: s.y === y && s.m === m ? s.d : 1, cadence: g.cadence };
  if (g.cadence === 'weekdays') h.weekdays = g.weekdays;
  if (g.cadence === 'times_per_week') h.timesPerWeek = g.timesPerWeek;
  return h;
};

// One member's ticks as a tracker state, month by month from the gang's start to `upTo`.
function stateOf(g, member, upTo) {
  const months = {};
  let { y, m } = parseDay(g.starts);
  for (let guard = 0; guard < 14 && (y < upTo.y || (y === upTo.y && m <= upTo.m)); guard++) {
    const days = [...member.days].filter((s) => s.startsWith(`${y}-${pad(m)}-`)).map((s) => Number(s.slice(8, 10)));
    months[monthKey(y, m)] = { habits: [habitFor(g, y, m)], checks: { gang: days.sort((a, b) => a - b) } };
    ({ y, m } = shiftMonth(y, m, 1));
  }
  return { months };
}

// Where the gang stands on `now` ({ y, m, d }, the viewer's today):
//   phase: 'soon' | 'on' | 'over'; day and length (day 3 of 30);
//   period: 'day' (daily, chosen days) or 'week' | 'month' (flexible schedules);
//   due: whether today asks for a fold (a chosen-days gang rests on the other days);
//   folded / waiting: members who have and haven't folded this period (only those whose habit is
//   linked; unlinked members are listed apart); and each member's figures so far.
export function gangStatus(g, now) {
  const start = parseDay(g.starts);
  const end = parseDay(g.ends);
  const phase = before(now, start) ? 'soon' : before(end, now) ? 'over' : 'on';
  const upTo = phase === 'over' ? end : now;
  const length = Math.round((Date.UTC(end.y, end.m - 1, end.d) - Date.UTC(start.y, start.m - 1, start.d)) / 86400000) + 1;
  const day = phase === 'soon' ? 0 : Math.round((Date.UTC(upTo.y, upTo.m - 1, upTo.d) - Date.UTC(start.y, start.m - 1, start.d)) / 86400000) + 1;
  const h = habitFor(g, upTo.y, upTo.m);
  const flexible = isFlexible(h);
  const period = flexible ? unitOf(h) : 'day';
  const due = phase === 'on' && (flexible || isDueDay(h, now.y, now.m, now.d));

  // This period's span, for flexible gangs: the sheet week (from the 1st) or the month.
  let span = null, target = 1;
  if (flexible && phase === 'on') {
    if (period === 'month') span = { from: h.start || 1, to: 31 };
    else { const w = weekOf(habitWeeks(h, now.y, now.m), now.d); span = w; target = w?.target || 1; }
  }
  const today = dayKey(now);
  const members = g.members.map((mem) => {
    let doneNow = false;
    if (phase === 'on' && mem.linked) {
      if (!flexible) doneNow = mem.days.has(today);
      else if (span) {
        const prefix = `${now.y}-${pad(now.m)}-`;
        const n = [...mem.days].filter((s) => s.startsWith(prefix) && Number(s.slice(8)) >= span.from && Number(s.slice(8)) <= span.to).length;
        doneNow = n >= target;
      }
    }
    let done = 0, dueSoFar = 0, run = { n: 0, unit: period };
    if (phase !== 'soon') {
      const state = stateOf(g, mem, upTo);
      for (const [key, month] of Object.entries(state.months)) {
        const [y, m] = key.split('-').map(Number);
        const stats = monthStats(month, y, m, upTo).habits[0];
        done += stats?.doneSoFar || 0;
        dueSoFar += stats?.daysSoFar || 0;
      }
      run = streakOf(state, 'gang', upTo);
    }
    const week = [...Array(7)].map((_, i) => dayKey(addDays(now, i - 6))).filter((k) => mem.days.has(k)).length;
    return { ...mem, doneNow, done: Math.min(done, dueSoFar), due: dueSoFar, run, week };
  });
  const linked = members.filter((x) => x.linked);
  return {
    phase, day, length, period, due,
    folded: linked.filter((x) => x.doneNow),
    waiting: due ? linked.filter((x) => !x.doneNow) : [], // nobody is waited on before, after, or on a rest day
    unlinked: members.filter((x) => !x.linked),
    members,
  };
}

// The stamp banner: for each of the last `days` days of the gang up to today, who folded.
export function stampRows(g, now, days = 7) {
  const start = parseDay(g.starts);
  const end = parseDay(g.ends);
  const last = before(end, now) ? end : now;
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(last, -i);
    if (before(d, start)) continue;
    const h = habitFor(g, d.y, d.m);
    const rest = !isFlexible(h) && !isDueDay(h, d.y, d.m, d.d);
    out.push({ day: d, key: dayKey(d), rest, stamped: g.members.map((mem) => mem.days.has(dayKey(d))) });
  }
  return out;
}

// "Ravi", "Ravi and jo", "Ravi, jo and Asha".
export function namesText(list) {
  const names = list.map((x) => x.name);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// A gang's dates for a person starting it today: a week, two weeks, 30 days, or to a chosen day.
export const LENGTHS = [['7', 'A week'], ['14', 'Two weeks'], ['30', '30 days'], ['90', '90 days']];
export const endFor = (startKey, days) => dayKey(addDays(parseDay(startKey), days - 1));
