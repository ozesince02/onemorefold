// Flock (D-044): buddies, as name cards. Your tag is a hanko; adding a buddy is handing over your
// card (a one-time link). Everything about a buddy comes from my_buddies(), which returns only what
// their level allows (D-029); your own figures are worked out here and published for them (D-045).
// All text from the account (tags, habit names) is escaped with esc() when shown.
import { esc } from '../lib/sanitize.js';
import { monthName, monthKey } from '../lib/dates.js';
import { STORE_KEY, APP_PATH } from '../config.js';
import { nameProblem, codeProblem, cleanCode, suggestCode, tagText, NAME_MAX } from '../lib/tags.js';
import { LEVELS, LEVEL_LABELS, LEVEL_HINTS, figuresOf, trendOf, ageOf, INVITE_DAYS, BUDDY_LIMIT } from '../lib/buddies.js';
import {
  CARD_TOKEN, loadMyTag, saveMyTag, createCard, openCards, takeBackCard, peekCard, acceptCard, declineCard,
  loadBuddies, saveSharing, removeBuddy, publishFigures,
} from '../lib/buddies-api.js';
import { noteTrigger } from './note-trigger.js';

// A card someone handed you waits here (this tab only) while you sign in or pick a tag.
const CARD_KEY = `${STORE_KEY}:card`;
const readCard = () => { try { const t = sessionStorage.getItem(CARD_KEY); return CARD_TOKEN.test(t || '') ? t : ''; } catch { return ''; } };
const writeCard = (t) => { try { if (t) sessionStorage.setItem(CARD_KEY, t); else sessionStorage.removeItem(CARD_KEY); } catch { /* private window */ } };

