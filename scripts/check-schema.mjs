// Runs the Supabase migration on real Postgres (PGlite, in memory) and checks row-level security:
// each user sees and changes only their own rows, signed-out visitors get nothing, and the
// database refuses data the app would refuse. Supabase's auth schema and roles are stood in for.
import assert from 'node:assert/strict';
import { supabaseStandIn } from './lib/supabase-stand-in.mjs';

const { db, as } = await supabaseStandIn();
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const rejects = (p, pattern, message) => assert.rejects(p, pattern, message);

// New accounts get a profile from the trigger.
await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com')`);
assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n, 2, 'a profile per new account');

// A fills in a month the way the app will.
await as(A, `insert into public.habits (user_id, slug, color) values ($1, 'german', '#C8302C'), ($1, 'dsa', '#E9B33F')`, [A]);
await as(A, `insert into public.months (user_id, month) values ($1, '2026-10-01')`, [A]);
await as(A, `insert into public.habit_months (user_id, slug, month, name, goal, time, cadence, weekdays) values
  ($1, 'german', '2026-10-01', 'German', 20, '07:00', 'daily', null),
  ($1, 'dsa', '2026-10-01', 'DSA', 8, null, 'weekdays', '{1,3}')`, [A]);
await as(A, `insert into public.ticks (user_id, slug, day) values ($1, 'german', '2026-10-01'), ($1, 'german', '2026-10-02'), ($1, 'dsa', '2026-10-05')`, [A]);
await as(A, `insert into public.years (user_id, year, wish) values ($1, 2026, 'a trip to Kyoto')`, [A]);
await as(A, `update public.profiles set prefs = '{"percentView":"goal"}' where id = $1`, [A]);
assert.equal((await as(A, 'select count(*)::int as n from public.ticks')).rows[0].n, 3, 'A sees their ticks');
assert.equal((await as(A, `select month::text from public.ticks where day = '2026-10-05'`)).rows[0].month, '2026-10-01', 'month is derived from the day');

// B sees none of it and can't touch it.
for (const t of ['profiles', 'years', 'habits', 'months', 'habit_months', 'ticks']) {
  const where = t === 'profiles' ? `id = '${A}'` : `user_id = '${A}'`;
  assert.equal((await as(B, `select count(*)::int as n from public.${t} where ${where}`)).rows[0].n, 0, `B can't read A's ${t}`);
}
assert.equal((await as(B, `update public.years set wish = 'hacked' where user_id = $1`, [A])).affectedRows, 0, 'B can\'t update A\'s rows');
assert.equal((await as(B, `delete from public.ticks where user_id = $1`, [A])).affectedRows, 0, 'B can\'t delete A\'s rows');
await rejects(as(B, `insert into public.habits (user_id, slug) values ($1, 'planted')`, [A]), /row-level security/, 'B can\'t write rows as A');
await rejects(as(B, `update public.habits set user_id = $1 where user_id = $1`, [B]).then(() => as(B, `insert into public.years (user_id, year) values ($1, 2026)`, [A])), /row-level security/, 'B can\'t give rows to A');
assert.equal((await as(A, 'select wish from public.years where year = 2026')).rows[0].wish, 'a trip to Kyoto', 'A\'s data untouched');

// Signed-out visitors: no access at all.
for (const t of ['profiles', 'years', 'habits', 'months', 'habit_months', 'ticks']) {
  await rejects(as('anon', `select * from public.${t}`), /permission denied/, `anon can't read ${t}`);
}
await rejects(as('anon', `insert into public.habits (user_id, slug) values ($1, 'x')`, [A]), /permission denied/, 'anon can\'t write');
await rejects(as(A, 'delete from public.profiles'), /permission denied/, 'a profile can\'t be deleted by its user');

// The database refuses what the app refuses.
const bad = [
  [`insert into public.habits (user_id, slug) values ($1, 'Bad Slug"')`, 'slug format'],
  [`insert into public.habits (user_id, slug, color) values ($1, 'ok', 'red;')`, 'colour format'],
  [`insert into public.months (user_id, month) values ($1, '2026-10-15')`, 'months start on the 1st'],
  [`insert into public.habit_months (user_id, slug, month, name) values ($1, 'german', '2026-10-01', '')`, 'empty name'],
  [`insert into public.habit_months (user_id, slug, month, name) values ($1, 'dsa', '2026-11-01', 'DSA')`, 'habit month needs its month'],
  [`update public.habit_months set name = repeat('x', 121) where slug = 'german'`, 'name length'],
  [`update public.habit_months set goal = 99 where slug = 'german'`, 'goal range'],
  [`update public.habit_months set weekdays = '{0,8}' where slug = 'dsa'`, 'weekday range'],
  [`update public.habit_months set cadence = 'hourly' where slug = 'dsa'`, 'known cadences only'],
  [`insert into public.ticks (user_id, slug, day) values ($1, 'german', '2026-11-03')`, 'tick needs the habit in that month'],
  [`update public.years set wish = repeat('x', 201) where year = 2026`, 'wish length'],
  [`update public.profiles set prefs = '[1]' where id = $1`, 'prefs must be an object'],
];
for (const [sql, what] of bad) {
  await rejects(as(A, sql, sql.includes('$1') ? [A] : []), /violates|constraint|invalid/, `refused: ${what}`);
}

