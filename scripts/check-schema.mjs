// Runs the Supabase migration on real Postgres (PGlite, in memory) and checks row-level security:
// each user sees and changes only their own rows, signed-out visitors get nothing, and the
// database refuses data the app would refuse. Supabase's auth schema and roles are stood in for.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { supabaseStandIn } from './lib/supabase-stand-in.mjs';

const { db, as, addUser } = await supabaseStandIn();
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

// Buddies (D-029, D-044, D-045): tags, invites, the pair, and what each level lets a buddy see.
const C = '00000000-0000-4000-8000-00000000000c';
await addUser(C);
const tag = async (who, name, code) => (await as(who, 'select public.set_my_tag($1, $2) as r', [name, code])).rows[0].r;
assert.equal(await tag(A, 'Asha Rao', 'run'), 'ok', 'A picks a tag');
assert.deepEqual((await as(A, 'select tag_name, tag_code from public.profiles')).rows[0], { tag_name: 'Asha Rao', tag_code: 'RUN' }, 'codes are kept in capitals');
assert.equal(await tag(B, 'asha rao', 'RUN'), 'taken', 'no two people share a tag, ignoring capitals');
assert.equal(await tag(B, 'asha rao', '4410'), 'ok', 'the same name with another code is fine');
assert.equal(await tag(B, 'Ravi', '4410'), 'ok', 'and a tag can change');
for (const [name, code, what] of [
  ['ab', '1000', 'names are at least 3 characters'],
  ['a'.repeat(17), '1000', 'and at most 16'],
  [' oze', '1000', 'no leading space'],
  ['o  ze', '1000', 'no double spaces'],
  ['oze<b>', '1000', 'no symbols'],
  ['oze‮', '1000', 'no direction-changing characters'],
  ['o​ze', '1000', 'no invisible characters'],
  ['oze\u{1F600}', '1000', 'no emoji'],
  ['One More Fold', '1000', 'nobody passes as the team'],
  ['Admin', '1000', 'or as an admin'],
  ['oze', '10', 'codes are 3 to 5 characters'],
  ['oze', '10-00', 'letters and numbers only'],
  ['oze', null, 'a tag has both halves'],
]) {
  await rejects(as(C, 'select public.set_my_tag($1, $2)', [name, code]), /violates|constraint|needs/, `refused: ${what}`);
}
assert.equal(await tag(C, 'मीरा', '0712'), 'ok', 'names can be in any language');
await rejects(as('anon', 'select public.set_my_tag($1, $2)', ['anon', '1000']), /permission denied/, "visitors can't pick a tag");
assert.equal((await as(B, 'select count(*)::int as n from public.profiles where id = $1', [A])).rows[0].n, 0, "B still can't read A's profile");

