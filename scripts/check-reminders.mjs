// Checks when reminders fire, against the example October (src/data/sample.js; 23 October has no
// ticks yet). Times: bed 07:00, stretch 07:30, walk 18:30, skill 20:00, learn 21:00, read 23:00.
import assert from 'node:assert/strict';
import { SAMPLE_MONTHS } from '../src/data/sample.js';
import { dueReminders, nextReminder, logKey, upcomingReminders, pushText } from '../src/lib/reminders-core.js';
import { wallClock } from '../src/lib/dates.js';

const months = { '2026-10': { habits: SAMPLE_MONTHS['2026-10'], checks: Object.fromEntries(SAMPLE_MONTHS['2026-10'].map((h) => [h.id, [...h.days]])) } };
const state = (reminders) => ({ months: structuredClone(months), reminders });
const at = (h, m) => new Date(2026, 9, 23, h, m);
const ids = (list) => list.map((x) => x.habit.id).join(',');

assert.equal(ids(dueReminders(state({ enabled: false }), at(7, 0))), '', 'off means nothing fires');
assert.equal(ids(dueReminders(state({ enabled: true }), at(6, 59))), '', 'nothing before 07:00');
assert.equal(ids(dueReminders(state({ enabled: true }), at(7, 0))), 'bed', 'the bed at 07:00');
assert.equal(ids(dueReminders(state({ enabled: true }), at(7, 40))), 'bed,stretch', 'both morning habits by 07:40');
assert.equal(dueReminders(state({ enabled: true }), at(7, 40))[0].late, true, 'The bed is late at 07:40');
assert.equal(ids(dueReminders(state({ enabled: true }), at(9, 31))), '', 'gone after the two-hour window');
assert.equal(ids(dueReminders(state({ enabled: true, lead: 10 }), at(20, 50))), 'skill,learn', 'Learning 10 minutes early at 20:50');
assert.equal(ids(dueReminders(state({ enabled: true, off: { learn: true } }), at(21, 0))), 'skill', 'switched-off habit stays quiet');

const fired = state({ enabled: true, log: { [logKey(at(7, 0), 'bed')]: { firedAt: 1 } } });
assert.equal(ids(dueReminders(fired, at(7, 5))), '', 'fires once');
const snoozed = state({ enabled: true, log: { [logKey(at(7, 0), 'bed')]: { firedAt: 1, snoozeUntil: at(7, 10).getTime() } } });
assert.equal(ids(dueReminders(snoozed, at(7, 9))), '', 'snoozed until 07:10');
assert.equal(ids(dueReminders(snoozed, at(7, 10))), 'bed', 'back at 07:10');

const ticked = state({ enabled: true });
ticked.months['2026-10'].checks.bed.push(23);
assert.equal(ids(dueReminders(ticked, at(7, 0))), '', 'already done today: no nudge');
assert.equal(nextReminder(state({ enabled: true }), at(12, 0)).habit.id, 'walk', 'next after noon is the walk at 18:30');

// Closed-app reminders (D-028): each half-hour run covers (slot, slot + 30].
const soon = (h, m, off) => upcomingReminders(state({ enabled: false }), at(h, m), off).map((x) => x.id).join(',');
assert.equal(soon(6, 30), 'bed', 'the 06:30 run reminds the bed at 07:00, half an hour early');
assert.equal(soon(7, 0), 'stretch', 'the 07:00 run covers 07:01 to 07:30, not the bed again');
assert.equal(soon(6, 47), 'bed', 'a run that starts late still covers its own half hour');
assert.equal(soon(6, 30, { bed: true }), '', 'a habit switched off stays quiet');
assert.equal(soon(19, 30), 'skill', 'Practising a skill at 20:00 from the 19:30 run');
assert.equal(soon(20, 30), 'learn', 'Learning at 21:00 from the 20:30 run');
assert.equal(soon(22, 30), 'read', 'Reading at 23:00 from the 22:30 run');
assert.equal(upcomingReminders(ticked, at(6, 30)).length, 0, 'already done today: no push');
const midnight = state({ enabled: false });
midnight.months['2026-10'].habits.find((h) => h.id === 'bed').time = '00:00';
assert.equal(upcomingReminders(midnight, at(0, 0)).map((x) => x.id).join(','), 'bed', 'a habit at 00:00 belongs to the 00:00 run');
assert.equal(upcomingReminders(midnight, at(23, 30)).map((x) => x.id).join(','), '', 'and not to the evening before');
assert.deepEqual(pushText({ name: 'Make your bed', time: '07:00' }), { title: 'Make your bed · 07:00', body: 'Next up: Make your bed at 07:00.' });
assert.match(pushText({ name: 'Walk outside', time: '18:30', cadence: 'times_per_week', timesPerWeek: 3 }).body, /Any day this week counts/);

// The sender runs in UTC; people live in their own time zones.
const instant = new Date(Date.UTC(2026, 9, 28, 1, 30)); // 01:30 UTC
const kolkata = wallClock(instant, 'Asia/Kolkata');
assert.deepEqual([kolkata.getDate(), kolkata.getHours(), kolkata.getMinutes()], [28, 7, 0], '01:30 UTC is 07:00 in Kolkata');
const la = wallClock(instant, 'America/Los_Angeles');
assert.deepEqual([la.getDate(), la.getHours(), la.getMinutes()], [27, 18, 30], 'and 18:30 the evening before in Los Angeles');
assert.throws(() => wallClock(instant, 'Not/A_Zone'), RangeError, 'an unknown zone is refused, not guessed');

// On by default (D-043): who gets signed up without a prompt, and who gets the invitation.
const { shouldAutoEnable, shouldInvite, INVITE_DAYS } = await import('../src/lib/push-default.js');
const device = { signedIn: true, supported: true, state: 'off', permission: 'granted', homeScreen: false, choice: null, timed: true, until: 0, now: 1e12 };
assert.equal(shouldAutoEnable(device), true, 'notifications already allowed here: on without asking');
assert.equal(shouldAutoEnable({ ...device, choice: 'off' }), false, 'but never after someone turned them off on this device');
assert.equal(shouldAutoEnable({ ...device, signedIn: false }), false, 'only for a signed-in person');
assert.equal(shouldAutoEnable({ ...device, state: 'on' }), false, 'nothing to do when already on');
assert.equal(shouldAutoEnable({ ...device, permission: 'default' }), false, 'never without the browser\'s permission');
assert.equal(shouldAutoEnable({ ...device, homeScreen: true }), false, 'not on an iPhone outside the Home Screen');
const asked = { ...device, permission: 'default' };
assert.equal(shouldInvite(asked), true, 'not asked yet: invite');
assert.equal(shouldInvite({ ...asked, timed: false }), false, 'not before any habit has a time');
assert.equal(shouldInvite({ ...asked, until: asked.now + 1 }), false, '"in 3 days" keeps it away until then');
assert.equal(shouldInvite({ ...asked, until: asked.now - 1 }), true, 'and it comes back after');
assert.equal(shouldInvite({ ...asked, permission: 'denied' }), false, 'never once notifications are blocked');
assert.equal(shouldInvite({ ...asked, choice: 'off' }), false, 'never after someone turned them off');
assert.equal(shouldInvite(device), false, 'no invitation where they can simply be switched on');
assert.equal(INVITE_DAYS, 3);
console.log('reminders: all checks pass');
