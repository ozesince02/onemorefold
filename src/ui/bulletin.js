// Hangs the noren (D-040) from src/data/bulletin.js under the landing page's header: the first
// notice in the queue that's still current. Closing one is remembered on this device for that notice
// only (a new id hangs again), and the next one in the queue can take its place on the next visit.
// A per-device convenience in localStorage, under the store's key so "remove my folds" clears it.
import { NOTICES } from '../data/bulletin.js';
import { STORE_KEY, APP_PATH, PATCH_NOTES_PATH, PRIVACY_PATH, TERMS_PATH } from '../config.js';
import { esc } from '../lib/sanitize.js';

const KEY = `${STORE_KEY}:bulletin-closed`; // ids closed on this device, comma-separated (newest last)
// Links may only go to the site's own pages, named here rather than typed as addresses.
const PAGES = { app: APP_PATH, 'patch-notes': PATCH_NOTES_PATH, privacy: PRIVACY_PATH, terms: TERMS_PATH };

const today = () => new Date().toISOString().slice(0, 10);

const closedIds = () => { try { return (localStorage.getItem(KEY) || '').split(',').filter(Boolean); } catch { return []; } };

// Whether a notice may hang right now. Exported for scripts/check-bulletin.mjs.
export function shouldShow(b, { date = today(), closed = [] } = {}) {
  if (!b?.show || !b.id || !Array.isArray(b.panels) || !b.panels.length) return false;
  if (b.until && date > b.until) return false;
  return !closed.includes(b.id);
}

// The notice that hangs: the first in the queue that may.
export const currentNotice = (list = NOTICES, opts = {}) => list.find((b) => shouldShow(b, opts)) || null;

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

export function hangBulletin(slot) {
  if (!slot) return;
  const closed = closedIds();
  const notice = currentNotice(NOTICES, { closed });
  if (!notice) return;
  slot.innerHTML = bulletinHTML(notice);
  const noren = slot.firstElementChild;
  noren.querySelector('.noren-x').addEventListener('click', () => {
    // Keep the last ten closed ids: enough for any queue we'd write, never a growing list.
    try { localStorage.setItem(KEY, [...closed.filter((id) => id !== notice.id), notice.id].slice(-10).join(',')); } catch { /* this visit only */ }
    noren.classList.add('is-lifting');
    const done = () => slot.replaceChildren();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else noren.addEventListener('animationend', done, { once: true });
    setTimeout(done, 600);
  });
}