// Limits: 50 habits a month.
await as(A, `insert into public.habits (user_id, slug) select $1, 'h' || g from generate_series(1, 49) g`, [A]);
await as(A, `insert into public.habit_months (user_id, slug, month, name) select $1, 'h' || g, '2026-10-01', 'Habit ' || g from generate_series(1, 48) g`, [A]);
await rejects(as(A, `insert into public.habit_months (user_id, slug, month, name) values ($1, 'h49', '2026-10-01', 'one too many')`, [A]), /50 habits per month/, 'at most 50 habits a month');

// updated_at moves on update.
const before = (await as(A, `select updated_at from public.years where year = 2026`)).rows[0].updated_at;
await new Promise((r) => setTimeout(r, 5));
await as(A, `update public.years set wish = 'Kyoto in spring' where year = 2026`);
assert.ok((await as(A, `select updated_at from public.years where year = 2026`)).rows[0].updated_at > before, 'updated_at is set by the database');

// Sync channel (D-020): each person can listen and send only on their own topic.
const onTopic = async (who, topic, sql, params = []) => {
  await db.query(`select set_config('realtime.topic', $1, false)`, [topic]);
  return as(who, sql, params);
};
await db.exec(`insert into realtime.messages (topic, extension) values ('user:${A}', 'broadcast'), ('user:${B}', 'broadcast')`);
assert.equal((await onTopic(A, `user:${A}`, 'select count(*)::int as n from realtime.messages')).rows[0].n, 2, 'A can listen on their own topic');
assert.equal((await onTopic(A, `user:${B}`, 'select count(*)::int as n from realtime.messages')).rows[0].n, 0, "A can't listen on B's topic");
await onTopic(A, `user:${A}`, `insert into realtime.messages (topic, extension) values ($1, 'broadcast')`, [`user:${A}`]);
await rejects(onTopic(A, `user:${B}`, `insert into realtime.messages (topic, extension) values ($1, 'broadcast')`, [`user:${B}`]), /row-level security/, "A can't send on B's topic");
await rejects(onTopic('anon', `user:${A}`, 'select * from realtime.messages'), /permission denied/, "anon can't listen");

