// Gangs in Flock (D-044, D-046): a habit taken on together. Each gang shows today's crane, folded
// one fold per member and naming who hasn't folded yet, a banner of the last week's hanko stamps,
// and each member's figures so far. All of it comes from my_gangs(), which returns only members'
// ticks on the gang's habit; names from other accounts are escaped with esc().
import { esc } from '../lib/sanitize.js';
import { monthKey, monthShort } from '../lib/dates.js';
import { CADENCES, CADENCE_LABELS, WEEKDAY_SHORT, describe } from '../lib/schedule.js';
import { gangStatus, stampRows, namesText, endFor, parseDay, dayKey, gangCranes, keepsakeOf, LENGTHS, GANG_SIZE, GANG_LIMIT, GANG_NAME_MAX } from '../lib/gangs.js';
import { loadGangs, createGang, editGang, leaveGang, removeMember, createCard, loadKeepsakes, saveKeepsake } from '../lib/buddies-api.js';
import { APP_PATH } from '../config.js';
import { noteTrigger } from './note-trigger.js';
import { craneMark } from './paper.js';

const NARROW = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow' });
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

export function createGangs({ store, sb, toast, rerender, today, userId }) {
  let gangs = [];
  let keepsakes = [];
  let starting = false;
  let draft = null;
  let error = '';
  const fresh = {};             // gang id -> the card just made for it
  const open = new Set();       // gangs whose settings are open
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
  function render() {
    const habits = store.view(monthKey(today().y, today().m)).habits;
    const full = gangs.length >= GANG_LIMIT;
    // Like Buddies: the cards, then a dashed tile to start another, which opens into the form.
    const tile = full
      ? `<div class="gang gang--new"><p class="note">You're in ${GANG_LIMIT} gangs, the most there can be.</p></div>`
      : starting
        ? `<div class="gang gang--new gang--starting"><h3>Start a gang</h3>${startForm(habits)}</div>`
        : `<div class="gang gang--new"><h3>Start a gang</h3>
          <p class="note">${gangs.length ? 'Another habit, another gang.' : "Some habits are easier with company. Start a gang for one, then hand its card to up to nine friends. Each of you ticks your own; you see each other's ticks on that habit, and nothing else."}</p>
          <button class="btn" type="button" data-gang-start>Start a gang</button></div>`;
    return `<section class="panel span-12 flock-gangs" aria-labelledby="gangs-h">
      <div class="panel-head"><h2 id="gangs-h">Gangs</h2><div class="flock-head-side"><p>${gangs.length ? plural(gangs.length, 'gang') : 'None yet'}</p>${noteTrigger('gangs', 'Why gangs?')}</div></div>
      <div class="gang-list">${gangs.map(gangCard).join('')}${tile}</div>
    </section>`;
  }

  function startForm(habits) {
    const d = draft;
    const days = d.cadence === 'weekdays'
      ? `<fieldset class="gang-days"><legend class="note">On these days</legend>${WEEKDAY_SHORT.map((w, i) => `<label><input type="checkbox" data-gang-wd="${i + 1}" ${d.weekdays.includes(i + 1) ? 'checked' : ''}> ${w}</label>`).join('')}</fieldset>` : '';
    const times = d.cadence === 'times_per_week'
      ? `<label>Times a week<input type="number" min="1" max="7" name="times" data-focus="gang-times" value="${d.timesPerWeek}"></label>` : '';
    const max = endFor(todayKey(), 32);
    const ends = endFor(d.starts, Number(d.length));
    return `<form class="gang-form" data-gang-form novalidate>
      <label class="wide">The habit, together<input name="name" maxlength="${GANG_NAME_MAX}" data-focus="gang-name" value="${esc(d.name)}" placeholder="Run 5 km" required></label>
      <label>Repeats<select name="cadence" data-focus="gang-cadence">${CADENCES.map((c) => `<option value="${c}" ${c === d.cadence ? 'selected' : ''}>${CADENCE_LABELS[c]}</option>`).join('')}</select></label>
      ${times}${days}
      <label>Starts<input type="date" name="starts" data-focus="gang-starts" min="${todayKey()}" max="${max}" value="${d.starts}"></label>
      <label>For<select name="length" data-focus="gang-length">${LENGTHS.map(([n, label]) => `<option value="${n}" ${n === d.length ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
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
    return `<article class="gang gang--done" aria-labelledby="gang-h-${i}">
      <div class="certificate">
        <p class="cert-kicker" aria-hidden="true">シュウリョウ</p>
        <h3 id="gang-h-${i}">${esc(g.name)}</h3>
        <p class="note">${sched(g)} · ${short(g.starts)} to ${short(g.ends)} · ${lengthOf(g.starts, g.ends)} days</p>
        <p class="cert-cranes"><b>${cranes}</b><span>of ${periods} ${unitText(periods, unit)} everyone folded</span></p>
        ${members.length ? `<ul class="cert-members">${members.map((x) => `<li>${seal(x.code)}<span class="cert-name">${esc(x.name)}</span><span class="cert-figure">${x.done} of ${x.due} due</span></li>`).join('')}</ul>` : ''}
        <p class="note">Your habit stays in your tracker. Remove it on the Habits page whenever you're done with it.</p>
        <div class="backup-actions"><button class="btn" type="button" data-gang-keep="${g.id}">Keep it on my Year</button><button class="btn btn--quiet" type="button" data-gang-again="${g.id}">Fold it again</button></div>
      </div>
    </article>`;
  }

  function gangCard(g, i) {
    const s = gangStatus(g, today());
    if (s.phase === 'over') return certificate(g, i);
    const me = g.members.find((x) => x.me);
    const owner = me?.owner;
    const linkedHere = Object.entries(store.get().links || {}).some(([, gang]) => gang === g.id);
    const total = s.folded.length + s.waiting.length;
    let todayText;
    if (s.phase === 'soon') todayText = `<p class="gang-today-main">Starts ${short(g.starts)}</p><p class="note">${plural(g.members.length, 'member')} so far. Hand out the card while you wait.</p>`;
    else if (s.phase === 'over') todayText = `<p class="gang-today-main">Finished on ${short(g.ends)}</p><p class="note">${g.members.length > 1 ? 'Everyone\'s figures stay below.' : 'Your figures stay below.'}</p>`;
    else if (!s.due) todayText = '<p class="gang-today-main">A rest day</p><p class="note">Nothing to fold today.</p>';
    else {
      const unit = { day: 'today', week: 'this week', month: 'this month' }[s.period];
      todayText = `<p class="gang-today-main">${s.folded.length} of ${total} folded ${unit}</p>
        <p class="note">${s.waiting.length === 0 && total
    ? (total > 1 ? `Everyone folded ${unit}. The gang's crane is done.` : `Folded ${unit}.`)
    : `Still to fold ${unit}: ${esc(namesText(s.waiting))}.`}</p>`;
    }
    const frac = s.phase === 'on' && s.due && total ? s.folded.length / total : s.phase === 'over' ? 1 : 0;
    const stamps = stampRows(g, today());
    const banner = stamps.length ? `<div class="gang-banner">
      <div class="nobori" aria-hidden="true"><span>ガ</span><span>ン</span><span>バ</span><span>レ</span></div>
      <div class="stamps-scroll"><table class="stamps"><caption class="visually-hidden">Who folded, the last ${plural(stamps.length, 'day')}</caption>
        <thead><tr><th scope="col"><span class="visually-hidden">Member</span></th>${stamps.map((r) => `<th scope="col" title="${short(r.key)}">${NARROW.format(new Date(r.day.y, r.day.m - 1, r.day.d))}<small>${r.day.d}</small></th>`).join('')}<th scope="col">So far</th></tr></thead>
        <tbody>${s.members.map((mem, k) => `<tr>
          <th scope="row"><span class="stamp-name">${esc(mem.name)}${mem.owner ? ' <em>runs it</em>' : ''}</span></th>
          ${stamps.map((r) => `<td>${r.rest ? '<i class="stamp stamp--rest" title="Rest day"></i>' : r.stamped[k] ? `<i class="stamp stamp--on" title="Folded on ${short(r.key)}"></i>` : `<i class="stamp" title="Not folded on ${short(r.key)}"></i>`}</td>`).join('')}
          <td class="stamp-sum">${mem.linked ? `${mem.done} of ${mem.due} due${runText(mem.run)}` : 'No habit for it yet'}</td>
        </tr>`).join('')}</tbody>
      </table></div></div>` : '';

    const card = fresh[g.id];
    const link = card ? `${location.origin}${APP_PATH}#/flock/card/${card.token}` : '';
    const settings = `<details class="gang-settings" data-gang-open="${g.id}" ${open.has(g.id) || confirm.includes(g.id) ? 'open' : ''}>
      <summary>Invite, change or leave</summary>
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
    </details>`;

    return `<article class="gang" aria-labelledby="gang-h-${i}">
      <header><h3 id="gang-h-${i}">${esc(g.name)}</h3><p class="note">${sched(g)} · ${short(g.starts)} to ${short(g.ends)}${s.phase === 'on' ? ` · day ${s.day} of ${s.length}` : ''} · ${plural(g.members.length, 'member')}</p></header>
      ${me && !me.linked && !linkedHere && s.phase !== 'over' ? `<p class="gang-unlinked">${esc(g.name)} isn't in your tracker yet. <button class="btn btn--quiet" type="button" data-gang-add="${g.id}">Add it to my habits</button></p>` : ''}
      <div class="gang-body"><div class="gang-today">${crane(frac)}<div>${todayText}</div></div>${banner}</div>
      ${settings}
    </article>`;
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
      starting = false; draft = null; error = '';
      open.add(g.id);
    }, () => toast(`${g.name} has started. Make a card to invite your gang.`));
  }

  return {
    render,
    load,
    addHabit,
    // Just joined through a card: put the new gang's habit in the tracker.
    async joined() {
      const before = new Set(gangs.map((g) => g.id));
      await load();
      const g = gangs.find((x) => !before.has(x.id));
      if (g) addHabit(g);
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
    reset() { keepsakes = []; gangs = []; starting = false; draft = null; error = ''; confirm = ''; open.clear(); for (const k of Object.keys(fresh)) delete fresh[k]; },
    // "Fold it with friends" from the Habits page: the start form, filled in from that habit.
    startFrom(habitId) { starting = true; draft = blankDraft(habitId); error = ''; },
    onToggle(d) {
      if (d.matches?.('[data-gang-open]')) { if (d.open) open.add(d.dataset.gangOpen); else open.delete(d.dataset.gangOpen); }
    },
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
      if (['cadence', 'habit'].includes(t.name)) rerender();
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
            starting = true;
            draft = { ...blankDraft(habit), name: g.name.slice(0, GANG_NAME_MAX), cadence: g.cadence, weekdays: g.weekdays || [1, 2, 3, 4, 5], timesPerWeek: g.timesPerWeek || 3 };
          }
        }, () => toast(again ? `${g.name} is in your stamp book. Here it is again: pick the dates, then hand out new cards.` : `${g.name} is in your stamp book, on the Year.`));
        return true;
      }
      if (t.closest('[data-gang-start]')) { starting = true; draft = blankDraft(); error = ''; rerender(); return true; }
      if (t.closest('[data-gang-cancel]')) { starting = false; draft = null; error = ''; rerender(); return true; }
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
