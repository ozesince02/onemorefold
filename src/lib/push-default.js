// Reminders with the app closed, on by default (D-043). Browsers let a site send notifications only
// after the person on that device allows them, from a tap on the page. So:
//   - where this site's notifications are already allowed (someone turned on in-tab reminders
//     earlier), a signed-in device is signed up for closed-app reminders without asking again,
//     unless the person turned them off on this device;
//   - everywhere else, the tracker invites once in a while (a slip with "Turn on" and "Remind me in
//     3 days") until they're on, the person turns them off, or notifications are blocked.
// The choice and the snooze are per device, under the store's key, so "remove my folds" clears them.
import { STORE_KEY } from '../config.js';

export const INVITE_DAYS = 3;
const CHOICE = `${STORE_KEY}:push-choice`;       // 'off' once someone turned them off on this device
const INVITE = `${STORE_KEY}:push-invite-until`; // when the invitation may show again (ms)

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private window */ } };

export const pushChoice = () => read(CHOICE);
export const setPushChoice = (on) => write(CHOICE, on ? 'on' : 'off');
export const inviteUntil = () => Number(read(INVITE)) || 0;
export const snoozeInvite = (now = Date.now()) => write(INVITE, String(now + INVITE_DAYS * 86400000));

// The device and the person, as the rules below need them:
//   signedIn, supported (push works here), state ('on' | 'off' | 'busy' | 'unknown' | 'denied' |
//   'unsupported'), permission (Notification.permission), homeScreen (an iPhone not yet on the Home
//   Screen), choice (pushChoice()), timed (a habit this month has a time), until, now.
const ready = (d) => d.signedIn && d.supported && d.state === 'off' && !d.homeScreen && d.choice !== 'off';

// Sign this device up without a prompt: notifications are already allowed here.
export const shouldAutoEnable = (d) => ready(d) && d.permission === 'granted';

// Show the invitation: the browser hasn't been asked yet, there's something to remind about, and
// "in 3 days" has passed.
export const shouldInvite = (d) => ready(d) && d.permission === 'default' && d.timed && !(d.until > d.now);