// Closed-app reminders (D-028): devices, settings and the send log.
const key = 'B' + 'x'.repeat(85);           // 87 characters, like a P-256 public key
const secret = 'y'.repeat(22);              // 22 characters, like 16 random bytes
const fcm = (n) => `https://fcm.googleapis.com/fcm/send/device-${n}:APA91b_token`;
await as(A, 'select public.register_push($1, $2, $3)', [fcm(1), key, secret]);
assert.equal((await as(A, 'select count(*)::int as n from public.push_subscriptions')).rows[0].n, 1, 'A signs a device up');
assert.equal((await as(A, 'select reminders from public.push_settings')).rows[0].reminders, false, 'signing up makes settings, reminders off until asked');
assert.equal((await as(B, 'select count(*)::int as n from public.push_subscriptions')).rows[0].n, 0, "B can't see A's devices");
assert.equal((await as(B, 'select count(*)::int as n from public.push_settings')).rows[0].n, 0, "B can't see A's settings");
assert.equal((await as(B, 'delete from public.push_subscriptions')).affectedRows, 0, "B can't remove A's devices");
await rejects(as(A, 'insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)', [A, fcm(2), key, secret]), /permission denied/, 'devices are added only through register_push');
await rejects(as('anon', 'select public.register_push($1, $2, $3)', [fcm(3), key, secret]), /permission denied/, "anon can't sign a device up");
for (const t of ['push_settings', 'push_subscriptions', 'push_log']) {
  await rejects(as('anon', `select * from public.${t}`), /permission denied/, `anon can't read ${t}`);
}
await rejects(as(A, 'select * from public.push_log'), /permission denied/, 'the send log is for the sender only');
// The same browser, signed in as someone else later: the address moves to the new account.
await as(B, 'select public.register_push($1, $2, $3)', [fcm(1), key, secret]);
assert.equal((await as(A, 'select count(*)::int as n from public.push_subscriptions')).rows[0].n, 0, 'a browser belongs to whoever signed it up last');
assert.equal((await as(B, 'select count(*)::int as n from public.push_subscriptions')).rows[0].n, 1, 'and now it is B\'s');
// At most ten devices: the oldest makes room.
for (let n = 10; n < 22; n++) await as(A, 'select public.register_push($1, $2, $3)', [fcm(n), key, secret]);
assert.equal((await as(A, 'select count(*)::int as n from public.push_subscriptions')).rows[0].n, 10, 'at most ten devices a person');
assert.equal((await as(A, 'select count(*)::int as n from public.push_subscriptions where endpoint = $1', [fcm(21)])).rows[0].n, 1, 'the newest stays');
// Settings: own row only, and only sane values.
await as(A, `update public.push_settings set reminders = true, off = '{german,dsa}', time_zone = 'Asia/Kolkata'`);
assert.deepEqual((await as(A, 'select off from public.push_settings')).rows[0].off, ['german', 'dsa'], 'A switches habits off');
const badPush = [
  ['select public.register_push($1, $2, $3)', ['https://evil.example.com/collect', key, secret], 'only real push services'],
  ['select public.register_push($1, $2, $3)', ['http://fcm.googleapis.com/fcm/send/x', key, secret], 'https only'],
  ['select public.register_push($1, $2, $3)', [fcm(99), 'short', secret], 'a real public key'],
  ['select public.register_push($1, $2, $3)', [fcm(99), key, 'bad secret!'], 'a real auth secret'],
  [`update public.push_settings set off = '{"Bad Slug"}'`, [], 'habit ids only'],
  [`update public.push_settings set off = '{"a,b"}'`, [], 'no commas smuggled into an id'],
  [`update public.push_settings set time_zone = 'Asia/Kolkata; drop table x'`, [], 'time zone names only'],
];
for (const [sql, params, what] of badPush) {
  await rejects(as(A, sql, params), /violates|constraint|invalid/, `refused: ${what}`);
}
await rejects(as(B, `insert into public.push_settings (user_id) values ($1)`, [A]), /row-level security|duplicate/, "B can't write A's settings");

// Daily summary and weekly recap (D-042): two switches, off by default, and a time on the half hour.
assert.deepEqual((await as(A, 'select daily, weekly, summary_time::text as t from public.push_settings')).rows[0], { daily: false, weekly: false, t: '21:30:00' }, 'summaries start off, at 21:30');
await as(A, `update public.push_settings set daily = true, weekly = true, summary_time = '20:00'`);
assert.equal((await as(A, 'select summary_time::text as t from public.push_settings')).rows[0].t, '20:00:00', 'A picks 20:00');
await rejects(as(A, `update public.push_settings set summary_time = '20:15'`), /violates|constraint/, 'refused: summaries arrive on the hour or half hour');
await rejects(as(A, `update public.push_settings set summary_time = '20:30:10'`), /violates|constraint/, 'refused: no seconds');
assert.equal((await as(B, `update public.push_settings set daily = false where user_id = $1`, [A])).affectedRows, 0, "B can't switch off A's summaries");
await db.query(`insert into public.push_log (user_id, kind, slug, day) values ($1, 'daily', 'summary', '2026-10-28'), ($1, 'weekly', 'week-recap', '2026-10-25')`, [A]);
await rejects(db.query(`insert into public.push_log (user_id, kind, slug, day) values ($1, 'monthly', 'summary', '2026-10-28')`, [A]), /violates|constraint/, 'refused: only reminders, summaries and recaps are logged');

