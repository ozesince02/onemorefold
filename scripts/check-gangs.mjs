// Gangs (D-046): what a gang shows is worked out from members' ticks with the tracker's own
// schedule maths; who has folded, who hasn't yet, the stamps, and the gang link through sync.
import assert from 'node:assert/strict';
import { groupGangs, gangStatus, stampRows, namesText, endFor } from '../src/lib/gangs.js';
import { cleanState } from '../src/lib/sanitize.js';
import { stateToRows, rowsToState, mergeStates } from '../src/lib/sync/rows.js';

const G = '00000000-0000-4000-8000-0000000000aa';
const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const row = (n, name, days, extra = {}) => ({
  challenge: G, name: 'Run club', cadence: 'daily', weekdays: null, times_per_week: null, starts: '2026-11-01', ends: '2026-11-30',
  member: id(n), tag_name: name, tag_code: `C${n}0`, joined_at: '2026-11-01T00:00:00Z', owner: n === 1, me: n === 1, linked: true, days, ...extra,
});
const rows = [
  row(1, 'oze', ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05']),
  row(2, 'Asha', ['2026-11-04', '2026-11-05']),
  row(3, 'Ravi', ['2026-11-01']),
  row(4, 'jo', [], { linked: false }),
];
const [gang] = groupGangs([...rows, { ...rows[0], member: 'not-a-uuid' }, { ...rows[1], challenge: G, cadence: 'hourly' }]);
assert.equal(gang.members.length, 4, 'bad rows are dropped');
assert.equal(gang.members[0].owner && gang.members[0].me, true);

// The 5th: oze and Asha folded; Ravi hasn't yet; jo hasn't linked a habit.
let s = gangStatus(gang, { y: 2026, m: 11, d: 5 });
assert.deepEqual([s.phase, s.day, s.length, s.period, s.due], ['on', 5, 30, 'day', true]);
assert.deepEqual(s.folded.map((x) => x.name), ['oze', 'Asha'], 'who folded today');
assert.deepEqual(s.waiting.map((x) => x.name), ['Ravi'], "who hasn't yet");
assert.deepEqual(s.unlinked.map((x) => x.name), ['jo'], 'and who has no habit for it yet, apart');
const oze = s.members[0];
assert.deepEqual([oze.done, oze.due, oze.week], [4, 5, 4], 'oze: 4 of 5 due so far, 4 in the last 7 days');
assert.deepEqual(oze.run, { n: 1, unit: 'day' }, 'the run counts back from today');
assert.deepEqual([s.members[2].done, s.members[2].due], [1, 5], 'Ravi: 1 of 5');
assert.equal(namesText(s.waiting), 'Ravi');
assert.equal(namesText([{ name: 'a' }, { name: 'b' }, { name: 'c' }]), 'a, b and c');
assert.equal(namesText([{ name: 'a' }, { name: 'b' }]), 'a and b');

// Before and after.
assert.equal(gangStatus(gang, { y: 2026, m: 10, d: 30 }).phase, 'soon');
assert.equal(gangStatus(gang, { y: 2026, m: 10, d: 30 }).waiting.length, 0, 'nobody is waited on before it starts');
assert.equal(gangStatus(gang, { y: 2026, m: 10, d: 30 }).folded.length, 0);
s = gangStatus(gang, { y: 2026, m: 12, d: 3 });
assert.deepEqual([s.phase, s.day, s.due], ['over', 30, false], 'over: counted to its last day, nothing due');
assert.equal(s.members[0].due, 30, 'all 30 days were due');

// Chosen days: a rest day asks nobody.
const [gym] = groupGangs([row(1, 'oze', ['2026-11-02'], { cadence: 'weekdays', weekdays: [1, 3, 5] })]);
assert.equal(gangStatus(gym, { y: 2026, m: 11, d: 3 }).due, false, 'Tuesday is a rest day for a Mon/Wed/Fri gang');
assert.equal(gangStatus(gym, { y: 2026, m: 11, d: 3 }).waiting.length, 0, 'and nobody is waited on');
assert.equal(gangStatus(gym, { y: 2026, m: 11, d: 2 }).folded.length, 1, 'Monday: folded');

// Flexible: "folded" means this week's target is met.
const [swim] = groupGangs([
  row(1, 'oze', ['2026-11-01', '2026-11-03', '2026-11-06'], { cadence: 'times_per_week', times_per_week: 3 }),
  row(2, 'Asha', ['2026-11-02'], { cadence: 'times_per_week', times_per_week: 3 }),
]);
s = gangStatus(swim, { y: 2026, m: 11, d: 6 });
assert.equal(s.period, 'week');
assert.deepEqual([s.folded.map((x) => x.name), s.waiting.map((x) => x.name)], [['oze'], ['Asha']], 'three times this week: oze has, Asha not yet');

// Stamps: the last 7 days, each member stamped or not, rest days marked.
const stamps = stampRows(gang, { y: 2026, m: 11, d: 5 });
assert.deepEqual(stamps.map((r) => r.key), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'], 'nothing before the start');
assert.deepEqual(stamps[4].stamped, [true, true, false, false]);
assert.equal(stampRows(gym, { y: 2026, m: 11, d: 5 }).find((r) => r.key === '2026-11-03').rest, true, 'rest days are marked');
assert.equal(endFor('2026-11-01', 7), '2026-11-07', 'a week ends on the 7th day');
assert.equal(endFor('2026-12-28', 7), '2027-01-03', 'across the year');

// The gang link through validation, sync and merging: one habit per gang.
const state = { version: 1, colors: { run: '#C8302C', jog: '#24496B' }, months: {}, years: {}, links: { run: G, jog: G, 'Bad Id': G, walk: 'nope' } };
assert.deepEqual(cleanState(state).links, { run: G }, 'one habit per gang, real ids only');
const r = stateToRows(cleanState(state));
assert.equal(r['habits|run'].row.challenge_id, G);
assert.equal(r['habits|jog'].row.challenge_id, null, 'unlinked habits say so');
assert.deepEqual(rowsToState({ habits: [r['habits|run'].row, r['habits|jog'].row] }).links, { run: G }, 'and the link comes back');
assert.deepEqual(mergeStates({ months: {}, colors: {}, years: {}, links: { run: G } }, { months: {}, links: { jog: G } }).links, { run: G }, "the account's link wins for the same gang");

console.log('gangs: all checks pass');
