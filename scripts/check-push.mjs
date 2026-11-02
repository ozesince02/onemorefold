// Web Push without a library (D-028): checks the encryption against the worked example in
// RFC 8291 Appendix A, decrypts a fresh message the way a browser would, and verifies the VAPID
// token's signature. supabase/functions/_shared/webpush.js is what the sender uses.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { encrypt, vapidHeader, sendPush, b64u, unb64u } from '../supabase/functions/_shared/webpush.js';
import { clocks, planReminders, planSummaries, summariesDue, logCutoff, DAILY_CAP } from '../supabase/functions/_shared/plan.js';
import { makeToken, hashToken, TOKEN } from '../supabase/functions/_shared/tokens.js';
import vm from 'node:vm';

const subtle = globalThis.crypto.subtle;

// ---------- RFC 8291, Appendix A ----------
const rfc = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};
const body = await encrypt(rfc.plaintext, { p256dh: rfc.uaPublic, auth: rfc.auth }, {
  senderKeys: { publicKey: rfc.asPublic, privateKey: rfc.asPrivate },
  salt: unb64u(rfc.salt),
});
assert.equal(b64u(body), rfc.body, 'encryption matches RFC 8291 Appendix A byte for byte');

// ---------- A fresh message, opened the way a browser would ----------
const hkdf = async (salt, ikm, info, bytes) => new Uint8Array(await subtle.deriveBits(
  { name: 'HKDF', hash: 'SHA-256', salt, info }, await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bytes * 8));
const te = new TextEncoder();
const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaRaw = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const message = { title: 'German · 07:00', body: 'Time to fold today’s German.', tag: '2026-10-28:german' };
const sealed = await encrypt(JSON.stringify(message), { p256dh: b64u(uaRaw), auth: b64u(authSecret) });

const salt = sealed.slice(0, 16);
assert.equal(new DataView(sealed.buffer).getUint32(16), 4096, 'record size 4096');
assert.equal(sealed[20], 65, 'key id is a 65-byte public key');
const asRaw = sealed.slice(21, 86);
const asKey = await subtle.importKey('raw', asRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
const info = new Uint8Array([...te.encode('WebPush: info\0'), ...uaRaw, ...asRaw]);
const ikm = await hkdf(authSecret, shared, info, 32);
const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
const opened = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), sealed.slice(86)));
assert.equal(opened.at(-1), 2, 'ends with the last-record marker');
assert.deepEqual(JSON.parse(new TextDecoder().decode(opened.slice(0, -1))), message, 'the browser reads exactly what was sent');
const other = await encrypt(JSON.stringify(message), { p256dh: b64u(uaRaw), auth: b64u(authSecret) });
assert.notEqual(b64u(other), b64u(sealed), 'every message gets a new key and salt');

// ---------- VAPID ----------
const vk = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const vjwk = await subtle.exportKey('jwk', vk.privateKey);
const vapid = { publicKey: b64u(new Uint8Array(await subtle.exportKey('raw', vk.publicKey))), privateKey: vjwk.d, subject: 'mailto:someone@example.com' };
const endpoint = 'https://fcm.googleapis.com/fcm/send/abc:def';
const header = await vapidHeader(endpoint, vapid, Date.UTC(2026, 9, 28, 12));
const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
assert.equal(k, vapid.publicKey, 'the header names our public key');
const [h, c, s] = token.split('.');
assert.deepEqual(JSON.parse(new TextDecoder().decode(unb64u(h))), { typ: 'JWT', alg: 'ES256' });
const claims = JSON.parse(new TextDecoder().decode(unb64u(c)));
assert.equal(claims.aud, 'https://fcm.googleapis.com', 'audience is the push service origin, not the full address');
assert.equal(claims.exp, Date.UTC(2026, 9, 28, 12) / 1000 + 12 * 3600, 'valid for 12 hours');
assert.equal(claims.sub, 'mailto:someone@example.com');
assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk.publicKey, unb64u(s), te.encode(`${h}.${c}`)), 'the signature verifies with our public key');

