// Buddies on the account (D-029, D-045): every call goes through row-level security or one of the
// functions in supabase/migrations/20261111120000_buddies.sql, which act only for the signed-in
// person. Errors come back as fixed, readable messages; nothing from the server is shown as is.
import { LEVELS } from './buddies.js';
import { groupGangs, GANG_NAME_MAX } from './gangs.js';
import { CADENCES } from './schedule.js';

const ID = /^[0-9a-f-]{36}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
// The invite's secret: 32 random bytes, base64url. It travels only after '#' in the link; the
// database stores only its SHA-256, worked out there (D-046).
export const CARD_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const fail = (text) => { throw new Error(text); };
const check = ({ data, error }, text) => (error ? fail(text) : data);

const toB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Your tag, or null before you've chosen one.
export async function loadMyTag(sb, userId) {
  const row = check(await sb.from('profiles').select('tag_name, tag_code').eq('id', userId).maybeSingle(), "Couldn't load your card.");
  return row?.tag_name ? { name: row.tag_name, code: row.tag_code } : null;
}

// 'ok' or 'taken'.
export async function saveMyTag(sb, name, code) {
  const result = check(await sb.rpc('set_my_tag', { p_name: name, p_code: code }), "That tag couldn't be saved. Check it and try again.");
  return result === 'taken' ? 'taken' : 'ok';
}

// A new one-time card: { token, until }. With a gang id, it invites to that gang.
export async function createCard(sb, gang = null) {
  const token = toB64url(crypto.getRandomValues(new Uint8Array(32)));
  const args = gang && ID.test(gang) ? { p_token: token, p_challenge: gang } : { p_token: token };
  const until = check(await sb.rpc('create_invite', args), "A new card couldn't be made. You can have 10 open at a time.");
  return { token, until: Date.parse(until), gang: args.p_challenge || null };
}

// Your open cards: [{ hash, until }], newest first.
export async function openCards(sb) {
  const rows = check(await sb.from('invites').select('token_hash, expires_at, used_at').is('used_at', null)
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }), "Couldn't load your cards.");
  return (rows || []).filter((r) => /^[0-9a-f]{64}$/.test(r.token_hash)).map((r) => ({ hash: r.token_hash, until: Date.parse(r.expires_at) }));
}

export async function takeBackCard(sb, hash) {
  if (!/^[0-9a-f]{64}$/.test(hash)) return;
  check(await sb.from('invites').delete().eq('token_hash', hash), "That card couldn't be taken back. Try again.");
}

const STATES = ['ok', 'gone', 'self', 'already', 'full', 'ended'];

// What a card someone handed you says:
//   { state: 'ok' | 'gone' | 'self' | 'already' | 'full' | 'ended', kind: 'buddy' | 'gang', name, code,
//     gang?: { name, cadence, weekdays, timesPerWeek, starts, ends, members } }
export async function peekCard(sb, token) {
  if (!CARD_TOKEN.test(token)) return { state: 'gone' };
  const rows = check(await sb.rpc('peek_invite', { p_token: token }), "Couldn't open the card. Check your connection.");
  const row = rows?.[0];
  const state = STATES.includes(row?.state) ? row.state : 'gone';
  const card = { state, kind: row?.kind === 'gang' ? 'gang' : 'buddy', name: row?.tag_name || '', code: row?.tag_code || '' };
  if (card.kind === 'gang' && CADENCES.includes(row.cadence) && DAY.test(row.starts) && DAY.test(row.ends)) {
    card.gang = {
      name: String(row.gang_name || '').slice(0, GANG_NAME_MAX),
      cadence: row.cadence,
      weekdays: row.cadence === 'weekdays' ? (row.weekdays || []).filter((w) => Number.isInteger(w) && w >= 1 && w <= 7) : undefined,
      timesPerWeek: row.cadence === 'times_per_week' ? Math.min(7, Math.max(1, Number(row.times_per_week) || 1)) : undefined,
      starts: row.starts, ends: row.ends, members: Number(row.members) || 0,
    };
  } else if (card.kind === 'gang') card.state = 'gone';
  return card;
}

