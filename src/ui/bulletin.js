// Hangs the noren (D-040, D-043) from src/data/bulletin.js under the landing page's header: every
// notice that's current takes its turn, and closing it lasts one visit.
import { NOTICES } from '../data/bulletin.js';
import { STORE_KEY, APP_PATH, PATCH_NOTES_PATH, PRIVACY_PATH, TERMS_PATH } from '../config.js';
import { esc } from '../lib/sanitize.js';

// Older versions remembered closed notices here; closing now lasts one visit, so it's cleared.
const OLD_KEY = `${STORE_KEY}:bulletin-closed`;
const TURN_MS = 9000; // how long each notice hangs before the next takes its place
// Links may only go to the site's own pages, named here rather than typed as addresses.
const PAGES = { app: APP_PATH, flock: `${APP_PATH}#/flock`, 'patch-notes': PATCH_NOTES_PATH, privacy: PRIVACY_PATH, terms: TERMS_PATH };

const today = () => new Date().toISOString().slice(0, 10);

// Whether a notice may hang today. Exported for scripts/check-bulletin.mjs.
export function shouldShow(b, { date = today() } = {}) {
  if (!b?.show || !b.id || !Array.isArray(b.panels) || !b.panels.length) return false;
  return !(b.until && date > b.until);
}

// Every notice that may hang today, in queue order: they take turns.
export const currentNotices = (list = NOTICES, opts = {}) => list.filter((b) => shouldShow(b, opts));

export function bulletinHTML(b) {
  const panels = b.panels.slice(0, 4).map((p) => `<li class="noren-panel">${esc(p)}</li>`).join('');
  const href = b.link && Object.hasOwn(PAGES, b.link.href) ? PAGES[b.link.href] : null;
  const link = href ? `<a class="noren-link" href="${esc(href)}">${esc(b.link.text)}</a>` : '';
  return `<section class="noren" aria-label="${esc(b.label || 'Notice')}">
    <span class="noren-rod" aria-hidden="true"></span>
    <ul class="noren-cloth">${panels}</ul>
    <div class="noren-foot">${link}<button class="noren-x" type="button" aria-label="Hide this notice">✕</button></div>
  </section>`;
}

// Hangs the noren and, when there's more than one notice, turns to the next every TURN_MS: the
// cloth lifts away and the next one sways in. It holds still while hovered or focused (a pause
// for anything that changes by itself), and changes without movement for reduced motion. The ✕
// takes it down for this visit only; the next visit hangs it again.
export function hangBulletin(slot) {
  if (!slot) return;
  try { localStorage.removeItem(OLD_KEY); } catch { /* nothing stored */ }
  const notices = currentNotices();
  if (!notices.length) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let at = 0;
  let timer = 0;
  let paused = false;
  const hang = () => { slot.innerHTML = bulletinHTML(notices[at]); };
  const lift = (then) => {
    const noren = slot.firstElementChild;
    if (!noren || still) { then(); return; }
    noren.classList.add('is-lifting');
    let done = false;
    const once = () => { if (!done) { done = true; then(); } };
    noren.addEventListener('animationend', once, { once: true });
    setTimeout(once, 600);
  };
  hang();
  if (notices.length > 1) {
    timer = setInterval(() => {
      if (paused || document.hidden) return;
      lift(() => { at = (at + 1) % notices.length; hang(); });
    }, TURN_MS);
    slot.addEventListener('pointerenter', () => { paused = true; });
    slot.addEventListener('pointerleave', () => { paused = false; });
    slot.addEventListener('focusin', () => { paused = true; });
    slot.addEventListener('focusout', () => { paused = false; });
  }
  slot.addEventListener('click', (e) => {
    if (!e.target.closest('.noren-x')) return;
    clearInterval(timer);
    lift(() => slot.replaceChildren());
  });
}
