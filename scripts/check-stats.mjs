// Checks the two percentage readings (days so far, and goal) against cases counted by hand in the
// example year (src/data/sample.js pins the counts used here).
import assert from 'node:assert/strict';
import { SAMPLE_MONTHS } from '../src/data/sample.js';
import { monthStats, rankHabits, yearStats } from '../src/lib/stats.js';

const month = (key) => ({ habits: SAMPLE_MONTHS[key], checks: Object.fromEntries(SAMPLE_MONTHS[key].map((h) => [h.id, [...h.days]])) });
const now = { y: 2026, m: 10, d: 23 };
const round = (x) => Math.round(x * 100);

// September is over: days so far = all 30 days.
const sep = monthStats(month('2026-09'), 2026, 9, now);
const walk = sep.habits.find((h) => h.id === 'walk');
assert.equal(`${walk.doneSoFar}/${walk.daysSoFar}`, '13/30', 'September walk: 13 of 30 days');
assert.equal(round(walk.daysPct), 43, 'September walk: 43% of days');
assert.equal(round(walk.goalPct), 65, 'September walk: 65% of its 20-day goal');

// October on the 23rd, nothing ticked today: today is due from the start of the day (D-041).
const oct = monthStats(month('2026-10'), 2026, 10, now);
const octWalk = oct.habits.find((h) => h.id === 'walk');
assert.equal(octWalk.daysSoFar, 23, 'unticked today still counts as due');
const ticked = month('2026-10');
ticked.checks.walk.push(23);
assert.equal(monthStats(ticked, 2026, 10, now).habits.find((h) => h.id === 'walk').daysSoFar, 23, 'ticking today does not change what was due');
assert.equal(`${oct.total.doneSoFar}/${oct.total.daysSoFar}`, '80/138', 'October so far: 80 of 138 boxes (6 habits × 23 days)');

// The owner's 2 November: six daily habits, five ticked on the 1st, two so far on the 2nd.
const six = Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, name: `h${i}`, goal: 20, start: 1 }));
const nov = monthStats({ habits: six, checks: Object.fromEntries(six.map((h, i) => [h.id, [...(i < 5 ? [1] : []), ...(i < 2 ? [2] : [])]])) }, 2026, 11, { y: 2026, m: 11, d: 2 });
assert.equal(`${nov.total.doneSoFar}/${nov.total.daysSoFar}`, '7/12', 'This month: 7 of 12, not 7 of 8');
assert.equal(nov.habits[5].left, 20, 'goal 20, nothing done: 20 still to do');
assert.equal(nov.habits[2].left, 19, 'goal 20, done once: 19 still to do (the Due column)');

// January's "Learn something new" went 27 against a goal of 10: shown as 270%, but capped at 10 in
// the month's goal total.
const jan = monthStats(month('2026-01'), 2026, 1, now);
assert.equal(round(jan.habits.find((h) => h.id === 'learn').goalPct), 270);
assert.ok(jan.total.goalPct <= 1, 'month goal total never passes 100%');

// Ranking follows the chosen view.
assert.equal(rankHabits(sep.habits, 'days')[0].id, 'bed');
assert.equal(rankHabits(sep.habits, 'goal')[0].id, 'bed');
assert.equal(rankHabits(sep.habits, 'goal')[1].id, 'stretch');

// The year: past months count every day; October is counted so far.
const year = yearStats({ months: Object.fromEntries(Object.keys(SAMPLE_MONTHS).map((k) => [k, month(k)])) }, 2026, now);
assert.equal(round(year.months[8].daysRate), 50, 'September 50%: 90 of 180 boxes');
assert.equal(round(year.months[9].daysRate), 58, 'October so far 58%: 80 of 138, counting today but not the days still to come');
assert.equal(year.months[10].daysRate, null, 'November not started');
console.log('stats: all checks pass');