// Invites: stored as a hash, used once.
// Cards are 43-character secrets; the database stores only their SHA-256 (since D-046).
const h = (n) => n.toString(16).padStart(43, 'a');
const hashed = (n) => createHash('sha256').update(h(n)).digest('hex');
const peek = async (who, n) => (await as(who, 'select * from public.peek_invite($1)', [h(n)])).rows[0];
const accept = async (who, n, level = 'doing') => (await as(who, 'select public.accept_invite($1, $2) as r', [h(n), level])).rows[0].r;
await as(A, 'select public.create_invite($1)', [h(1)]);
assert.equal((await as(A, 'select count(*)::int as n from public.invites')).rows[0].n, 1, 'A sees their open invite');
assert.equal((await as(B, 'select count(*)::int as n from public.invites')).rows[0].n, 0, "B can't list A's invites");
await rejects(as(B, "insert into public.invites (token_hash, user_id, expires_at) values ($1, $2, now() + interval '30 days')", [hashed(9), B]), /permission denied/, 'invites are made only through create_invite');
await rejects(as('anon', 'select * from public.peek_invite($1)', [h(1)]), /permission denied/, 'visitors must sign in to open a card');
const card1 = await peek(B, 1);
assert.deepEqual([card1.state, card1.kind, card1.tag_name, card1.tag_code], ['ok', 'buddy', 'Asha Rao', 'RUN'], 'B sees who sent the card');
assert.equal(card1.gang_name, null, 'a buddy card says nothing about gangs');
await rejects(as(B, 'select * from public.peek_invite($1)', [hashed(1)]), /not a card/, 'the stored hash is not a card');
assert.equal((await peek(A, 1)).state, 'self', 'your own card');
assert.equal((await peek(B, 77)).state, 'gone', 'an unknown card');
assert.equal(await accept(A, 1), 'self', "A can't befriend A");
await rejects(as(B, 'select public.accept_invite($1, $2)', [h(1), 'everything']), /unknown level/, 'only the three levels');
assert.equal(await accept(B, 1, 'none'), 'ok', 'B swaps cards, sharing nothing back');
assert.equal(await accept(C, 1), 'gone', 'a card works once');
assert.deepEqual((await as(A, 'select buddy_id, level from public.buddies')).rows, [{ buddy_id: B, level: 'doing' }], "the sender starts at How I'm doing");
assert.deepEqual((await as(B, 'select buddy_id, level from public.buddies')).rows, [{ buddy_id: A, level: 'none' }], 'B chose Just buddies');
await as(C, 'update public.profiles set tag_name = null, tag_code = null');
await rejects(as(C, 'select public.create_invite($1)', [h(3)]), /tag first/, 'no card without a tag');
await tag(C, 'मीरा', '0712');
await as(C, 'select public.create_invite($1)', [h(2)]);
assert.equal(await accept(B, 2), 'ok', 'B and C become buddies too');
assert.equal((await peek(A, 2)).state, 'gone', 'used cards say nothing');
await as(A, 'select public.create_invite($1)', [h(4)]);
assert.equal((await peek(C, 4)).state, 'ok', 'C can open a card from A');
await as(A, 'select public.create_invite($1)', [h(5)]);
assert.equal(await accept(C, 5), 'ok', 'and A and C become buddies');
assert.equal((await peek(C, 4)).state, 'already', 'already buddies');
assert.equal(await accept(C, 4), 'already', 'and accepting again changes nothing');
await as(C, 'select public.decline_invite($1)', [h(4)]);
assert.equal((await peek(B, 4)).state, 'gone', 'a declined card stops working');
await as(A, 'select public.create_invite($1)', [h(6)]);
await db.query("update public.invites set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where token_hash = $1", [hashed(6)]);
assert.equal((await peek(B, 6)).state, 'gone', 'cards expire after 7 days');
for (let n = 10; n < 20; n++) await as(A, 'select public.create_invite($1)', [h(n)]);
await rejects(as(A, 'select public.create_invite($1)', [h(20)]), /10 open invites/, 'at most 10 open invites');
await rejects(db.query("insert into public.invites (token_hash, user_id, expires_at) values ('not-a-hash', $1, now())", [A]), /violates/, 'refused: invites store a SHA-256 hash');
await rejects(db.query("insert into public.invites (token_hash, user_id, expires_at) values ($2, $1, now() + interval '30 days')", [A, hashed(30)]), /violates/, 'refused: invites last 7 days at most');
assert.equal((await as(A, 'delete from public.invites where token_hash = $1', [hashed(10)])).affectedRows, 1, 'A takes a card back');

// Sharing: each side sets only its own direction, and only the level and habits.
await as(A, "update public.buddies set level = 'habits', habits = '{german,dsa}' where buddy_id = $1", [B]);
assert.equal((await as(B, "update public.buddies set level = 'habits' where user_id = $1", [A])).affectedRows, 0, "B can't change what A shares");
await rejects(as(B, 'update public.buddies set buddy_id = $1 where buddy_id = $2', [C, A]), /permission denied/, "B can't move a pairing to someone else");
await rejects(as(B, 'insert into public.buddies (user_id, buddy_id) values ($1, $2)', [B, A]), /permission denied/, 'pairs are made only by accepting a card');
await rejects(as(A, "update public.buddies set habits = '{\"Bad Slug\"}' where buddy_id = $1", [B]), /violates/, 'refused: habit ids only');
await rejects(as(A, "update public.buddies set level = 'all' where buddy_id = $1", [B]), /violates/, 'refused: known levels only');