// Done and Later on closed-app reminders (D-039): one-time tokens, used only by the service role.
const hashOf = (n) => n.toString(16).padStart(64, '0');
const addToken = (n, slug, day, extra = '') => db.query(`insert into public.push_actions (token_hash, user_id, slug, day, expires_at${extra ? ', created_at' : ''}) values ($1, $2, $3, $4, ${extra || "now() + interval '1 day'"}${extra ? ", now() - interval '3 days'" : ''})`, [hashOf(n), A, slug, day]);
const act = async (n, what) => (await db.query('select public.act_on_reminder($1, $2) as r', [hashOf(n), what])).rows[0].r;
await db.query(`insert into public.push_log (user_id, kind, slug, day) values ($1, 'remind', 'german', '2026-10-28')`, [A]);
await addToken(1, 'german', '2026-10-28');
await rejects(as(A, 'select * from public.push_actions'), /permission denied/, 'tokens are for the server only');
await rejects(as(A, 'select public.act_on_reminder($1, $2)', [hashOf(1), 'done']), /permission denied/, "a signed-in person can't call act_on_reminder");
await rejects(as('anon', 'select public.act_on_reminder($1, $2)', [hashOf(1), 'done']), /permission denied/, "nor can a visitor");
assert.equal(await act(1, 'done'), 'done', 'Done with a fresh token');
assert.equal((await db.query(`select count(*)::int as n from public.ticks where user_id = $1 and slug = 'german' and day = '2026-10-28'`, [A])).rows[0].n, 1, 'Done ticks the habit for that day');
assert.equal(await act(1, 'done'), 'gone', 'a token works once');
assert.equal(await act(999, 'done'), 'gone', 'an unknown token does nothing');
await addToken(2, 'german', '2026-10-28');
assert.equal(await act(2, 'later'), 'later', 'Later with a fresh token');
assert.ok((await db.query(`select remind_again_at from public.push_log where user_id = $1 and slug = 'german' and day = '2026-10-28'`, [A])).rows[0].remind_again_at, 'Later queues the reminder again');
await addToken(3, 'german', '2026-10-27', "now() - interval '2 days'");
assert.equal(await act(3, 'done'), 'gone', 'an expired token does nothing');
await addToken(4, 'ghost', '2026-10-28');
assert.equal(await act(4, 'done'), 'gone', 'Done for a habit that no longer exists changes nothing');
await addToken(5, 'german', '2026-10-28');
await rejects(db.query('select public.act_on_reminder($1, $2)', [hashOf(5), 'delete']), /unknown action/, 'only Done and Later');
assert.equal(await act(5, 'done'), 'done', 'and a refused action leaves the token usable');
await db.query(`update public.push_log set remind_again_at = null, sends = 3 where user_id = $1 and slug = 'german'`, [A]);
await addToken(6, 'german', '2026-10-28');
assert.equal(await act(6, 'later'), 'last', 'Later on the third send says it was the last');
assert.equal((await db.query(`select remind_again_at from public.push_log where user_id = $1 and slug = 'german'`, [A])).rows[0].remind_again_at, null, 'Later stops after three sends of the same reminder');
const badActions = [
  [`insert into public.push_actions (token_hash, user_id, slug, day, expires_at) values ('not-hex', $1, 'german', '2026-10-28', now() + interval '1 day')`, 'token hashes are hex'],
  [`insert into public.push_actions (token_hash, user_id, slug, day, expires_at) values ($2, $1, 'german', '2026-10-28', now() + interval '9 days')`, 'tokens live two days at most'],
  [`update public.push_log set sends = 4 where user_id = $1`, 'at most three sends'],
];
for (const [sql, what] of badActions) {
  await rejects(db.query(sql, sql.includes('$2') ? [A, hashOf(77)] : [A]), /violates|constraint/, `refused: ${what}`);
}

// Removing a habit from a month removes its ticks; deleting the account removes everything.
await as(A, `delete from public.habit_months where slug = 'dsa' and month = '2026-10-01'`);
assert.equal((await as(A, `select count(*)::int as n from public.ticks where slug = 'dsa'`)).rows[0].n, 0, 'ticks go with their habit month');
// "Delete my account" (D-025): only the caller, only when signed in.
await rejects(as('anon', 'select public.delete_my_account()'), /permission denied/, "anon can't call delete_my_account");
await as(B, 'select public.delete_my_account()');
assert.equal((await db.query(`select count(*)::int as n from auth.users where id = '${B}'`)).rows[0].n, 0, 'B deleted their own account');
assert.equal((await db.query(`select count(*)::int as n from auth.users where id = '${A}'`)).rows[0].n, 1, "and A's is untouched");
assert.ok((await db.query(`select count(*)::int as n from public.ticks where user_id = '${A}'`)).rows[0].n > 0, "A's ticks are untouched");
await as(A, 'select public.delete_my_account()');
assert.equal((await db.query(`select count(*)::int as n from public.profiles where id = '${A}'`)).rows[0].n, 0, 'account deletion clears the profile');
for (const t of ['years', 'habits', 'months', 'habit_months', 'ticks', 'push_settings', 'push_subscriptions', 'push_log', 'push_actions']) {
  assert.equal((await db.query(`select count(*)::int as n from public.${t} where user_id = '${A}'`)).rows[0].n, 0, `account deletion clears ${t}`);
}
await rejects(as(A, `insert into public.years (user_id, year) values ($1, 2027)`, [A]), /foreign key/, "a deleted account can't write again with its old token");

await db.close();
console.log('schema: all checks pass');