// ---------- Sending ----------
let seen;
const status = await sendPush({ endpoint, p256dh: b64u(uaRaw), auth: b64u(authSecret) }, message, vapid, {
  fetchImpl: async (url, init) => { seen = { url, init }; return { status: 201 }; },
});
assert.equal(status, 201);
assert.equal(seen.url, endpoint, 'posts to the browser\'s own address');
assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm');
assert.equal(seen.init.headers.TTL, '1800', 'a reminder older than 30 minutes is not worth delivering');
assert.equal(seen.init.redirect, 'error', 'never follows a redirect somewhere else');
assert.ok(seen.init.signal instanceof AbortSignal, 'gives up on a push service that doesn\'t answer');
const awake = setTimeout(() => {}, 1000); // Node doesn't wait for AbortSignal.timeout by itself
await assert.rejects(sendPush({ endpoint, p256dh: b64u(uaRaw), auth: b64u(authSecret) }, message, vapid, {
  timeoutMs: 20,
  fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
}), /TimeoutError|timed out|aborted/i, 'a hanging push service times out');
clearTimeout(awake);
assert.ok(seen.init.headers.Authorization.startsWith('vapid t='));

// ---------- The sender's copies of the app's modules ----------
const lib = join(import.meta.dirname, '../supabase/functions/_shared/lib');
const copies = readdirSync(lib, { recursive: true }).filter((f) => f.endsWith('.js'));
assert.ok(copies.length >= 4, 'the sender has its copies');
for (const f of copies) {
  assert.equal(readFileSync(join(lib, f), 'utf8'), readFileSync(join(import.meta.dirname, '../src/lib', f), 'utf8'), `supabase/functions/_shared/lib/${f} matches src/lib (run npm run shared)`);
}

// ---------- Planning a run ----------
const A = 'user-a', B = 'user-b';
const hm = (user_id, slug, time, extra = {}) => ({ user_id, slug, month: '2026-10-01', name: slug === 'german' ? 'German' : 'Gym', goal: 20, time, start_day: 1, cadence: 'daily', weekdays: null, times_per_week: null, position: 0, ...extra });
const run = Date.UTC(2026, 9, 28, 1, 30); // 01:30 UTC: 07:00 in Kolkata, 18:30 the day before in LA
const people = clocks([
  { user_id: A, off: [], time_zone: 'Asia/Kolkata' },
  { user_id: B, off: [], time_zone: 'America/Los_Angeles' },
], new Date(run));
assert.deepEqual(people.map((p) => p.day), ['2026-10-28', '2026-10-27'], 'each person on their own date');
const habitMonths = [hm(A, 'german', '07:30:00'), hm(A, 'gym', '09:00:00'), hm(B, 'german', '19:00:00')];
const plan = planReminders({ people, habitMonths, ticks: [], sent: [] });
assert.deepEqual(plan.map((x) => `${x.user_id}:${x.slug}:${x.day}`), ['user-a:german:2026-10-28', 'user-b:german:2026-10-27'], 'A at 07:30 Kolkata and B at 19:00 LA, both in their next half hour');
assert.deepEqual(plan[0].payload, { title: 'German · 07:30', body: 'Next up: German at 07:30.', tag: '2026-10-28:german', habitId: 'german', date: '2026-10-28' });
assert.equal(planReminders({ people, habitMonths, ticks: [{ user_id: A, slug: 'german', day: '2026-10-28' }], sent: [] }).length, 1, 'ticked already: no reminder');
assert.equal(planReminders({ people, habitMonths, ticks: [], sent: [{ user_id: A, slug: 'german', day: '2026-10-28' }] }).length, 1, 'sent already: not again');
assert.equal(planReminders({ people: clocks([{ user_id: A, off: ['german'], time_zone: 'Asia/Kolkata' }], new Date(run)), habitMonths, ticks: [], sent: [] }).length, 0, 'switched off: no reminder');
assert.equal(planReminders({ people, habitMonths: habitMonths.map((r) => ({ ...r, user_id: 'someone-else' })), ticks: [], sent: [] }).length, 0, "someone else's habits are never yours");
const full = Array.from({ length: DAILY_CAP }, (_, i) => ({ user_id: A, slug: `h${i}`, day: '2026-10-28' }));
assert.equal(planReminders({ people: people.slice(0, 1), habitMonths, ticks: [], sent: full }).length, 0, `at most ${DAILY_CAP} a day`);
assert.equal(clocks([{ user_id: A, off: [], time_zone: 'Mars/Olympus' }], new Date(run))[0].clock.getHours(), 1, 'an unknown time zone falls back to UTC');
assert.equal(logCutoff(new Date(run)), '2026-10-14', 'the log keeps two weeks');
const odd = [{ ...hm(B, 'gym', '19:15:00'), time: 1915 }, ...habitMonths]; // B's row makes planning B throw
const survived = planReminders({ people, habitMonths: odd, ticks: [], sent: [] });
assert.deepEqual(survived.map((x) => x.user_id), [A], "one person's odd data skips only them, never anyone else");