// Figures: your own row only, and only the agreed shape.
const fig = (habits) => ({ as_of: '2026-10-28', week_done: 18, week_due: 24, prev_done: 12, prev_due: 24, month_done: 70, month_due: 100, run: 9, habits: JSON.stringify(habits) });
const putFig = (who, f, owner = who) => as(who, `insert into public.buddy_figures (user_id, as_of, week_done, week_due, prev_done, prev_due, month_done, month_due, run, habits)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (user_id) do update set habits = excluded.habits, week_done = excluded.week_done`,
[owner, f.as_of, f.week_done, f.week_due, f.prev_done, f.prev_due, f.month_done, f.month_due, f.run, f.habits]);
await putFig(A, fig([{ slug: 'german', name: 'German', done: 12, due: 18 }, { slug: 'dsa', name: 'DSA', done: 3, due: 4 }]));
await rejects(putFig(B, fig([]), A), /row-level security/, "B can't write A's figures");
assert.equal((await as(B, 'select count(*)::int as n from public.buddy_figures')).rows[0].n, 0, "B can't read A's figures directly");
for (const [habits, what] of [
  [[{ slug: 'german', name: 'German', done: 12, due: 18, extra: 'x' }], 'no extra fields'],
  [[{ slug: 'Bad Slug', name: 'German', done: 1, due: 2 }], 'habit ids only'],
  [[{ slug: 'german', name: '', done: 1, due: 2 }], 'a name'],
  [[{ slug: 'german', name: 'German', done: 5, due: 2 }], 'done never above due'],
  [[{ slug: 'german', name: 'German', done: '1', due: 2 }], 'numbers are numbers'],
  [['german'], 'objects only'],
]) {
  await rejects(putFig(A, fig(habits)), /violates|must be/, `refused figures: ${what}`);
}
await rejects(putFig(A, { ...fig([]), week_done: 30 }), /violates/, 'refused: done above due');

// What a buddy sees.
const look = async (who, buddy) => (await as(who, 'select * from public.my_buddies() where buddy = $1', [buddy])).rows[0];
let seen = await look(B, A);
assert.equal(seen.tag_name, 'Asha Rao', 'B sees A by tag');
assert.equal(seen.their_level, 'habits', 'at the level A chose');
assert.deepEqual([seen.week_done, seen.week_due, seen.run], [18, 24, 9], "and A's totals");
assert.deepEqual(seen.habits, [{ name: 'DSA', done: 3, due: 4 }, { name: 'German', done: 12, due: 18 }], 'and the habits A picked');
assert.deepEqual((await look(C, A)).habits, [], "C, at How I'm doing, sees no habit names");
await as(A, "update public.habits set private = true where slug = 'dsa'");
seen = await look(B, A);
assert.deepEqual(seen.habits.map((x) => x.name), ['German'], 'a private habit never shows, even if picked');
await as(A, "update public.buddies set level = 'doing' where buddy_id = $1", [B]);
seen = await look(B, A);
assert.deepEqual(seen.habits, [], "How I'm doing: no habit names");
assert.equal(seen.week_done, 18, 'but the totals');
await as(A, "update public.buddies set level = 'none' where buddy_id = $1", [B]);
seen = await look(B, A);
assert.deepEqual([seen.week_done, seen.as_of, seen.run, seen.habits], [null, null, null, []], 'Just buddies: nothing about habits');
assert.equal((await look(A, B)).their_level, 'none', 'and B shares nothing back, as chosen');
await rejects(as('anon', 'select * from public.my_buddies()'), /permission denied/, 'visitors see nothing');

// Removing: both directions, at once, by either side.
await as(A, "update public.buddies set level = 'habits' where buddy_id = $1", [B]);
await as(B, 'select public.remove_buddy($1)', [A]);
assert.equal(await look(B, A), undefined, 'B no longer sees A');
assert.equal(await look(A, B), undefined, 'nor A sees B');
assert.equal((await db.query('select count(*)::int as n from public.buddies where (user_id = $1 and buddy_id = $2) or (user_id = $2 and buddy_id = $1)', [A, B])).rows[0].n, 0, 'both rows are gone');
assert.ok(await look(B, C), "other pairs aren't touched");
assert.equal(await look(B, A), undefined, 'and a stranger (A to B now) sees nothing');
// Half a pair (only possible by hand) shows nothing.
await db.query('delete from public.buddies where user_id = $1 and buddy_id = $2', [C, A]);
assert.equal(await look(A, C), undefined, 'a pair needs both rows');

