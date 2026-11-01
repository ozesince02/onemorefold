// Hangs the noren (D-040) from src/data/bulletin.js under the landing page's header. Closing it is
// remembered on this device for this message only (a new id hangs it again). A per-device
// convenience in localStorage, under the store's key so "remove my folds" clears it too.
import { BULLETIN } from '../data/bulletin.js';
import { STORE_KEY, APP_PATH, PATCH_NOTES_PATH, PRIVACY_PATH, TERMS_PATH } from '../config.js';
import { esc } from '../lib/sanitize.js';

const KEY = `${STORE_KEY}:bulletin-closed`;
// Links may only go to the site's own pages, named here rather than typed as addresses.
const PAGES = { app: APP_PATH, 'patch-notes': PATCH_NOTES_PATH, privacy: PRIVACY_PATH, terms: TERMS_PATH };

const today = () => new Date().toISOString().slice(0, 10);

// Whether the noren should hang right now. Exported for scripts/check-bulletin.mjs.
export function shouldShow(b = BULLETIN, { date = today(), closedId = null } = {}) {
  if (!b?.show || !b.id || !Array.isArray(b.panels) || !b.panels.length) return false;
  if (b.until && date > b.until) return false;
  return closedId !== b.id;
}

export function bulletinHTML(b = BULLETIN) {
  const panels = b.panels.slice(0, 4).map((p) => `<li class="noren-panel">${esc(p)}</li>`).join('');
  const href = PAGES[b.link?.href];
  const link = href ? `<a class="noren-link" href="${esc(href)}">${esc(b.link.text)}</a>` : '';
  return `<section class="noren" aria-label="${esc(b.label || 'Notice')}">
    <span class="noren-rod" aria-hidden="true"></span>
    <ul class="noren-cloth">${panels}</ul>
    <div class="noren-foot">${link}<button class="noren-x" type="button" aria-label="Hide this notice">✕</button></div>
  </section>`;
}

export function hangBulletin(slot) {
  if (!slot) return;
  let closedId = null;
  try { closedId = localStorage.getItem(KEY); } catch { /* private window: show it */ }
  if (!shouldShow(BULLETIN, { closedId })) return;
  slot.innerHTML = bulletinHTML();
  const noren = slot.firstElementChild;
  noren.querySelector('.noren-x').addEventListener('click', () => {
    try { localStorage.setItem(KEY, BULLETIN.id); } catch { /* remembered for this visit only */ }
    noren.classList.add('is-lifting');
    const done = () => slot.replaceChildren();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else noren.addEventListener('animationend', done, { once: true });
    setTimeout(done, 600);
  });
}