// ---------- Later: reminders put off are sent again, once more, if still due (D-039) ----------
const laterSent = [{ user_id: A, slug: 'gym', day: '2026-10-28', remind_again_at: '2026-10-28T01:10:00Z', sends: 1 }];
const later = planReminders({ people: people.slice(0, 1), habitMonths, ticks: [], sent: laterSent });
const again = later.find((x) => x.again);
assert.ok(again && again.slug === 'gym', 'a reminder put off with Later is sent again');
assert.match(again.payload.body, /^Still to do: Gym\. There's still time today\.$/, 'and says so');
assert.equal(planReminders({ people: people.slice(0, 1), habitMonths, ticks: [{ user_id: A, slug: 'gym', day: '2026-10-28' }], sent: laterSent }).filter((x) => x.again).length, 0, 'not if it was ticked meanwhile');
assert.equal(planReminders({ people: clocks([{ user_id: A, off: ['gym'], time_zone: 'Asia/Kolkata' }], new Date(run)), habitMonths, ticks: [], sent: laterSent }).filter((x) => x.again).length, 0, 'not if it was switched off');
assert.equal(planReminders({ people: people.slice(0, 1), habitMonths, ticks: [], sent: [{ ...laterSent[0], remind_again_at: null }] }).filter((x) => x.again).length, 0, 'only when Later was pressed');
const busy = Array.from({ length: DAILY_CAP }, (_, i) => ({ user_id: A, slug: `h${i}`, day: '2026-10-28', sends: 1 }));
assert.equal(planReminders({ people: people.slice(0, 1), habitMonths, ticks: [], sent: [...busy, ...laterSent] }).length, 0, 'Later counts towards the daily cap');

// ---------- Daily summary and weekly recap (D-042) ----------
// Sunday 1 November 2026, 16:00 UTC: 21:30 in Kolkata.
const sunday = new Date(Date.UTC(2026, 10, 1, 16, 0));
const who = (extra = {}) => clocks([{ user_id: A, off: [], time_zone: 'Asia/Kolkata', reminders: false, daily: true, weekly: true, summary_time: '21:30:00', ...extra }], sunday)[0];
assert.deepEqual(summariesDue(who()), { daily: true, weekly: true }, 'both are due at 21:30 on a Sunday');
assert.deepEqual(summariesDue(who({ summary_time: '20:00:00' })), { daily: false, weekly: false }, 'not at another time');
assert.deepEqual(summariesDue(who({ weekly: false })), { daily: true, weekly: false }, 'each switch is its own');
assert.deepEqual(summariesDue(clocks([{ user_id: A, off: [], time_zone: 'Asia/Kolkata', daily: true, weekly: true, summary_time: '21:30:00' }], new Date(Date.UTC(2026, 10, 1, 16, 17)))[0]), { daily: true, weekly: true }, 'a run that starts late still covers its half hour');
assert.deepEqual(summariesDue(clocks([{ user_id: A, off: [], time_zone: 'Asia/Kolkata', daily: true, weekly: true, summary_time: '21:30:00' }], new Date(Date.UTC(2026, 10, 2, 16, 0)))[0]), { daily: true, weekly: false }, 'the recap only on Sundays');
assert.deepEqual(summariesDue(clocks([{ user_id: A, off: [], time_zone: 'America/Los_Angeles', daily: true, weekly: true, summary_time: '21:30:00' }], sunday)[0]), { daily: false, weekly: false }, 'in the person\'s own time zone (09:00 in LA)');
const sp = who();
const shm = [hm(A, 'walk', '07:00:00', { month: '2026-11-01', name: 'Walk outside' }), hm(A, 'walk', '07:00:00', { month: '2026-10-01', name: 'Walk outside' })];
const sticks = [{ user_id: A, slug: 'walk', day: '2026-11-01' }, ...[26, 27, 28, 29, 30, 31].map((d) => ({ user_id: A, slug: 'walk', day: `2026-10-${d}` }))];
const summaries = planSummaries({ people: [sp], habitMonths: shm, ticks: sticks, sent: [] });
assert.deepEqual(summaries.map((x) => x.kind), ['daily', 'weekly'], 'a summary and a recap');
assert.equal(summaries[0].payload.title, 'Today: 1 of 1 folded', 'the summary counts today across the new month');
assert.match(summaries[0].payload.body, /a 7-day run/, 'and the run reaches back into October');
assert.equal(summaries[1].payload.title, 'Your week: 7 of 7 folded', 'the recap reads the last seven days across the 1st');
assert.equal(summaries[0].payload.kind, 'daily', 'a summary says what kind it is');
assert.equal(summaries[0].payload.habitId, undefined, "and carries no habit id, so it can never take a habit's place on screen");
assert.equal(planSummaries({ people: [sp], habitMonths: shm, ticks: sticks, sent: [{ user_id: A, kind: 'daily', day: '2026-11-01' }] }).map((x) => x.kind).join(), 'weekly', 'sent already: not again');
assert.equal(planSummaries({ people: [sp], habitMonths: [], ticks: [], sent: [] }).length, 0, 'nothing due, nothing sent');
assert.equal(planSummaries({ people: [sp], habitMonths: shm.map((r) => ({ ...r, user_id: B })), ticks: [], sent: [] }).length, 0, "someone else's habits never count");

// ---------- One-time tokens ----------
const t1 = makeToken(), t2 = makeToken();
assert.match(t1, TOKEN, 'a token is 32 bytes in base64url');
assert.notEqual(t1, t2, 'every token is new');
assert.match(await hashToken(t1), /^[0-9a-f]{64}$/, 'only a SHA-256 hash is stored');
assert.equal(await hashToken(t1), await hashToken(t1), 'the hash is stable');

// ---------- The service worker, in a sandbox ----------
const swSource = readFileSync(join(import.meta.dirname, '../public/sw.js'), 'utf8');
function worker({ fetchReply = { result: 'done' }, fetchFails = false, tabs = [] } = {}) {
  const handlers = {}, shown = [], posted = [], fetched = [], waits = [];
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting() {},
    registration: { showNotification: async (title, options) => { shown.push({ title, ...options }); } },
    clients: { matchAll: async () => tabs.map((url) => ({ url, postMessage: (m) => posted.push(m), focus: async () => {} })), openWindow: async () => {}, claim: async () => {} },
  };
  const fetch = async (url, init) => { fetched.push({ url, init }); if (fetchFails) throw new TypeError('offline'); return { ok: true, json: async () => fetchReply }; };
  vm.runInNewContext(swSource, { self, fetch, URL, URLSearchParams, JSON, console });
  const fire = async (type, event) => { handlers[type]({ waitUntil: (p) => waits.push(p), ...event }); await Promise.all(waits); };
  // Plain copies: objects made inside the sandbox don't compare strictly with ones made outside.
  const plain = (x) => JSON.parse(JSON.stringify(x));
  return { fire, get shown() { return plain(shown); }, get posted() { return plain(posted); }, fetched };
}
const ACT = 'https://txmseoofjrvsmxyaiwps.supabase.co/functions/v1/act-reminder';
const pushOf = (msg) => ({ data: { json: () => msg } });
const good = { title: 'Gym · 09:00', body: 'Next up: Gym at 09:00.', habitId: 'gym', date: '2026-10-28', token: t1, act: ACT };
let w = worker();
await w.fire('push', pushOf(good));
assert.deepEqual(w.shown[0].actions.map((a) => a.action), ['done', 'later'], 'a reminder with a token shows Done and Later');
for (const [bad, what] of [[{ ...good, token: 'short' }, 'a malformed token'], [{ ...good, act: 'https://evil.example.com/steal' }, 'an address that isn\'t our function'], [{ ...good, habitId: 'Bad Id' }, 'a bad habit id']]) {
  w = worker();
  await w.fire('push', pushOf(bad));
  assert.equal(w.shown[0].actions.length, 0, `no buttons for ${what}`);
  assert.equal(w.shown[0].data.token, undefined, `and the token isn't kept, for ${what}`);
}
const clickOn = (action, data = { habitId: 'gym', date: '2026-10-28', token: t1, act: ACT }) => ({ action, notification: { data, close() {} } });
w = worker({ tabs: ['https://onemorefold.com/app'] });
await w.fire('notificationclick', clickOn('done'));
assert.equal(w.fetched[0].url, ACT, 'Done goes to act-reminder');
assert.deepEqual(JSON.parse(w.fetched[0].init.body), { token: t1, act: 'done' }, 'with the token and nothing else');
assert.deepEqual(w.posted, [{ type: 'eightfold-remind', act: 'done', habitId: 'gym', date: '2026-10-28' }], 'and an open tab ticks it straight away');
assert.equal(w.shown.length, 0, 'quietly, when it worked');
w = worker({ fetchReply: { result: 'later' }, tabs: ['https://onemorefold.com/app'] });
await w.fire('notificationclick', clickOn('later'));
assert.equal(JSON.parse(w.fetched[0].init.body).act, 'later', 'Later goes to act-reminder too');
assert.equal(w.posted.length, 0, 'and changes nothing in the tab');
w = worker({ fetchReply: { result: 'gone' } });
await w.fire('notificationclick', clickOn('done'));
assert.equal(w.shown[0].title, 'That reminder has passed', 'a used or expired token says so');
w = worker();
await w.fire('push', pushOf({ title: 'Today: 4 of 6 folded', body: '4 of 6 habits due today are done.', kind: 'daily', date: '2026-11-01' }));
assert.equal(w.shown[0].tag, '2026-11-01:~daily', 'a summary gets its own tag, one a day');
assert.equal(w.shown[0].actions.length, 0, 'and no buttons');
w = worker();
await w.fire('push', pushOf({ ...good, habitId: 'summary', date: '2026-11-01' }));
assert.equal(w.shown[0].tag, '2026-11-01:summary', 'a habit called "Summary" keeps its own reminder');
w = worker({ fetchReply: { result: 'last' } });
await w.fire('notificationclick', clickOn('later'));
assert.equal(w.shown[0].title, 'No more reminders for this one today', 'Later on the third send says so');
w = worker();
await w.fire('notificationclick', clickOn('done', { habitId: 'gym', date: '2026-10-28', token: t1, act: 'https://evil.example.com/x' }));
assert.equal(w.fetched.length, 0, 'the address is checked again when a button is pressed');
w = worker({ fetchFails: true });
await w.fire('notificationclick', clickOn('done'));
assert.equal(w.shown[0].title, "That didn't reach your account", 'offline says so too');
w = worker({ tabs: ['https://onemorefold.com/app'] });
await w.fire('notificationclick', clickOn('done', { habitId: 'gym', date: '2026-10-28' }));
assert.equal(w.fetched.length, 0, 'an in-tab reminder (no token) keeps going to the tab, not the server');
assert.equal(w.posted[0].act, 'done');

console.log('push: all checks pass');
