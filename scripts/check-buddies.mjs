// Buddies (D-029, D-045): tags are checked as the database checks them, the figures a buddy sees
// match the tracker's own maths, and private habits never leave this device.
import assert from 'node:assert/strict';
import { sampleState } from '../src/data/sample.js';
import { monthStats } from '../src/lib/stats.js';
import { nameProblem, codeProblem, cleanCode, suggestCode } from '../src/lib/tags.js';
import { figuresOf, trendOf, ageOf } from '../src/lib/buddies.js';
import { cleanState } from '../src/lib/sanitize.js';
import { stateToRows, rowsToState, mergeStates } from '../src/lib/sync/rows.js';

// Tags: the same rules as the profiles constraints.
for (const ok of ['oze', 'Asha Rao', 'मीरा', 'ரவி', 'Jo 2', 'Ünal', '김민준']) assert.equal(nameProblem(ok), '', `${ok} is a fine name`);
for (const [bad, why] of [
  ['ab', /At least 3/], ['a'.repeat(17), /At most 16/], [' oze', /Single spaces/], ['o  ze', /Single spaces/],
  ['oze<b>', /No symbols/], ['oze‮', /No symbols/], ['o​ze', /No symbols/], ['oze\u{1F600}', /No symbols/],
  ['o͏ze', /No symbols/], ['One More Fold', /team/], ['ADMIN', /team/], ['Eightfold fan', /team/],
]) assert.match(nameProblem(bad), why, `refused: ${JSON.stringify(bad)}`);
assert.equal(cleanCode(' run '), 'RUN', 'codes are kept in capitals');
assert.equal(codeProblem('run'), '', 'lower case is fine to type');
for (const bad of ['10', '123456', '10-0', 'ab c', '']) assert.notEqual(codeProblem(bad), '', `refused code: ${bad}`);
assert.match(suggestCode(() => 0), /^\d{4}$/, 'a suggested code is four digits');
assert.match(suggestCode(() => 0.9999), /^\d{4}$/, 'always four');

// Figures: the 7 days to the 22nd add up the month grid's daily scores for the 16th to the 22nd.
const state = sampleState();
const now = { y: 2026, m: 10, d: 22 };
const perDay = monthStats(state.months['2026-10'], 2026, 10, now).perDay;
const sum = (from, to, k) => perDay.slice(from - 1, to).reduce((n, day) => n + day[k], 0);
const f = figuresOf(state, now);
assert.equal(f.as_of, '2026-10-22');
assert.deepEqual([f.week_done, f.week_due], [sum(16, 22, 'done'), sum(16, 22, 'goal')], 'the last 7 days match the grid');
assert.deepEqual([f.prev_done, f.prev_due], [sum(9, 15, 'done'), sum(9, 15, 'goal')], 'and the 7 before');
assert.ok(f.month_due >= f.week_due && f.month_done <= f.month_due, '30 days hold the 7');
assert.deepEqual(f.habits, [], 'no habit names unless picked');
const id = state.months['2026-10'].habits[0].id;
const picked = figuresOf(state, now, [id, 'ghost']);
const h = monthStats(state.months['2026-10'], 2026, 10, now).habits[0];
assert.deepEqual(picked.habits, [{ slug: id, name: h.name, done: h.doneSoFar, due: h.daysSoFar }], 'a picked habit: this month so far, as the Days view counts it');
assert.deepEqual(figuresOf({ ...state, private: { [id]: true } }, now, [id]).habits, [], 'a private habit is never sent, even when picked');
// Across a month's start: the 7 days to 3 November reach back into October.
const early = figuresOf(state, { y: 2026, m: 11, d: 3 });
assert.ok(early.week_due > 0, 'the week reaches back into the month before');
assert.deepEqual(figuresOf({ months: {} }, now), { as_of: '2026-10-22', week_done: 0, week_due: 0, prev_done: 0, prev_due: 0, month_done: 0, month_due: 0, run: 0, habits: [] }, 'an empty tracker: zeros');

// Trend and age, for the card.
assert.equal(trendOf({ week_done: 18, week_due: 24, prev_done: 12, prev_due: 24 }), 'rising');
assert.equal(trendOf({ week_done: 7, week_due: 21, prev_done: 18, prev_due: 21 }), 'quieter', 'a quieter week is quieter, not worse');
assert.equal(trendOf({ week_done: 10, week_due: 20, prev_done: 10, prev_due: 21 }), 'steady');
assert.equal(trendOf({ week_done: 0, week_due: 0, prev_done: 1, prev_due: 2 }), '', 'nothing due: no trend');
assert.equal(ageOf('2026-10-20', now), 2);
assert.equal(ageOf('2026-09-30', { y: 2026, m: 10, d: 1 }), 1, 'across a month');
assert.equal(ageOf(null, now), null);

// Private habits survive validation, sync and merging, and private wins.
const priv = { ...state, private: { [id]: true, 'Bad Id': true, other: 'yes' } };
assert.deepEqual(cleanState(priv).private, { [id]: true }, 'only real ids, only true');
assert.equal('private' in cleanState(state), false, 'left out when there are none');
const rows = stateToRows(cleanState(priv));
assert.equal(rows[`habits|${id}`].row.private, true, 'private goes to the habits table');
const second = state.months['2026-10'].habits[1].id;
assert.equal(rows[`habits|${second}`].row.private, false, 'and so does not private');
const back = rowsToState({ habits: Object.values(rows).filter((r) => r.table === 'habits').map((r) => r.row) });
assert.deepEqual(back.private, { [id]: true }, 'and comes back from it');
assert.deepEqual(mergeStates({ ...back, private: undefined, months: {}, colors: {}, years: {} }, { months: {}, private: { [second]: true } }).private, { [second]: true }, 'private on either side stays private');

console.log('buddies: all checks pass');