// Gangs (D-030, D-044, D-046): a habit taken on together, each ticking their own; members see each
// other's ticks on that one habit between the gang's dates, and nothing else.
const T = (await db.query('select current_date::text as d')).rows[0].d;
const M = `${T.slice(0, 8)}01`;
const plus = async (n) => (await db.query('select (current_date + $1::int)::text as d', [n])).rows[0].d;
const habitIn = async (who, slug, gang = null) => {
  await as(who, 'insert into public.habits (user_id, slug, challenge_id) values ($1, $2, $3) on conflict (user_id, slug) do update set challenge_id = excluded.challenge_id', [who, slug, gang]);
  await as(who, 'insert into public.months (user_id, month) values ($1, $2) on conflict do nothing', [who, M]);
  await as(who, 'insert into public.habit_months (user_id, slug, month, name) values ($1, $2, $3, $2) on conflict do nothing', [who, slug, M]);
};
const linkOf = async (who, slug) => (await as(who, 'select challenge_id from public.habits where slug = $1', [slug])).rows[0]?.challenge_id ?? null;
const gangs = async (who) => (await as(who, 'select * from public.my_gangs()')).rows;
const makeGang = async (who, name = 'Run club', cadence = 'daily', weekdays = null, times = null, from = 0, to = 29) =>
  (await as(who, 'select public.create_gang($1, $2, $3, $4, $5, $6) as id', [name, cadence, weekdays, times, await plus(from), await plus(to)])).rows[0].id;

await as(A, 'delete from public.invites'); // A's buddy cards from above would hit the limit of 10
const run = await makeGang(A);
assert.match(run, /^[0-9a-f-]{36}$/, 'A starts a gang');
let g = await gangs(A);
assert.deepEqual([g.length, g[0].name, g[0].owner, g[0].me, g[0].linked], [1, 'Run club', true, true, false], 'A is its owner, not linked to a habit yet');
for (const [args, what] of [
  [['', 'daily', null, null, 0, 29], 'a name'],
  [['Run', 'daily', null, null, 0, 3], 'at least a week'],
  [['Run', 'daily', null, null, 0, 400], 'at most a year'],
  [['Run', 'hourly', null, null, 0, 29], 'known schedules only'],
  [['Run', 'daily', null, null, 60, 90], 'starts within a month'],
  [['Run\nclub', 'daily', null, null, 0, 29], 'no control characters'],
]) {
  await rejects(as(A, 'select public.create_gang($1, $2, $3, $4, $5, $6)', [args[0], args[1], args[2], args[3], await plus(args[4]), await plus(args[5])]), /violates|starts between/, `refused gang: ${what}`);
}
const gym = await makeGang(A, 'Gym', 'weekdays', [1, 3, 5]);
assert.deepEqual((await gangs(A)).find((r) => r.challenge === gym).weekdays, [1, 3, 5], 'chosen days are kept');
await as(A, 'select public.leave_gang($1)', [gym]);
assert.equal((await db.query('select count(*)::int as n from public.challenges where id = $1', [gym])).rows[0].n, 0, 'the last one out takes the gang with them');

// Links: only to a gang you're in, once.
await habitIn(A, 'run', run);
assert.equal(await linkOf(A, 'run'), run, "A's Run habit is A's part of the gang");
await habitIn(A, 'jog', run);
assert.equal(await linkOf(A, 'jog'), null, 'one habit per gang: a second link is dropped, not refused');
await habitIn(B, 'run', run);
assert.equal(await linkOf(B, 'run'), null, "B can't link to a gang B isn't in");
assert.deepEqual(await gangs(B), [], "B can't see A's gang");
await rejects(as(B, 'select * from public.challenges'), /permission denied/, 'gangs are read only through my_gangs');
await rejects(as(A, 'insert into public.challenge_members (challenge_id, user_id) values ($1, $2)', [run, B]), /permission denied/, 'nobody adds members by hand');
await rejects(as('anon', 'select * from public.my_gangs()'), /permission denied/, 'visitors see no gangs');
await rejects(as('anon', 'select public.create_gang($1, $2, $3, $4, $5, $6)', ['x', 'daily', null, null, T, await plus(10)]), /permission denied/, 'visitors start no gangs');

// A gang card.
await rejects(as(B, 'select public.create_invite($1, $2)', [h(40), run]), /not in that gang/, "B can't hand out cards for A's gang");
await as(A, 'select public.create_invite($1, $2)', [h(40), run]);
const gcard = await peek(B, 40);
assert.deepEqual([gcard.state, gcard.kind, gcard.gang_name, gcard.cadence, gcard.members, gcard.tag_name], ['ok', 'gang', 'Run club', 'daily', 1, 'Asha Rao'], 'B sees the gang on the card');
assert.equal(await accept(B, 40, null), 'ok', 'B joins');
assert.equal((await peek(C, 40)).state, 'gone', 'a gang card works once');
assert.equal(await accept(B, 40), 'gone', 'and not twice');
await as(A, 'select public.create_invite($1, $2)', [h(41), run]);
assert.equal((await peek(B, 41)).state, 'already', 'already in');

