// Gangs in Flock (D-044, D-046, D-050): a habit taken on together. Flock lists them; each has its
// own page with the sugoroku board the gang walks, today's gang crane (folded one fold per member,
// naming who hasn't folded yet) and each member's figures so far. All of it comes from my_gangs(),
// which returns only members' ticks on the gang's habit; names from other accounts are escaped
// with esc().
import { esc } from '../lib/sanitize.js';
import { monthKey, monthShort } from '../lib/dates.js';
import { CADENCES, CADENCE_LABELS, WEEKDAY_SHORT, describe } from '../lib/schedule.js';
import { gangStatus, namesText, endFor, parseDay, dayKey, gangCranes, keepsakeOf, boardOf, LENGTHS, GANG_SIZE, GANG_LIMIT, GANG_NAME_MAX } from '../lib/gangs.js';
import { loadGangs, createGang, editGang, leaveGang, removeMember, createCard, loadKeepsakes, saveKeepsake } from '../lib/buddies-api.js';
import { APP_PATH } from '../config.js';
import { noteTrigger } from './note-trigger.js';
import { craneMark } from './paper.js';
import { boardHTML } from './sugoroku.js';

const short = (key) => { const { m, d } = parseDay(key); return `${d} ${monthShort(m)}`; };
const dayMonth = (ms) => { const d = new Date(ms); return `${d.getDate()} ${monthShort(d.getMonth() + 1)}`; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sched = (g) => { const t = describe({ cadence: g.cadence, weekdays: g.weekdays, timesPerWeek: g.timesPerWeek }); return t[0].toUpperCase() + t.slice(1); };
const runText = ({ n, unit }) => (n >= 2 ? ` · ${n}-${unit} run` : '');
const CONTROL = /[\x00-\x1f\x7f]/;

// The gang's crane: our own crane mark, in plain paper, coloured in from the bottom as far as the
// gang has folded today (frac 0 to 1).
function crane(frac) {
  return `<span class="gang-crane" style="--fold:${Math.max(0, Math.min(1, frac)).toFixed(3)}" aria-hidden="true">
    ${craneMark('var(--bg-3)', 'var(--bg-3)')}<span class="gang-crane-folded">${craneMark()}</span></span>`;
}

const UNIT_WORDS = { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'] };
const unitText = (n, unit) => UNIT_WORDS[unit][n === 1 ? 0 : 1];
// The seal of a tag: the code in a ring, fitted to its length (see .hanko in app.css).
const seal = (code, extra = '') => `<span class="hanko${extra}" data-len="${String(code).length}" aria-hidden="true">${esc(code)}</span>`;
const lengthOf = (a, b) => Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / 86400000) + 1;
const ymd = (k) => { const { y, m, d } = parseDay(k); return [y, m - 1, d]; };

export const GANG_PAPERS = ['ai', 'matcha', 'yamabuki', 'sakura', 'sora', 'kraft'];
const go = (hash) => { location.hash = hash; };
export const CHEVRON = '<svg class="flock-row-go" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const BACK = '<a class="back-link" href="#/flock"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Flock</a>';

export function createGangs({ store, sb, toast, rerender, today, userId }) {
  let gangs = [];
  let keepsakes = [];
  let draft = null;
  let error = '';
  const fresh = {};             // gang id -> the card just made for it
  let confirm = '';             // 'leave:<gang>' or 'remove:<gang>:<user>'

  const todayKey = () => dayKey(today());
  const blankDraft = (from = null) => {
    const h = from && store.view(monthKey(today().y, today().m)).habits.find((x) => x.id === from);
    return {
      name: h?.name?.slice(0, GANG_NAME_MAX) || '',
      cadence: h?.cadence || 'daily',
      weekdays: h?.weekdays?.length ? [...h.weekdays] : [1, 2, 3, 4, 5],
      timesPerWeek: h?.timesPerWeek || 3,
      starts: todayKey(),
      length: '30',
      habit: h && !store.challengeOf(h.id) ? h.id : '',
    };
  };

  async function load() {
    const c = await sb();
    [gangs, keepsakes] = await Promise.all([loadGangs(c), loadKeepsakes(c)]);
    // A gang this device thinks a habit belongs to, but which no longer has you: unlink it here.
    const mine = new Set(gangs.map((g) => g.id));
    for (const [id, gang] of Object.entries(store.get().links || {})) if (!mine.has(gang)) store.linkChallenge(id, null);
  }

  // Put the gang's habit in your tracker (or link one you have), from its start or today.
  function addHabit(g, existing = '') {
    if (existing && store.view(monthKey(today().y, today().m)).habits.some((h) => h.id === existing)) {
      store.linkChallenge(existing, g.id);
      return true;
    }
    const t = today();
    const from = todayKey() > g.starts ? t : parseDay(g.starts);
    const key = monthKey(from.y, from.m);
    store.ensureMonth(key);
    const id = store.addHabit(key, { name: g.name, cadence: g.cadence, weekdays: g.weekdays, timesPerWeek: g.timesPerWeek, start: from.d });
    if (!id) { toast('This month already has 50 habits, the most there can be.'); return false; }
    store.linkChallenge(id, g.id);
    return true;
  }

  // ---------- Views ----------
  // A gang in the Flock list: how it stands, at a glance.
  function row(g, i) {
    const s = gangStatus(g, today());
    const total = s.folded.length + s.waiting.length;
    let side;
    if (s.phase === 'soon') side = `<b>Starts ${short(g.starts)}</b><small>${plural(g.members.length, 'member')} so far</small>`;
    else if (s.phase === 'over') { const c = gangCranes(g, parseDay(g.ends)); side = `<b>Finished</b><small>${c.cranes} of ${c.periods} gang cranes</small>`; }
    else if (!s.due) side = '<b>Rest day</b><small>nothing to fold</small>';
    else side = `<b>${s.folded.length} of ${total}</b><small>folded ${{ day: 'today', week: 'this week', month: 'this month' }[s.period]}</small>`;
    const frac = s.phase === 'on' && s.due && total ? s.folded.length / total : s.phase === 'over' ? 1 : 0;
    const when = s.phase === 'on' ? `day ${s.day} of ${s.length}` : `${short(g.starts)} to ${short(g.ends)}`;
    return `<li><a class="flock-row" href="#/flock/gang/${g.id}" style="--c:var(--${GANG_PAPERS[i % GANG_PAPERS.length]})">
      <span class="flock-row-mark">${crane(frac)}</span>
      <span class="flock-row-main"><b>${esc(g.name)}</b><small>${sched(g)} · ${when}</small></span>
      <span class="flock-row-side">${side}</span>${CHEVRON}</a></li>`;
  }

  // The Gangs list: every gang, then "Start a gang".
  function list() {
    const full = gangs.length >= GANG_LIMIT;
    const end = full
      ? `<p class="flock-row flock-row--new"><span class="flock-row-main"><small>You're in ${GANG_LIMIT} gangs, the most there can be.</small></span></p>`
      : `<a class="flock-row flock-row--new" href="#/flock/gang/new"><span class="flock-row-mark flock-row-plus" aria-hidden="true">+</span>
          <span class="flock-row-main"><b>Start a gang</b><small>${gangs.length ? 'Another habit, another gang.' : 'A habit you take on together, each ticking your own.'}</small></span>${CHEVRON}</a>`;
    return `<section class="panel span-6 flock-gangs" aria-labelledby="gangs-h">
      <div class="panel-head"><h2 id="gangs-h">Gangs</h2><div class="flock-head-side"><p>${gangs.length ? plural(gangs.length, 'gang') : 'None yet'}</p>${noteTrigger('gangs', 'Why gangs?')}</div></div>
      <ul class="flock-list">${gangs.map(row).join('')}<li>${end}</li></ul>
    </section>`;
  }

  // Starting a gang, on its own page.
  function startPage() {
    if (!draft) draft = blankDraft();
    const habits = store.view(monthKey(today().y, today().m)).habits;
    const full = gangs.length >= GANG_LIMIT;
    return `<div class="title-row flock-page-title">${BACK}<h1>Start a gang</h1>
      <p class="finding">Some habits are easier with company. Each of you ticks your own; you see each other's ticks on that habit, and nothing else.</p></div>
      <div class="board"><section class="panel span-8" aria-label="The gang's habit">${full ? `<p class="note">You're in ${GANG_LIMIT} gangs, the most there can be.</p>` : startForm(habits)}</section></div>`;
  }

  // A gang's own page: the board, today, the members, and its settings.
  function page(id) {
    const i = gangs.findIndex((x) => x.id === id);
    if (i < 0) {
      return `<div class="title-row flock-page-title">${BACK}<h1>Not your gang</h1>
        <p class="finding">This gang isn't one of yours any more. It may have ended, or you left it.</p></div>`;
    }
    const g = gangs[i];
    const s = gangStatus(g, today());
    const me = g.members.find((x) => x.me);
    const linkedHere = Object.entries(store.get().links || {}).some(([, gang]) => gang === g.id);
    const cr = gangCranes(g, s.phase === 'over' ? parseDay(g.ends) : today());
    return `<div class="title-row flock-page-title">${BACK}<h1>${esc(g.name)}</h1>
      <p class="finding">${sched(g)} · ${short(g.starts)} to ${short(g.ends)}${s.phase === 'on' ? ` · day ${s.day} of ${s.length}` : ''} · ${plural(g.members.length, 'member')}</p></div>
      ${me && !me.linked && !linkedHere && s.phase !== 'over' ? `<p class="gang-unlinked">${esc(g.name)} isn't in your tracker yet. <button class="btn btn--quiet" type="button" data-gang-add="${g.id}">Add it to my habits</button></p>` : ''}
      <div class="board gang-page${s.phase === 'over' ? ' is-over' : ''}">
        <div class="span-8 side-stack">
          ${s.phase === 'over' ? `<section class="panel gang-cert-panel" aria-label="Finished">${certificate(g, i)}</section>` : ''}
          <section class="panel sugoroku-panel" aria-labelledby="board-h">
            <div class="panel-head"><h2 id="board-h">The board</h2><p>${cr.periods ? `${cr.cranes} of ${cr.periods} ${unitText(cr.periods, cr.unit)} so far, everyone folded` : 'The gang sets off soon'}</p></div>
            ${boardHTML(g, boardOf(g, today()))}
          </section>
          ${settingsPanel(g, i, s)}
        </div>
        <div class="span-4 side-stack">
          ${s.phase === 'over' ? '' : todayPanel(g, s)}
          ${membersPanel(s)}
        </div>
      </div>`;
  }

  function todayPanel(g, s) {
    const total = s.folded.length + s.waiting.length;
    const unit = { day: 'today', week: 'this week', month: 'this month' }[s.period];
    let text;
    if (s.phase === 'soon') text = `<p class="gang-today-main">Starts ${short(g.starts)}</p><p class="note">Hand out cards while you wait.</p>`;
    else if (!s.due) text = '<p class="gang-today-main">A rest day</p><p class="note">Nothing to fold today.</p>';
    else {
      text = `<p class="gang-today-main">${s.folded.length} of ${total} folded ${unit}</p>
        <p class="note">${s.waiting.length === 0 && total
    ? (total > 1 ? `Everyone folded ${unit}. The gang's crane is done.` : `Folded ${unit}.`)
    : `Still to fold ${unit}: ${esc(namesText(s.waiting))}.`}</p>`;
    }
    const frac = s.phase === 'on' && s.due && total ? s.folded.length / total : 0;
    return `<section class="panel gang-crane-panel" aria-labelledby="gt-h"><div class="panel-head"><h2 id="gt-h">The gang's crane</h2></div>
      <div class="gang-today">${crane(frac)}<div>${text}</div></div></section>`;
  }

  function membersPanel(s) {
    const now = s.phase === 'on' && s.due;
    return `<section class="panel gang-members-panel" aria-labelledby="gm-h"><div class="panel-head"><h2 id="gm-h">The gang</h2><p>in the order they joined</p></div>
      <ul class="gang-members">${s.members.map((x) => `<li>${seal(x.code)}
        <span class="gang-member-name">${esc(x.name)}${x.me && x.owner ? ' <em>you, running it</em>' : x.me ? ' <em>you</em>' : x.owner ? ' <em>runs it</em>' : ''}</span>
        ${now && x.linked ? `<span class="gang-member-now${x.doneNow ? ' is-done' : ''}">${x.doneNow ? 'Folded' : 'Not yet'}</span>` : ''}
        <span class="gang-member-figure">${!x.linked ? 'No habit for it yet' : s.phase === 'soon' ? 'Ready to start' : `${x.done} of ${x.due} due${runText(x.run)}`}</span></li>`).join('')}</ul>
    </section>`;
  }

  function startForm(habits) {
    const d = draft;
    const days = d.cadence === 'weekdays'
      ? `<fieldset class="gang-days"><legend class="note">On these days</legend>${WEEKDAY_SHORT.map((w, i) => `<label><input type="checkbox" data-gang-wd="${i + 1}" ${d.weekdays.includes(i + 1) ? 'checked' : ''}> ${w}</label>`).join('')}</fieldset>` : '';
    const times = d.cadence === 'times_per_week'
      ? `<label>Times a week<input type="number" min="1" max="7" name="times" data-focus="gang-times" value="${esc(d.timesPerWeek)}"></label>` : '';
    const max = endFor(todayKey(), 32);
    const ends = endFor(d.starts, Number(d.length));
    return `<form class="gang-form" data-gang-form novalidate>
      <label class="wide">The habit, together<input name="name" maxlength="${GANG_NAME_MAX}" data-focus="gang-name" value="${esc(d.name)}" placeholder="Run 5 km" required></label>
      <label>Repeats<select name="cadence" data-focus="gang-cadence">${CADENCES.map((c) => `<option value="${c}" ${c === d.cadence ? 'selected' : ''}>${CADENCE_LABELS[c]}</option>`).join('')}</select></label>
      ${times}
      <label>Starts<input type="date" name="starts" data-focus="gang-starts" min="${todayKey()}" max="${max}" value="${esc(d.starts)}"></label>
      <label>For<select name="length" data-focus="gang-length">${LENGTHS.map(([n, label]) => `<option value="${n}" ${n === d.length ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      ${days}
      <label class="wide">In your tracker<select name="habit" data-focus="gang-habit">
        <option value="">A new habit with this name</option>
        ${habits.filter((h) => !store.challengeOf(h.id)).map((h) => `<option value="${esc(h.id)}" ${h.id === d.habit ? 'selected' : ''}>${esc(h.name)}, which I have already</option>`).join('')}
      </select></label>
      <p class="note wide">Until ${short(ends)}. Once it starts, the schedule stays as it is, so nobody's progress gets rewritten.</p>
      <p class="field-error wide" role="alert">${esc(error)}</p>
      <div class="backup-actions wide"><button class="btn" type="submit">Start the gang</button><button class="seg-link" type="button" data-gang-cancel>Not now</button></div>
    </form>`;
  }

  // When a gang ends: a certificate (a shojo), with the gang cranes everyone folded and each
  // member's figures, to keep on your Year (D-047).
  function certificate(g, i) {
    const { cranes, periods, unit } = gangCranes(g, parseDay(g.ends));
    const s = gangStatus(g, parseDay(g.ends));
    const members = s.members.filter((x) => x.linked);
    return `<article class="gang--done" aria-labelledby="gang-h-${i}">
      <div class="certificate"><div class="cert-head">
        <p class="cert-kicker" aria-hidden="true">シュウリョウ</p>
        <h3 id="gang-h-${i}">${esc(g.name)}</h3>
        <p class="note">${sched(g)} · ${short(g.starts)} to ${short(g.ends)} · ${lengthOf(g.starts, g.ends)} days</p>
        <p class="cert-cranes"><b>${cranes}</b><span>of ${periods} ${unitText(periods, unit)} everyone folded</span></p></div>
        ${members.length ? `<ul class="cert-members">${members.map((x) => `<li>${seal(x.code)}<span class="cert-name">${esc(x.name)}</span><span class="cert-figure">${x.done} of ${x.due} due</span></li>`).join('')}</ul>` : ''}
        <div class="cert-foot"><p class="note">Your habit stays in your tracker. Remove it on the Habits page whenever you're done with it.</p>
        <div class="backup-actions"><button class="btn" type="button" data-gang-keep="${g.id}">Keep it on my Year</button><button class="btn btn--quiet" type="button" data-gang-again="${g.id}">Fold it again</button></div></div>
      </div>
    </article>`;
  }

  function settingsPanel(g, i, s) {
    const me = g.members.find((x) => x.me);
    const owner = me?.owner;
    const card = fresh[g.id];
    const link = card ? `${location.origin}${APP_PATH}#/flock/card/${card.token}` : '';
    return `<section class="panel gang-settings" aria-labelledby="gs-h"><div class="panel-head"><h2 id="gs-h">Invite, change or leave</h2></div>
      ${s.phase !== 'over' && g.members.length < GANG_SIZE ? (card
    ? `<label class="note" for="gang-link-${i}">A card for ${esc(g.name)}, good until ${dayMonth(card.until)}. It works once; this is the only time it's shown.</label>
          <input id="gang-link-${i}" class="card-link" readonly value="${esc(link)}" data-focus="gang-link-${g.id}">
          <div class="backup-actions"><button class="btn" type="button" data-gang-copy="${i}">Copy link</button></div>`
    : `<p class="note">${plural(GANG_SIZE - g.members.length, 'place')} left. Anyone with a card can join; they don't need to be your buddy.</p>
          <button class="btn btn--quiet" type="button" data-gang-card="${g.id}">Make a card for this gang</button>`) : ''}
      ${owner ? `<form class="gang-edit" data-gang-edit="${g.id}">
        <label>Name<input name="name" maxlength="${GANG_NAME_MAX}" value="${esc(g.name)}" data-focus="gang-edit-name-${g.id}"></label>
        <label>Ends<input type="date" name="ends" min="${g.ends}" max="${endFor(g.starts, 367)}" value="${g.ends}" data-focus="gang-edit-ends-${g.id}"></label>
        <button class="btn btn--quiet" type="submit">Save</button>
        <p class="note">You run this gang: you can rename it, make it last longer, and remove people.</p>
      </form>
      ${g.members.filter((x) => !x.me).map((x) => (confirm === `remove:${g.id}:${x.id}`
    ? `<p class="gang-confirm">Remove ${esc(x.name)} from ${esc(g.name)}? Their habit stays theirs. <button class="btn" type="button" data-gang-remove-yes="${g.id}:${x.id}">Remove</button> <button class="seg-link" type="button" data-gang-confirm-no>Keep them</button></p>`
    : `<button class="seg-link" type="button" data-gang-remove="${g.id}:${x.id}">Remove ${esc(x.name)}</button>`)).join(' ')}` : ''}
      ${confirm === `leave:${g.id}`
    ? `<p class="gang-confirm">Leave ${esc(g.name)}? Your habit and its ticks stay in your tracker; the gang stops seeing them.${owner && g.members.length > 1 ? ' Whoever has been in longest will run it.' : ''}${g.members.length === 1 ? ' You\'re the last one, so the gang ends.' : ''}
          <button class="btn" type="button" data-gang-leave-yes="${g.id}">Leave</button> <button class="seg-link" type="button" data-gang-confirm-no>Stay</button></p>`
    : `<button class="seg-link gang-leave" type="button" data-gang-leave="${g.id}">Leave the gang</button>`}
    </section>`;
  }

  // ---------- Actions ----------
  async function act(fn, done = () => {}) {
    try { await fn(await sb()); done(); } catch (err) { toast(err.message); }
    rerender();
  }
  const reload = (c) => load(c);

  async function submitStart(form) {
    const name = form.name.value.trim();
    draft = { ...draft, name, cadence: form.cadence.value, starts: form.starts.value, length: form.length.value, habit: form.habit.value };
    if (draft.cadence === 'times_per_week') draft.timesPerWeek = Number(form.times.value) || 0;
    const max = endFor(todayKey(), 32);
    error = !name ? 'Give the habit a name.'
      : CONTROL.test(name) ? 'Letters, numbers and punctuation only.'
        : !CADENCES.includes(draft.cadence) ? 'Pick how often it repeats.'
          : draft.cadence === 'weekdays' && !draft.weekdays.length ? 'Pick at least one day.'
            : draft.cadence === 'times_per_week' && !(draft.timesPerWeek >= 1 && draft.timesPerWeek <= 7) ? '1 to 7 times a week.'
              : !(draft.starts >= todayKey() && draft.starts <= max) ? 'It starts between today and a month from now.'
                : !LENGTHS.some(([n]) => n === draft.length) ? 'Pick how long it lasts.' : '';
    if (error) return rerender();
    const g = {
      name, cadence: draft.cadence, weekdays: draft.weekdays.slice().sort(), timesPerWeek: draft.timesPerWeek,
      starts: draft.starts, ends: endFor(draft.starts, Number(draft.length)),
    };
    const habit = draft.habit;
    return act(async (c) => {
      g.id = await createGang(c, g);
      addHabit(g, habit);
      await reload(c);
      draft = null; error = '';
      go(`#/flock/gang/${g.id}`);
    }, () => toast(`${g.name} has started. Make a card to invite your gang.`));
  }

  return {
    list,
    page,
    startPage,
    load,
    addHabit,
    // Just joined through a card: put the new gang's habit in the tracker, and open its page.
    async joined() {
      const before = new Set(gangs.map((g) => g.id));
      await load();
      const g = gangs.find((x) => !before.has(x.id));
      if (g) { addHabit(g); go(`#/flock/gang/${g.id}`); }
    },
    // The stamp book on the Year view: the gangs you kept that ended in `year` (D-047).
    stampBook(year) {
      const kept = keepsakes.filter((k) => k.ends.startsWith(`${year}-`));
      if (!kept.length) return '';
      return `<section class="panel span-12 stamp-book" aria-labelledby="book-h">
        <div class="panel-head"><h2 id="book-h">Stamp book</h2><p>${plural(kept.length, 'gang')} finished in ${year}</p></div>
        <div class="book-scroll"><ol class="book">${kept.map((k) => `<li class="book-page">
          <h3>${esc(k.name)}</h3>
          <p class="note">${short(k.starts)} to ${short(k.ends)}</p>
          <div class="book-seals">${k.members.map((x) => seal(x.code)).join('')}</div>
          <p class="book-cranes"><b>${k.cranes}</b> of ${k.periods} ${unitText(k.periods, k.unit)} everyone folded</p>
          <ul class="visually-hidden">${k.members.map((x) => `<li>${esc(x.name)}: ${x.done} of ${x.due} due</li>`).join('')}</ul>
        </li>`).join('')}</ol></div>
      </section>`;
    },
    reset() { keepsakes = []; gangs = []; draft = null; error = ''; confirm = ''; for (const k of Object.keys(fresh)) delete fresh[k]; },
    // "Fold it with friends" from the Habits page: the start form, filled in from that habit.
    startFrom(habitId) { draft = blankDraft(habitId); error = ''; },
    onSubmit(e) {
      const form = e.target.closest('[data-gang-form]');
      if (form) { e.preventDefault(); submitStart(form); return true; }
      const edit = e.target.closest('[data-gang-edit]');
      if (edit) {
        e.preventDefault();
        const name = edit.name.value.trim();
        const ends = edit.ends.value;
        if (!name || CONTROL.test(name) || !/^\d{4}-\d{2}-\d{2}$/.test(ends)) { toast('Check the name and the end date.'); return true; }
        act(async (c) => { await editGang(c, edit.dataset.gangEdit, name, ends); await reload(c); }, () => toast('Saved.'));
        return true;
      }
      return false;
    },
    onChange(t) {
      if (!t.closest('[data-gang-form]')) return false;
      const form = t.closest('[data-gang-form]');
      if (t.matches('[data-gang-wd]')) {
        const w = Number(t.dataset.gangWd);
        draft.weekdays = t.checked ? [...new Set([...draft.weekdays, w])] : draft.weekdays.filter((x) => x !== w);
        return true;
      }
      draft = { ...draft, name: form.name.value, cadence: form.cadence.value, starts: form.starts.value, length: form.length.value, habit: form.habit.value };
      if (t.name === 'habit' && t.value) {
        const h = store.view(monthKey(today().y, today().m)).habits.find((x) => x.id === t.value);
        if (h) draft = { ...draft, name: h.name.slice(0, GANG_NAME_MAX), cadence: h.cadence || 'daily', weekdays: h.weekdays?.length ? [...h.weekdays] : draft.weekdays, timesPerWeek: h.timesPerWeek || draft.timesPerWeek };
      }
      if (form.times) draft.timesPerWeek = Number(form.times.value) || draft.timesPerWeek;
      if (['cadence', 'habit', 'starts', 'length'].includes(t.name)) rerender();
      return true;
    },
    onClick(t) {
      // A finished gang: keep its certificate on the Year, leave it, and maybe start it again.
      const keep = t.closest('[data-gang-keep], [data-gang-again]');
      if (keep) {
        const again = keep.matches('[data-gang-again]');
        const id = keep.dataset.gangKeep || keep.dataset.gangAgain;
        const g = gangs.find((x) => x.id === id);
        if (!g) return true;
        const habit = Object.entries(store.get().links || {}).find(([, gang]) => gang === id)?.[0] || '';
        const k = keepsakeOf(g);
        act(async (c) => {
          if (k.members.length) await saveKeepsake(c, userId(), k);
          await leaveGang(c, id);
          if (habit) store.linkChallenge(habit, null);
          await load();
          if (again) {
            draft = { ...blankDraft(habit), name: g.name.slice(0, GANG_NAME_MAX), cadence: g.cadence, weekdays: g.weekdays || [1, 2, 3, 4, 5], timesPerWeek: g.timesPerWeek || 3 };
            go('#/flock/gang/new');
          } else go('#/flock');
        }, () => toast(again ? `${g.name} is in your stamp book. Here it is again: pick the dates, then hand out new cards.` : `${g.name} is in your stamp book, on the Year.`));
        return true;
      }
      if (t.closest('[data-gang-cancel]')) { draft = null; error = ''; go('#/flock'); return true; }
      const add = t.closest('[data-gang-add]');
      if (add) {
        const g = gangs.find((x) => x.id === add.dataset.gangAdd);
        if (g && addHabit(g)) toast(`${g.name} is in your habits now.`);
        rerender();
        return true;
      }
      const mk = t.closest('[data-gang-card]');
      if (mk) {
        const id = mk.dataset.gangCard;
        act(async (c) => { fresh[id] = await createCard(c, id); }, () => toast('A card for the gang, ready to send.'));
        return true;
      }
      const copy = t.closest('[data-gang-copy]');
      if (copy) {
        const input = document.getElementById(`gang-link-${copy.dataset.gangCopy}`);
        navigator.clipboard?.writeText(input.value).then(() => toast('Link copied.'), () => { input.select(); toast('Select the link and copy it.'); });
        return true;
      }
      const leave = t.closest('[data-gang-leave]');
      if (leave) { confirm = `leave:${leave.dataset.gangLeave}`; rerender(); return true; }
      const rm = t.closest('[data-gang-remove]');
      if (rm) { confirm = `remove:${rm.dataset.gangRemove}`; rerender(); return true; }
      if (t.closest('[data-gang-confirm-no]')) { confirm = ''; rerender(); return true; }
      const leaveYes = t.closest('[data-gang-leave-yes]');
      if (leaveYes) {
        const id = leaveYes.dataset.gangLeaveYes;
        const g = gangs.find((x) => x.id === id);
        confirm = '';
        act(async (c) => {
          await leaveGang(c, id);
          for (const [habit, gang] of Object.entries(store.get().links || {})) if (gang === id) store.linkChallenge(habit, null);
          await reload(c);
          go('#/flock');
        }, () => toast(`You left ${g?.name || 'the gang'}. The habit is still yours.`));
        return true;
      }
      const rmYes = t.closest('[data-gang-remove-yes]');
      if (rmYes) {
        const [id, user] = rmYes.dataset.gangRemoveYes.split(':');
        confirm = '';
        act(async (c) => { await removeMember(c, id, user); await reload(c); }, () => toast('Removed.'));
        return true;
      }
      return false;
    },
  };
}
