// The daily summary and weekly recap (D-042) say exactly what the tracker shows, in the voice rules.
import assert from 'node:assert/strict';
import { sampleState } from '../src/data/sample.js';
import { monthStats } from '../src/lib/stats.js';
import { dailySummary, weeklyRecap, bestRun } from '../src/lib/summaries.js';

const state = sampleState();
const oct = (d) => ({ y: 2026, m: 10, d });
const perDay = (d) => monthStats(state.months['2026-10'], 2026, 10, oct(d)).perDay[d - 1];

// Daily: the same "done of due" as the month grid's day.
for (const d of [6, 15, 20, 22]) {
  const s = dailySummary(state, oct(d));
  const { done, goal } = perDay(d);
  assert.equal(s.title, `Today: ${done} of ${goal} folded`, `the title matches the grid on the ${d}th`);
  assert.match(s.body, new RegExp(`^${done} of ${goal} habits due today are done\.`), 'and says what it counts');
}
assert.match(dailySummary(state, oct(6)).body, /A perfect day/, 'a perfect day says so (the 6th was perfect)');
// The example has nothing ticked on the 23rd yet.
const empty = dailySummary(state, oct(23));
assert.match(empty.title, /^Today: 0 of \d+ folded$/, 'nothing done yet today still sums up');
assert.match(empty.body, /Fall seven, rise eight/, 'a zero day is a fall, not a failure');
assert.doesNotMatch(empty.body, /fail|missed|bad|lazy/i, 'and never scolds');
assert.equal(dailySummary({ months: {} }, oct(22)), null, 'nothing due: no summary');

// Runs: the longest day run still going, and "more than" when it reaches back past the data.
const run = bestRun(state, oct(22));
assert.ok(run === null || run.n >= 2, 'a run is at least two days');
const fresh = { months: { '2026-10': { habits: [{ id: 'bed', name: 'Make your bed', goal: 30, time: '', start: 1 }], checks: { bed: Array.from({ length: 22 }, (_, i) => i + 1) } } } };
assert.deepEqual(bestRun(fresh, oct(22), { y: 2026, m: 10 }), { name: 'Make your bed', n: 22, more: true }, 'a run back to the first day of our data may be longer');
assert.match(dailySummary(fresh, oct(22), { y: 2026, m: 10 }).body, /more than a 22-day run/);

// Weekly: the last seven days against the seven before, across the 1st when it needs to.
const wk = weeklyRecap(state, oct(22));
let done = 0, goal = 0;
for (let d = 16; d <= 22; d++) { done += perDay(d).done; goal += perDay(d).goal; }
assert.equal(wk.title, `Your week: ${done} of ${goal} folded`, 'the week sums the grid\'s seven days');
assert.match(wk.body, /% of due\)/, 'the percentage says what it counts');
assert.match(wk.body, /Most folded: /, 'names the most-folded habit');
const across = weeklyRecap(state, oct(3));
assert.ok(across && /of \d+ folded/.test(across.title), 'a week across the 1st reads September too');
assert.equal(weeklyRecap({ months: {} }, oct(22)), null, 'nothing due all week: no recap');
console.log('summaries: all checks pass');