// What members see: each other's ticks on the linked habit, in the gang's dates, nothing more.
await habitIn(B, 'run', run);
assert.equal(await linkOf(B, 'run'), run, 'now B can link');
await habitIn(B, 'diary');
await as(B, 'insert into public.ticks (user_id, slug, day) values ($1, $2, $3), ($1, $4, $3)', [B, 'run', T, 'diary']);
g = await gangs(A);
const bRow = g.find((r) => r.member === B);
assert.deepEqual([bRow.tag_name, bRow.owner, bRow.me, bRow.linked], ['Ravi', false, false, true], 'A sees B in the gang');
assert.deepEqual(bRow.days.map((d) => (typeof d === 'string' ? d : d.toISOString().slice(0, 10))), [T], "B's tick today, on the gang's habit only");
assert.equal((await as(A, 'select count(*)::int as n from public.ticks where user_id = $1', [B])).rows[0].n, 0, "A still can't read B's ticks directly");
await as(B, "update public.habits set private = true where slug = 'run'");
assert.deepEqual((await gangs(A)).find((r) => r.member === B).days, [], 'a private habit shows no ticks, even in a gang');
await as(B, "update public.habits set private = false where slug = 'run'");

// The owner, and only the owner, changes the gang.
await rejects(as(B, 'select public.edit_gang($1, $2, $3)', [run, 'Hacked', await plus(60)]), /only the owner/, "B can't rename A's gang");
await rejects(as(B, 'select public.remove_member($1, $2)', [run, A]), /only the owner/, "B can't remove the owner");
await as(A, 'select public.edit_gang($1, $2, $3)', [run, 'Run club 2', await plus(10)]);
g = await gangs(B);
assert.equal(g[0].name, 'Run club 2', 'the owner renames it');
assert.equal(String(g[0].ends instanceof Date ? g[0].ends.toISOString().slice(0, 10) : g[0].ends), await plus(29), 'but its end never moves earlier');
await rejects(as(A, 'select public.edit_gang($1, $2, $3)', [run, '', await plus(30)]), /violates/, 'refused: an empty name');

// Leaving: the owner role passes to whoever has been in longest.
await as(A, 'select public.create_invite($1, $2)', [h(42), run]);
assert.equal(await accept(C, 42), 'ok', 'C joins too');
await habitIn(C, 'run', run);
await as(A, 'select public.leave_gang($1)', [run]);
assert.equal(await linkOf(A, 'run'), null, "leaving unlinks A's habit, which stays A's");
assert.equal((await as(A, "select count(*)::int as n from public.habits where slug = 'run'")).rows[0].n, 1, 'the habit itself stays');
assert.deepEqual(await gangs(A), [], 'A sees the gang no more');
g = await gangs(B);
assert.deepEqual(g.map((r) => [r.tag_name, r.owner]), [['Ravi', true], ['मीरा', false]], 'B, in longest, owns it now');
await rejects(as(C, 'select public.remove_member($1, $2)', [run, B]), /only the owner/, 'C still can\'t remove anyone');
await as(C, 'select public.create_invite($1, $2)', [h(44), run]);
await as(C, 'select public.create_invite($1, $2)', [h(45), run]);
await db.query('delete from public.invites where token_hash = $1', [hashed(45)]);
await db.query("insert into public.invites (token_hash, user_id, expires_at, challenge_id) values ($1, $2, now() + interval '1 day', $3)", [hashed(45), C, run]);
await as(B, 'select public.remove_member($1, $2)', [run, C]);
assert.equal(await linkOf(C, 'run'), null, "removing C unlinks C's habit");
assert.equal((await db.query('select count(*)::int as n from public.invites where user_id = $1 and challenge_id = $2', [C, run])).rows[0].n, 0, "and takes back C's cards for the gang");
await db.query("insert into public.invites (token_hash, user_id, expires_at, challenge_id) values ($1, $2, now() + interval '1 day', $3)", [hashed(45), C, run]);
assert.equal((await peek(A, 45)).state, 'gone', 'a card from someone no longer in the gang is gone');
assert.equal(await accept(A, 45), 'gone', 'and lets nobody in (review of 12 Nov)');
assert.deepEqual(await gangs(C), [], 'and C sees nothing');
await rejects(as(B, 'select public.remove_member($1, $2)', [run, B]), /leave_gang/, 'owners leave, not remove themselves');

