// Reminders with the app closed, on this device (D-028). The browser gives us an address for this
// device (a push subscription); it's stored in the account through register_push(), and the
// send-reminders function posts encrypted messages to it every half hour as habits come up.
// Each device opts in on its own. Signing out takes the device off first (leaveDevice), so a
// shared computer stops getting someone's reminders the moment they leave.
// Functions take the Supabase client from the caller, so this file doesn't import auth.js.
import { VAPID_PUBLIC_KEY, PUSH_ENABLED } from '../config.js';

const SW = '/sw.js';

export const pushSupported = () => PUSH_ENABLED && typeof window !== 'undefined' && window.isSecureContext
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// iPhone and iPad deliver Web Push only to One More Fold added to the Home Screen and opened from there.
export const needsHomeScreen = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;

const keyBytes = (b64u) => Uint8Array.from(atob(b64u.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (b64u.length % 4)) % 4)), (c) => c.charCodeAt(0));
const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
const ZONE = /^(UTC|[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2})$/; // the database's own check
const offList = (off) => Object.keys(off || {}).filter((id) => off[id]).slice(0, 1000);

async function current() {
  const reg = await navigator.serviceWorker.getRegistration(SW);
  return reg ? reg.pushManager.getSubscription() : null;
}

// 'on' (this device is signed up under this account) | 'off' | 'denied' | 'unsupported'
export async function pushState(sb) {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await current();
  if (!sub) return 'off';
  // Row-level security shows the row only if it's listed under this account.
  const { data } = await sb.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle();
  return data ? 'on' : 'off';
}

// Asks for permission, signs this device up and switches reminders on for the account.
// off: the habits switched off in the Reminders panel. Throws a readable message on failure.
export async function enablePush(sb, userId, off) {
  if (!pushSupported()) throw new Error('This browser can\'t get reminders with One More Fold closed.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site, so reminders can\'t arrive. Allow them in the browser\'s site settings.');
  const reg = await navigator.serviceWorker.register(SW);
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // An old subscription made with another key can't be reused.
  if (sub && sub.options?.applicationServerKey) {
    const had = new Uint8Array(sub.options.applicationServerKey);
    const want = keyBytes(VAPID_PUBLIC_KEY);
    if (had.length !== want.length || had.some((b, i) => b !== want[i])) { await sub.unsubscribe(); sub = null; }
  }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  const { endpoint, keys } = sub.toJSON();
  const { error } = await sb.rpc('register_push', { p_endpoint: endpoint, p_p256dh: keys?.p256dh, p_auth: keys?.auth });
  if (error) {
    await sub.unsubscribe().catch(() => {});
    throw new Error('This browser\'s notification service isn\'t one One More Fold can use yet.');
  }
  await saveSettings(sb, userId, off, true);
}

// The account's reminder settings: which habits, and the time zone "07:00" is in.
export async function saveSettings(sb, userId, off, reminders) {
  const tz = zone();
  const row = { user_id: userId, off: offList(off), time_zone: ZONE.test(tz) && tz.length <= 64 ? tz : 'UTC' };
  if (reminders !== undefined) row.reminders = reminders;
  const { error } = await sb.from('push_settings').upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error('Your reminder settings couldn\'t be saved just now.');
}

// The daily summary and weekly recap (D-042): two switches and the time they arrive.
export const SUMMARY_TIMES = Array.from({ length: 14 }, (_, i) => `${String(17 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export async function loadSummaries(sb) {
  const { data } = await sb.from('push_settings').select('daily, weekly, summary_time').maybeSingle();
  return { daily: !!data?.daily, weekly: !!data?.weekly, time: String(data?.summary_time || '21:30').slice(0, 5) };
}

// patch: { daily?, weekly?, time? }. Only known fields and the offered times are ever sent.
export async function saveSummaries(sb, userId, patch) {
  const row = {};
  if (typeof patch.daily === 'boolean') row.daily = patch.daily;
  if (typeof patch.weekly === 'boolean') row.weekly = patch.weekly;
  if (SUMMARY_TIMES.includes(patch.time)) row.summary_time = patch.time;
  const { error } = await sb.from('push_settings').update(row).eq('user_id', userId);
  if (error) throw new Error("That setting couldn't be saved just now.");
}

// Takes this device off (the account keeps any other devices) and stops the browser's subscription.
// Never throws: it runs on the way out, and leaving must always work.
export async function leaveDevice(sb) {
  try {
    if (!pushSupported()) return;
    const sub = await current();
    if (!sub) return;
    await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch { /* offline or already gone: the sender forgets dead addresses itself */ }
}

// Turned off on this device: when no device is left, the account stops asking for reminders.
export async function disablePush(sb, userId) {
  await leaveDevice(sb);
  const { count } = await sb.from('push_subscriptions').select('id', { count: 'exact', head: true });
  if (!count) await sb.from('push_settings').update({ reminders: false, daily: false, weekly: false }).eq('user_id', userId);
}