// 'ok' | 'gone' | 'self' | 'already' | 'full' | 'ended'. The level only matters for buddy cards.
export async function acceptCard(sb, token, level = 'doing') {
  if (!CARD_TOKEN.test(token) || !LEVELS.includes(level)) return 'gone';
  const r = check(await sb.rpc('accept_invite', { p_token: token, p_level: level }), "That card couldn't be accepted. Try again.");
  return STATES.includes(r) ? r : 'gone';
}

export async function declineCard(sb, token) {
  if (!CARD_TOKEN.test(token)) return;
  await sb.rpc('decline_invite', { p_token: token });
}

// ---------- Gangs (D-046) ----------
export const loadGangs = async (sb) => groupGangs(check(await sb.rpc('my_gangs'), "Couldn't load your gangs. Check your connection."));

// Start a gang: { name, cadence, weekdays, timesPerWeek, starts, ends }. Returns its id.
export async function createGang(sb, g) {
  const id = check(await sb.rpc('create_gang', {
    p_name: g.name, p_cadence: g.cadence, p_weekdays: g.cadence === 'weekdays' ? g.weekdays : null,
    p_times: g.cadence === 'times_per_week' ? g.timesPerWeek : null, p_starts: g.starts, p_ends: g.ends,
  }), "The gang couldn't be started. Check its name and dates.");
  return ID.test(id || '') ? id : fail("The gang couldn't be started.");
}

export async function editGang(sb, id, name, ends) {
  if (!ID.test(id)) return;
  check(await sb.rpc('edit_gang', { p_challenge: id, p_name: name, p_ends: ends }), "That couldn't be saved. Try again.");
}
export async function leaveGang(sb, id) {
  if (!ID.test(id)) return;
  check(await sb.rpc('leave_gang', { p_challenge: id }), "Couldn't leave just now. Try again.");
}
export async function removeMember(sb, id, user) {
  if (!ID.test(id) || !ID.test(user)) return;
  check(await sb.rpc('remove_member', { p_challenge: id, p_user: user }), "Couldn't remove them just now. Try again.");
}

const num = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

// Your buddies, shaped for the screen; anything unexpected is dropped rather than shown.
export async function loadBuddies(sb) {
  const rows = check(await sb.rpc('my_buddies'), "Couldn't load your buddies. Check your connection.");
  return (rows || []).filter((r) => ID.test(r.buddy) && r.tag_name).map((r) => ({
    id: r.buddy,
    name: String(r.tag_name),
    code: String(r.tag_code || ''),
    myLevel: LEVELS.includes(r.my_level) ? r.my_level : 'none',
    myHabits: (r.my_habits || []).filter((s) => SLUG.test(s)),
    theirLevel: LEVELS.includes(r.their_level) ? r.their_level : 'none',
    figures: r.as_of ? {
      as_of: String(r.as_of).slice(0, 10),
      week_done: num(r.week_done), week_due: num(r.week_due),
      prev_done: num(r.prev_done), prev_due: num(r.prev_due),
      month_done: num(r.month_done), month_due: num(r.month_due),
      run: num(r.run) || 0,
    } : null,
    habits: Array.isArray(r.habits) ? r.habits.filter((h) => typeof h?.name === 'string' && num(h.done) !== null && num(h.due) !== null).slice(0, 50) : [],
  }));
}

export async function saveSharing(sb, userId, buddyId, level, habits) {
  if (!ID.test(buddyId) || !LEVELS.includes(level)) return;
  const row = { level, habits: level === 'habits' ? [...new Set(habits)].filter((s) => SLUG.test(s)).slice(0, 50) : [] };
  check(await sb.from('buddies').update(row).eq('user_id', userId).eq('buddy_id', buddyId), "That couldn't be saved. Try again.");
}

export async function removeBuddy(sb, buddyId) {
  if (!ID.test(buddyId)) return;
  check(await sb.rpc('remove_buddy', { p_buddy: buddyId }), "Couldn't remove them just now. Try again.");
}

// Keep your figures where your buddies can be shown them; none when nobody is shown any.
export async function publishFigures(sb, userId, figures) {
  if (!figures) {
    check(await sb.from('buddy_figures').delete().eq('user_id', userId), "Couldn't update what your buddies see.");
    return;
  }
  check(await sb.from('buddy_figures').upsert({ user_id: userId, ...figures }, { onConflict: 'user_id' }), "Couldn't update what your buddies see.");
}