// Ended and full gangs take no one new.
await as(B, 'select public.create_invite($1, $2)', [h(43), run]);
await db.query("update public.challenges set starts = current_date - 40, ends = current_date - 1 where id = $1", [run]);
assert.equal((await peek(C, 43)).state, 'ended', 'an ended gang says so');
assert.equal(await accept(C, 43), 'ended', 'and takes nobody');
await db.query("update public.challenges set starts = current_date, ends = current_date + 29 where id = $1", [run]);
const others = [];
for (let n = 0; n < 9; n++) {
  const id = `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
  await addUser(id);
  await as(id, 'select public.set_my_tag($1, $2)', [`member${n}`, `M${n}0`]);
  others.push(id);
}
for (const [n, id] of others.entries()) {
  await as(B, 'select public.create_invite($1, $2)', [h(50 + n), run]);
  const r = await accept(id, 50 + n);
  assert.equal(r, n < 9 ? 'ok' : 'full', `member ${n + 2} of 10`);
}
assert.equal((await peek(C, 43)).state, 'full', 'ten is the most');
assert.equal(await accept(C, 43), 'full', 'and the eleventh is turned away');
// Account deletion leaves the gang to the others.
await as(B, 'select public.delete_my_account()');
assert.equal((await gangs(others[0]))[0].owner, true, 'when the owner deletes their account, the next in line owns the gang');
assert.equal((await gangs(others[0])).length, 9, 'and the deleted account is gone from it');
for (const id of others) await as(id, 'select public.leave_gang($1)', [run]);
assert.equal((await db.query('select count(*)::int as n from public.challenges')).rows[0].n, 0, 'and when everyone leaves, the gang is gone');

// Keepsakes of finished gangs (D-047): your own copy, only the agreed shape.
{
  const K = '00000000-0000-4000-8000-0000000000dd';
  const keep = (who, members, extra = {}) => as(who, `insert into public.gang_keepsakes (user_id, challenge_id, name, cadence, starts, ends, cranes, periods, unit, members)
    values ($1, $2, $3, 'daily', '2026-11-01', '2026-11-30', $4, 30, 'day', $5)`, [extra.owner || who, extra.id || K, extra.name ?? 'Run club', extra.cranes ?? 11, JSON.stringify(members)]);
  const oze = { name: 'oze', code: '1000', done: 26, due: 30 };
  await keep(A, [oze, { name: 'Asha Rao', code: 'RUN', done: 24, due: 30 }]);
  assert.equal((await as(A, 'select count(*)::int as n from public.gang_keepsakes')).rows[0].n, 1, 'A keeps a finished gang');
  assert.equal((await as(C, 'select count(*)::int as n from public.gang_keepsakes')).rows[0].n, 0, "C can't see A's keepsakes");
  await rejects(keep(C, [oze], { owner: A, id: '00000000-0000-4000-8000-0000000000de' }), /row-level security/, "C can't write one for A");
  await rejects(as(A, "update public.gang_keepsakes set cranes = 30"), /permission denied/, 'a keepsake is kept as it was');
  await rejects(as('anon', 'select * from public.gang_keepsakes'), /permission denied/, 'visitors see none');
  for (const [members, extra, what] of [
    [[{ ...oze, extra: 1 }], {}, 'no extra fields'],
    [[{ ...oze, name: '<b>x' }], {}, 'no markup in a name'],
    [[{ ...oze, code: 'run' }], {}, 'codes as profiles keep them'],
    [[{ ...oze, done: 40 }], {}, 'done never above due'],
    [[], {}, 'at least one member'],
    [[oze], { cranes: 31 }, 'no more cranes than days'],
    [[oze], { name: '' }, 'a name'],
  ]) {
    await rejects(keep(A, members, { id: '00000000-0000-4000-8000-0000000000df', ...extra }), /violates|must be/, `refused keepsake: ${what}`);
  }
  assert.equal((await as(A, 'delete from public.gang_keepsakes where challenge_id = $1', [K])).affectedRows, 1, 'A can put one away');
  await keep(A, [oze]);
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
for (const t of ['years', 'habits', 'months', 'habit_months', 'ticks', 'push_settings', 'push_subscriptions', 'push_log', 'push_actions', 'invites', 'buddies', 'buddy_figures', 'challenge_members', 'gang_keepsakes']) {
  assert.equal((await db.query(`select count(*)::int as n from public.${t} where user_id = '${A}'`)).rows[0].n, 0, `account deletion clears ${t}`);
}
await rejects(as(A, `insert into public.years (user_id, year) values ($1, 2027)`, [A]), /foreign key/, "a deleted account can't write again with its old token");

await db.close();
console.log('schema: all checks pass');