// "#/flock/card/<token>": keep the token, and take it out of the address bar and history.
export function captureCard() {
  const m = location.hash.match(/^#\/flock\/card\/([A-Za-z0-9_-]{43})$/);
  if (!m) return false;
  writeCard(m[1]);
  history.replaceState(null, '', `${location.pathname}#/flock`);
  return true;
}

// The paper behind each card, in the order buddies arrived.
const CARD_PAPERS = ['sora', 'sakura', 'matcha', 'yamabuki', 'kraft'];
const dayMonth = (ms) => { const d = new Date(ms); return `${d.getDate()} ${monthName(d.getMonth() + 1)}`; };
const dateText = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${monthName(m)}`; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const hanko = (code, size = '') => `<span class="hanko${size ? ` hanko--${size}` : ''}" aria-hidden="true">${esc(code)}</span>`;

export function createFlock({ view, store, getClient, toast, rerender, openAccount, today }) {
  let account = { status: 'loading' };
  let loaded = false;           // tag, buddies and cards fetched for this account
  let loading = null;
  let failed = '';
  let me = null;                // { name, code } or null
  let buddies = [];
  let cards = [];
  let fresh = null;             // the card just made: { token, until }; its link can't be shown again later
  let card = { token: readCard(), peek: null, asked: false, level: 'doing', busy: false };
  let draft = { name: '', code: suggestCode(), error: '', busy: false };
  let removing = '';            // buddy id waiting for "Remove" to be confirmed
  const openShares = new Set(); // buddy cards whose "You share" is open, kept across redraws
  let changeOpen = false;       // "Change your tag" open
  let published = '';           // what buddy_figures holds, as far as this tab knows

  const sb = () => getClient();
  const signedIn = () => account.status === 'signed-in' && account.id;

  async function load() {
    if (!signedIn()) return;
    const uid = account.id;
    loading ||= (async () => {
      try {
        const client = await sb();
        [me, buddies, cards] = await Promise.all([loadMyTag(client, uid), loadBuddies(client), openCards(client)]);
        if (account.id !== uid) return;
        loaded = true; failed = '';
        if (!me) draft.name ||= '';
        publish();
      } catch (err) {
        failed = err.message;
      } finally {
        loading = null;
        rerender();
      }
    })();
    return loading;
  }

  async function peek() {
    card.peek = null;
    card.asked = true;
    try { card.peek = await peekCard(await sb(), card.token); } catch (err) { card.peek = { state: 'error', message: err.message }; }
    rerender();
  }

  // Your figures, for buddies who are shown any; nothing stored when nobody is. Debounced, and
  // sent only when they've changed.
  let timer = 0;
  function publish(delay = 0) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!signedIn() || !loaded) return;
      const sharing = buddies.filter((b) => b.myLevel !== 'none');
      const picked = buddies.filter((b) => b.myLevel === 'habits').flatMap((b) => b.myHabits);
      const figures = sharing.length ? figuresOf(store.get(), today(), picked) : null;
      const sig = JSON.stringify(figures);
      if (sig === published) return;
      try { await publishFigures(await sb(), account.id, figures); published = sig; } catch { /* tried again on the next change */ }
    }, delay);
  }

  function onAccount(next) {
    const changed = next.id !== account.id || next.status !== account.status;
    account = next;
    if (!changed) return;
    loaded = false; me = null; buddies = []; cards = []; fresh = null; published = ''; removing = '';
    card.peek = null; card.asked = false;
    if (signedIn()) load();
  }

  // ---------- Views ----------
  function render() {
    card.token = card.token || readCard();
    const head = (note = '') => `<div class="title-row flock-title"><h1>Flock <span class="sfx flock-sfx" aria-hidden="true">ナカマ</span></h1>
      ${note ? `<p class="finding">${note}</p>` : ''}
      <div class="flock-why">${noteTrigger('buddies', 'Why buddies?')}</div></div>`;

    if (account.status === 'unavailable') {
      return `${head()}<section class="panel flock-slip"><h2>Flock needs accounts</h2><p class="note">Accounts aren't set up on this copy of One More Fold, so there's nobody to fold with yet.</p></section>`;
    }
    if (account.status !== 'signed-in') {
      const waiting = card.token
        ? '<h2>Someone handed you their card</h2><p>Sign in to open it. Buddies see your tag, never your email.</p>'
        : '<h2>Fold with friends</h2><p>Add the people you\'d text anyway, and choose how much each of them sees. Sign in to hand over your card.</p>';
      return `${head()}<section class="panel flock-slip">${waiting}
        <button class="btn" type="button" data-flock-signin ${account.status === 'loading' ? 'disabled' : ''}>Sign in</button></section>`;
    }
    if (!loaded) {
      return `${head()}<section class="panel flock-slip" aria-live="polite">${failed
        ? `<p>${esc(failed)}</p><button class="btn btn--quiet" type="button" data-flock-retry>Try again</button>`
        : '<p class="note">Opening the flock…</p>'}</section>`;
    }
    if (!me) {
      return `${head()}${card.token ? '<p class="flock-pending note">Pick your tag first; then the card you were handed opens.</p>' : ''}
        <section class="panel flock-carve" aria-labelledby="carve-h">
          <div class="panel-head"><h2 id="carve-h">Carve your card</h2><p>How buddies will see you</p></div>
          ${tagForm('Keep it')}
        </section>`;
    }
    if (card.token && !card.asked) queueMicrotask(peek);
    return `${head(`You're <strong>${esc(tagText(me.name, me.code))}</strong>. Nobody can search for you: buddies join with your card.`)}
      ${card.token ? cardSlip() : ''}
      <div class="board">
        <section class="panel span-8 flock-buddies" aria-labelledby="buddies-h">
          <div class="panel-head"><h2 id="buddies-h">Buddies</h2><p>${buddies.length ? `${plural(buddies.length, 'buddy', 'buddies')} · their last 7 days` : 'Nobody yet'}</p></div>
          <div class="meishi-grid">${buddies.map(buddyCard).join('')}${handOver()}</div>
        </section>
        <div class="span-4 side-stack">
          <section class="panel" aria-labelledby="mycard-h">
            <div class="panel-head"><h2 id="mycard-h">Your card</h2></div>
            <div class="my-card">${hanko(me.code, 'big')}<p class="my-card-tag">${esc(me.name)}<span>#${esc(me.code)}</span></p></div>
            <details class="flock-change" data-change-open ${changeOpen ? 'open' : ''}><summary>Change your tag</summary>${tagForm('Save the new tag')}</details>
          </section>
          ${cardsPanel()}
        </div>
      </div>`;
  }

  function tagForm(label) {
    return `<form class="tag-form" data-tag-form novalidate>
      <div class="tag-fields">
        <label>Name<input name="name" data-focus="tag-name" maxlength="${NAME_MAX * 2}" autocomplete="nickname" spellcheck="false" value="${esc(draft.name)}" placeholder="oze" required></label>
        <span class="tag-hash" aria-hidden="true">#</span>
        <label>Code<input name="code" data-focus="tag-code" maxlength="5" autocomplete="off" spellcheck="false" value="${esc(draft.code)}" required></label>
        <button class="seg-link" type="button" data-tag-new>New code</button>
      </div>
      <p class="field-error" role="alert">${esc(draft.error)}</p>
      <p class="note">Letters and numbers, in any language. Nobody can search for your tag, and you can change it any time.</p>
      <button class="btn" type="submit" ${draft.busy ? 'disabled' : ''}>${label}</button>
    </form>`;
  }

  // A buddy's name card: their figures as their level allows, and what you share with them.
  function buddyCard(b, i) {
    const f = b.figures;
    let body;
    if (b.theirLevel === 'none') body = '<p class="note">Just buddies: they keep their habits to themselves.</p>';
    else if (!f || !f.week_due) body = '<p class="note">No figures yet. They appear once they\'ve had something due.</p>';
    else {
      const trend = trendOf(f);
      const age = ageOf(f.as_of, today());
      body = `<p class="meishi-figure"><b>${f.week_done} of ${f.week_due}</b> due, last 7 days</p>
        ${trend ? `<p class="meishi-trend meishi-trend--${trend}">${{ rising: 'Rising', steady: 'Steady', quieter: 'Quieter lately' }[trend]}</p>` : ''}
        <p class="note">${f.month_done} of ${f.month_due} due, last 30 days${f.run >= 2 ? ` · longest run going: ${f.run} days` : ''}</p>
        ${b.habits.length ? `<ul class="meishi-habits">${b.habits.map((h) => `<li><span>${esc(h.name)}</span> ${h.done} of ${h.due} due</li>`).join('')}</ul>` : ''}
        ${age ? `<p class="note">As of ${dateText(f.as_of)}${age > 2 ? `, ${age} days ago` : ''}</p>` : ''}`;
    }
    const sharing = `<details class="meishi-share" data-share-open="${b.id}" ${openShares.has(b.id) || b.id === removing ? 'open' : ''}>
      <summary>You share: ${LEVEL_LABELS[b.myLevel]}</summary>
      <fieldset class="choice"><legend class="visually-hidden">What ${esc(b.name)} sees from you</legend>
        ${LEVELS.map((l) => `<label><input type="radio" name="lvl-${b.id}" value="${l}" data-share-level="${b.id}" data-focus="lvl-${b.id}-${l}" ${l === b.myLevel ? 'checked' : ''}><i></i><span><b>${LEVEL_LABELS[l]}</b> ${LEVEL_HINTS[l]}</span></label>`).join('')}
      </fieldset>
      ${b.myLevel === 'habits' ? habitPicker(b) : ''}
      ${b.id === removing
        ? `<div class="meishi-remove"><p>Remove ${esc(b.name)}? Neither of you sees anything about the other after this. They aren't told.</p>
            <button class="btn" type="button" data-buddy-remove-yes="${b.id}">Remove</button>
            <button class="seg-link" type="button" data-buddy-remove-no>Keep them</button></div>`
        : `<button class="seg-link meishi-remove-link" type="button" data-buddy-remove="${b.id}">Remove buddy</button>`}
    </details>`;
    return `<article class="meishi meishi--${CARD_PAPERS[i % CARD_PAPERS.length]}" aria-label="${esc(tagText(b.name, b.code))}">
      <header><h3>${esc(b.name)}</h3>${hanko(b.code)}</header>
      ${body}${sharing}
    </article>`;
  }

  // At "My habits": which of this month's habits this buddy sees. Private ones can't be picked.
  function habitPicker(b) {
    const t = today();
    const month = store.get().months[monthKey(t.y, t.m)]?.habits || [];
    if (!month.length) return '<p class="note">No habits this month to share yet.</p>';
    return `<fieldset class="rem-list share-habits"><legend class="note">Habits ${esc(b.name)} sees</legend>
      ${month.map((h) => {
        const priv = store.isPrivate(h.id);
        return `<label style="--c:${store.color(h.id)}"><input type="checkbox" data-share-habit="${b.id}:${h.id}" data-focus="sh-${b.id}-${h.id}" ${!priv && b.myHabits.includes(h.id) ? 'checked' : ''} ${priv ? 'disabled' : ''}><i></i><span>${esc(h.name)}${priv ? ' <em>(private)</em>' : ''}</span></label>`;
      }).join('')}
    </fieldset>`;
  }

  function handOver() {
    const full = buddies.length >= BUDDY_LIMIT;
    return `<div class="meishi meishi--new">
      <h3>Hand over your card</h3>
      <p class="note">${full ? `You have ${BUDDY_LIMIT} buddies, the most there can be.` : `A one-time link, good for ${INVITE_DAYS} days. Send it however you like.`}</p>
      ${full ? '' : '<button class="btn" type="button" data-card-make>Make a card</button>'}
    </div>`;
  }

  function cardsPanel() {
    const link = fresh ? `${location.origin}${APP_PATH}#/flock/card/${fresh.token}` : '';
    const others = cards.length - (fresh ? 1 : 0);
    if (!fresh && !cards.length) return '';
    return `<section class="panel" aria-labelledby="cards-h">
      <div class="panel-head"><h2 id="cards-h">Cards handed over</h2><p>${plural(cards.length, 'open card')}</p></div>
      ${fresh ? `<div class="fresh-card">
        <label class="note" for="card-link">Your new card, good until ${dayMonth(fresh.until)}. It works once; this is the only time it's shown.</label>
        <input id="card-link" class="card-link" readonly value="${esc(link)}" data-focus="card-link">
        <div class="backup-actions">
          <button class="btn" type="button" data-card-copy>Copy link</button>
          ${navigator.share ? '<button class="btn btn--quiet" type="button" data-card-share>Share</button>' : ''}
        </div></div>` : ''}
      ${others > 0 ? `<ul class="open-cards">${cards.filter((c) => !fresh || c.until !== fresh.until).map((c) => `<li><span>Good until ${dayMonth(c.until)}</span><button class="seg-link" type="button" data-card-back="${esc(c.hash)}">Take back</button></li>`).join('')}</ul>
        <p class="note">Older cards can't be shown again. Take one back if it went to the wrong place.</p>` : ''}
    </section>`;
  }

  // The card you were handed: who it's from, and what you'll share.
  function cardSlip() {
    const p = card.peek;
    const away = '<button class="seg-link" type="button" data-card-away>Put it away</button>';
    let inner;
    if (!p) inner = '<p class="note">Opening the card…</p>';
    else if (p.state === 'ok') {
      inner = `<div class="card-from">${hanko(p.code)}<div><p class="note">A card from</p><h2>${esc(tagText(p.name, p.code))}</h2><p>wants to be folding buddies.</p></div></div>
        <fieldset class="choice"><legend class="note">What ${esc(p.name)} sees from you (you can change it later)</legend>
          ${LEVELS.map((l) => `<label><input type="radio" name="card-level" value="${l}" data-card-level data-focus="card-level-${l}" ${l === card.level ? 'checked' : ''}><i></i><span><b>${LEVEL_LABELS[l]}</b> ${LEVEL_HINTS[l]}</span></label>`).join('')}
        </fieldset>
        <div class="backup-actions"><button class="btn" type="button" data-card-accept ${card.busy ? 'disabled' : ''}>Swap cards</button><button class="seg-link" type="button" data-card-decline>Not now</button></div>`;
    } else {
      inner = `<p>${{
        gone: "This card can't be opened any more. It was used, taken back, or it's more than 7 days old. Ask for a new one.",
        self: 'This is your own card. Send it to a friend instead.',
        already: `You and ${esc(p.name)} are already buddies.`,
        error: esc(p.message || "Couldn't open the card."),
      }[p.state]}</p>${away}`;
    }
    return `<section class="panel flock-card-slip" aria-labelledby="card-slip-h"><h2 id="card-slip-h" class="visually-hidden">A card you were handed</h2>${inner}</section>`;
  }

  // ---------- Actions ----------
  async function act(fn, after = () => {}) {
    try { await fn(await sb()); after(); } catch (err) { toast(err.message); }
    rerender();
  }

  async function submitTag(form) {
    const name = form.name.value.normalize('NFC');
    const code = cleanCode(form.code.value);
    draft = { ...draft, name, code, error: nameProblem(name) || codeProblem(code) };
    if (draft.error) { rerender(); return; }
    draft.busy = true; rerender();
    try {
      const r = await saveMyTag(await sb(), name, code);
      if (r === 'taken') draft.error = `${tagText(name, code)} is taken. Try another code.`;
      else {
        me = { name, code };
        changeOpen = false;
        draft = { name: '', code: suggestCode(), error: '', busy: false };
        toast(`You're ${tagText(name, code)}.`);
      }
    } catch (err) { draft.error = err.message; }
    draft.busy = false;
    rerender();
  }

  function clearCard() { writeCard(''); card = { token: '', peek: null, asked: false, level: 'doing', busy: false }; }

  // <details> forget being open when redrawn; remember it here. 'toggle' doesn't bubble.
  view.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.matches?.('[data-share-open]')) { if (d.open) openShares.add(d.dataset.shareOpen); else openShares.delete(d.dataset.shareOpen); }
    if (d.matches?.('[data-change-open]')) changeOpen = d.open;
  }, true);
  view.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-tag-form]');
    if (!form) return;
    e.preventDefault();
    submitTag(form);
  });
  view.addEventListener('input', (e) => {
    const form = e.target.closest('[data-tag-form]');
    if (form) { draft[e.target.name] = e.target.value; if (draft.error) { draft.error = ''; form.querySelector('.field-error').textContent = ''; } }
  });
  view.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-card-level]')) { card.level = LEVELS.includes(t.value) ? t.value : 'doing'; return; }
    if (t.matches('[data-share-level]')) {
      const b = buddies.find((x) => x.id === t.dataset.shareLevel);
      if (!b || !LEVELS.includes(t.value)) return;
      b.myLevel = t.value;
      return act((c) => saveSharing(c, account.id, b.id, b.myLevel, b.myHabits), () => { publish(); toast(`${b.name} now sees: ${LEVEL_LABELS[b.myLevel]}.`); });
    }
    if (t.matches('[data-share-habit]')) {
      const [id, slug] = t.dataset.shareHabit.split(':');
      const b = buddies.find((x) => x.id === id);
      if (!b || store.isPrivate(slug)) return;
      b.myHabits = t.checked ? [...new Set([...b.myHabits, slug])] : b.myHabits.filter((s) => s !== slug);
      return act((c) => saveSharing(c, account.id, b.id, b.myLevel, b.myHabits), () => publish());
    }
  });
  view.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-flock-signin]')) return openAccount();
    if (t.closest('[data-flock-retry]')) { failed = ''; rerender(); return load(); }
    if (t.closest('[data-tag-new]')) { draft.code = suggestCode(); draft.error = ''; return rerender(); }
    if (t.closest('[data-card-make]')) {
      return act(async (c) => { fresh = await createCard(c); cards = await openCards(c); }, () => toast('A new card, ready to send.'));
    }
    if (t.closest('[data-card-copy]')) {
      const input = view.querySelector('#card-link');
      return navigator.clipboard?.writeText(input.value).then(() => toast('Link copied.'), () => { input.select(); toast('Select the link and copy it.'); });
    }
    if (t.closest('[data-card-share]')) {
      const input = view.querySelector('#card-link');
      return navigator.share({ title: 'One More Fold', text: `A card from ${tagText(me.name, me.code)}: fold habits with me on One More Fold.`, url: input.value }).catch(() => {});
    }
    const back = t.closest('[data-card-back]');
    if (back) return act(async (c) => { await takeBackCard(c, back.dataset.cardBack); cards = await openCards(c); }, () => toast('Card taken back. Its link no longer works.'));
    if (t.closest('[data-card-accept]')) {
      card.busy = true; rerender();
      return act(async (c) => {
        const r = await acceptCard(c, card.token, card.level);
        if (r === 'ok') {
          toast(`You and ${tagText(card.peek.name, card.peek.code)} are buddies now.`);
          clearCard();
          buddies = await loadBuddies(c);
          publish();
        } else if (r === 'full') { card.busy = false; toast(`One of you already has ${BUDDY_LIMIT} buddies.`); }
        else { card.peek = { ...card.peek, state: r }; card.busy = false; }
      }, () => {});
    }
    if (t.closest('[data-card-decline]')) {
      const token = card.token;
      clearCard();
      sb().then((c) => declineCard(c, token)).catch(() => {});
      return rerender();
    }
    if (t.closest('[data-card-away]')) { clearCard(); return rerender(); }
    const rm = t.closest('[data-buddy-remove]');
    if (rm) { removing = rm.dataset.buddyRemove; return rerender(); }
    if (t.closest('[data-buddy-remove-no]')) { removing = ''; return rerender(); }
    const yes = t.closest('[data-buddy-remove-yes]');
    if (yes) {
      const b = buddies.find((x) => x.id === yes.dataset.buddyRemoveYes);
      removing = '';
      if (!b) return rerender();
      return act(async (c) => { await removeBuddy(c, b.id); buddies = buddies.filter((x) => x.id !== b.id); }, () => { publish(); toast(`Removed ${b.name}.`); });
    }
  });

  // Coming back to Flock, or to the tab: fresh figures from buddies.
  async function refresh() {
    if (!signedIn() || !loaded || !me) return;
    try { buddies = await loadBuddies(await sb()); rerender(); } catch { /* keep what's shown */ }
  }

  return { render, onAccount, refresh, onStore: () => publish(5000), hasCard: () => Boolean(card.token || readCard()) };
}
