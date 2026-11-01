// One More Fold service worker: reminders carry "Done" and "In 10 minutes" buttons that reach the open
// tab, and reminders sent with the app closed (D-028) are shown from here, with Done and Later
// buttons that act on the account (D-039). No caching yet.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// The tracker is /app.html in development and /app when hosted (wrangler.jsonc html_handling).
async function trackerTab() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return windows.find((c) => /\/app(\.html)?$/.test(new URL(c.url).pathname)) || windows[0];
}

// Done or Later on a reminder sent with the app closed (D-039): the notification's one-time token
// goes to act-reminder, which acts on the person's account. An open tab hears about a Done straight
// away; if the account can't be reached, a second notification says so.
async function actOnAccount(act, { habitId, date, token, act: url }) {
  let result = 'failed';
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, act }) });
    result = (await res.json()).result;
  } catch { /* offline, or the account can't be reached */ }
  const tab = await trackerTab();
  if (result === 'done' && tab) tab.postMessage({ type: 'eightfold-remind', act: 'done', habitId, date });
  if (result === 'done' || result === 'later') return;
  await self.registration.showNotification(result === 'gone' ? 'That reminder has passed' : "That didn't reach your account", {
    body: 'Open One More Fold to tick it there.',
    tag: `${date}:${habitId}:act`,
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    data: { habitId, date },
  });
}

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  const { habitId, date } = data;
  const act = event.action || 'open';
  event.notification.close();

  if (data.token && (act === 'done' || act === 'later')) {
    event.waitUntil(actOnAccount(act, data));
    return;
  }

  event.waitUntil((async () => {
    const tab = await trackerTab();

    if (tab) {
      if (act !== 'open') tab.postMessage({ type: 'eightfold-remind', act, habitId, date });
      else if ('focus' in tab) await tab.focus();
      return;
    }
    // No tab open: open the tracker and let it apply the button that was pressed.
    const params = new URLSearchParams({ remind: act, h: habitId || '', d: date || '' });
    await self.clients.openWindow(`/app.html?${params}`);
  })());
});

// A reminder sent while One More Fold was closed (D-028). Only our sender can reach this device (the
// push service checks its VAPID key), and the message is encrypted for this browser; it's still
// checked field by field before anything is shown.
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
// Only our Supabase project's act-reminder function; the CSP's connect-src holds to that as well.
const ACT_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/act-reminder$/;
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

self.addEventListener('push', (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = {}; }
  const habitId = ID.test(msg.habitId || '') ? msg.habitId : '';
  const date = DAY.test(msg.date || '') ? msg.date : '';
  // Done and Later appear only with a valid one-time token and our own address to send it to.
  const canAct = habitId && date && TOKEN.test(msg.token || '') && ACT_URL.test(msg.act || '');
  event.waitUntil(self.registration.showNotification(text(msg.title, 140) || 'One More Fold', {
    body: text(msg.body, 300) || 'A habit is coming up.',
    tag: habitId && date ? `${date}:${habitId}` : 'eightfold',
    renotify: true,
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    data: canAct ? { habitId, date, token: msg.token, act: msg.act } : { habitId, date },
    actions: canAct ? [{ action: 'done', title: 'Done' }, { action: 'later', title: 'Later' }] : [],
  }));
});
