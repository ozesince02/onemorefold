import { gsap } from 'gsap';
import { store, STORE_KEY } from './lib/store.js';
import { today, monthKey, parseKey, shiftMonth, monthName, monthShort, dayLong, minutesOf, weekday, daysIn } from './lib/dates.js';
import { monthStats, yearStats, streakOf, runWords, percent, pct, VIEWS, VIEW_LABELS, rankHabits, rateOf, summarise } from './lib/stats.js';
import { habitWeeks, weekOf, describe, CADENCES, CADENCE_LABELS, WEEKDAY_SHORT, cadenceOf } from './lib/schedule.js';
import { craneMark, sfxPop, confetti } from './ui/paper.js';
import { hills, mountains, ring } from './ui/charts.js';
import { daysLeftInYear, longestRun } from './ui/insights.js';
import { clampKey, yearBounds, firstMonthKey, lastMonthKey, wishOf, foldedAt, yearToFold, closingHabits } from './lib/years.js';
import { esc } from './lib/sanitize.js';
import { CRANE_GOAL, CRANE_GOAL_TEXT } from './config.js';
import { createCraneStage } from './three/stage.js';
import { startAuth, getClient } from './lib/auth.js';
import { createAccountMenu } from './ui/account-menu.js';
import { createFlock, captureCard } from './ui/flock.js';
import { wireCraneNotes } from './ui/note-trigger.js';
import { watchTheme } from './lib/theme.js';
import { createSync, supabaseApi } from './lib/sync/engine.js';
import { startReminders, enableReminders, disableReminders, sendTestReminder, permissionState, nextReminder, setPushHere } from './ui/reminders.js';
import { pushSupported, needsHomeScreen, pushState, enablePush, disablePush, saveSettings, loadSummaries, saveSummaries, SUMMARY_TIMES } from './lib/push.js';
import { shouldAutoEnable, shouldInvite, pushChoice, setPushChoice, pushOwner, setPushOwner, inviteUntil, snoozeInvite, INVITE_DAYS } from './lib/push-default.js';

watchTheme();
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const view = $('#view');
const widget = $('.crane-widget');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const PAPERS = ['#C8302C', '#24496B', '#8EA46B', '#E9B33F', '#C9A57A', '#A9CBD6', '#E8C3BC', '#6E8C8A', '#B98A5E', '#D98E73', '#1E1B18'];
const NARROW = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow' });
const icon = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

$$('[data-mark]').forEach((el) => { el.innerHTML = craneMark(); });

let now = today();
let ui = { swatchFor: null, pct: null, protection: null, account: { status: 'loading' }, sync: { state: 'off', pending: 0 }, push: 'unknown' };
let stage = null;
let lastProgress = -1;

// ---------- Routing: #/month/2026-10, #/year/2026, #/habits/2026-10, #/fold/2026, #/flock ----------
// Only months from the first one with habits up to next month can be opened (D-017); anything
// else lands on the nearest month that can.
function route() {
  const [name = 'month', arg] = location.hash.replace(/^#\/?/, '').split('#')[0].split('/');
  const state = store.get();
  const current = monthKey(now.y, now.m);
  if (name === 'flock') return { name };
  if (name === 'year' || name === 'fold') {
    const { first } = yearBounds(state, now);
    const year = Math.min(now.y, Math.max(first, Number(arg) || now.y));
    // A year can be folded once it has ended, or from December while it ends.
    if (name === 'fold' && (year < now.y || now.m === 12)) return { name, year };
    return { name: 'year', year };
  }
  const key = clampKey(/^\d{4}-(0[1-9]|1[0-2])$/.test(arg || '') ? arg : current, state, now);
  return { name: name === 'habits' ? 'habits' : 'month', key };
}

// The address that matches a route, so a corrected route doesn't leave a wrong URL behind.
const hashOf = (r) => (r.name === 'flock' ? '#/flock' : `#/${r.name}/${r.key || r.year}`);

// ---------- Render ----------
let queued = false;
function scheduleRender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}

function render() {
  now = today();
  // This month always exists, as it did in the sheet; other months are saved only when edited.
  store.ensureMonth(monthKey(now.y, now.m));
  const r = route();
  const [path, anchor] = location.hash.replace(/^#\/?/, '').split('#');
  if (path && `#/${path}` !== hashOf(r)) history.replaceState(null, '', hashOf(r) + (anchor ? `#${anchor}` : ''));
  const focusKey = document.activeElement?.dataset?.focus;
  const gridScroll = $('.grid-scroll', view)?.scrollLeft || 0;
  const year = yearStats(store.get(), now.y, now);

  $$('.views a').forEach((a) => {
    const v = a.dataset.view;
    a.href = v === 'flock' ? '#/flock' : v === 'year' ? `#/year/${r.year || (r.key ? parseKey(r.key).y : now.y)}` : `#/${v}/${r.key || monthKey(now.y, now.m)}`;
    if (v === r.name || (v === 'year' && r.name === 'fold')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('[data-cranes-chip]').innerHTML = `<b>${year.cranes}</b> cranes in ${now.y}`;

  if (r.name === 'year') view.innerHTML = yearView(r.year);
  else if (r.name === 'fold') view.innerHTML = foldView(r.year);
  else if (r.name === 'habits') view.innerHTML = habitsView(r.key);
  else if (r.name === 'flock') view.innerHTML = flock.render();
  else view.innerHTML = monthView(r.key, year);

  placeCrane();
  const grid = $('.grid-scroll', view);
  if (grid) grid.scrollLeft = gridScroll;
  if (focusKey) $(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

function placeCrane() {
  const slot = $('.crane-slot', view);
  if (!slot) { widget.hidden = true; document.body.appendChild(widget); return; }
  slot.appendChild(widget);
  widget.hidden = false;
  if (!stage) stage = createCraneStage($('canvas', widget), { view: 'widget', color: '#C8302C', onCraneClick: (e) => sfxPop(e.clientX, e.clientY, 'パタパタ') });
  const p = Number(slot.dataset.progress || 0);
  if (p !== lastProgress) { stage.setProgress(p, lastProgress >= 0); lastProgress = p; }
}

// ---------- Month ----------
function monthView(key, year) {
  const { y, m } = parseKey(key);
  const state = store.get();
  const month = store.view(key);
  const s = monthStats(month, y, m, now);
  const isCurrent = s.isCurrent;
  const color = (id) => store.color(id);

  const nav = `<div class="month-nav">
      ${viewSwitch()}
      ${stepLink('month', key, -1, icon.prev)}
      ${isCurrent ? '' : `<a class="icon-btn" href="#/month/${monthKey(now.y, now.m)}">This month</a>`}
      ${stepLink('month', key, 1, icon.next)}
    </div>`;

  if (!s.habits.length) {
    return `<div class="title-row"><h1>${monthName(m)} ${y}</h1><p class="finding">No habits in this month yet.</p>${nav}</div>
      <section class="panel empty-state"><h2>An empty sheet of paper</h2><p>Add the habits you want to fold this month.</p><a class="btn" href="#/habits/${key}">Add habits</a></section>`;
  }

  const v = pctView();
  const lead = rankHabits(s.habits, v)[0];
  const best = [...s.habits].sort((a, b) => b.longest - a.longest)[0];
  const monthWords = { days: `${percent(s.total.daysPct)} of the days${isCurrent ? ' so far' : ''}`, goal: `${percent(s.total.goalPct)} of this month's goals` };
  const leadWords = { days: `${percent(lead.daysPct)} of its days`, goal: `${percent(lead.goalPct)} of its goal` };
  const say = (words) => (v === 'both' ? `${words.days} and ${words.goal}` : words[v]);
  const finding = s.total.done === 0
    ? `Nothing folded yet in ${monthName(m)}. The month starts with ${s.habits.length} habits from last month.`
    : `<strong>${s.total.done} folds</strong>: ${say(monthWords)}. ${esc(lead.name)} leads at ${say(leadWords)}; ${esc(best.name)} had the longest run, ${best.longest} days.`;

  const blocks = [];
  blocks.push(isCurrent ? todayPanel(key, s, color) : summaryPanel(s, color));
  blocks.push(cranePanel(s, year));
  blocks.push(figuresPanel(s));
  blocks.push(gridPanel(key, s, color));
  blocks.push(dailyPanel(s));
  blocks.push(weeklyPanel(s));
  const timed = s.habits.filter((h) => h.time);
  blocks.push(rankedPanel(s, color, timed.length ? 'span-6' : 'span-12'));
  if (timed.length) blocks.push(dayPanel(key, s, color));

  return `<div class="title-row"><h1>${monthName(m)} ${y}</h1><p class="finding">${finding}</p>${nav}</div>
    ${chooseBar()}
    ${isCurrent ? inviteBar() : ''}
    ${isCurrent ? foldBar() : ''}
    ${backupBar()}
    <div class="board">${blocks.join('')}</div>`;
}

// Previous / next month: a link while there is somewhere to go, a disabled button at the ends.
function stepLink(name, key, delta, glyph) {
  const { y, m } = parseKey(key);
  const to = shiftMonth(y, m, delta);
  const toKey = monthKey(to.y, to.m);
  const label = `${monthName(to.m)} ${to.y}`;
  const open = delta < 0 ? toKey >= firstMonthKey(store.get(), now) : toKey <= lastMonthKey(now);
  return open
    ? `<a class="icon-btn" href="#/${name}/${toKey}" aria-label="${label}">${glyph}</a>`
    : `<button class="icon-btn" type="button" disabled aria-label="${label}">${glyph}</button>`;
}

function todayPanel(key, s, color) {
  const d = now.d;
  const byTime = (a, b) => minutesOf(a.time) - minutesOf(b.time);
  // Due today: daily habits and weekday habits on their days. Weekly and monthly goals get their own strips.
  const dueToday = s.habits.filter((h) => h.due[d - 1] === 'due').sort(byTime);
  const thisWeek = s.habits.filter((h) => h.due[d - 1] === 'flex' && h.unit === 'week').sort(byTime);
  const thisMonth = s.habits.filter((h) => h.due[d - 1] === 'flex' && h.unit === 'month').sort(byTime);
  const day = s.perDay[d - 1];
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const open = (h) => !h.cells[d - 1] && (h.unit === 'day' || flexibleProgress(h, d).open);
  const next = [...dueToday, ...thisWeek, ...thisMonth].filter((h) => open(h) && h.time && minutesOf(h.time) >= nowMin).sort(byTime)[0];
  const state = store.get();
  const tag = (h, note) => {
    const run = streakOf(state, h.id, now);
    const right = note || (run.n ? runWords(run) : h === next ? 'next' : '');
    return `<li><button class="tag${h === next ? ' is-next on-paper' : ''}" type="button" aria-pressed="${h.cells[d - 1]}" data-toggle="${h.id}:${d}" data-focus="tag:${h.id}" style="--c:${color(h.id)}">
      <span class="tag-box" aria-hidden="true"></span>
      <span class="tag-time">${esc(h.time) || '—'}</span>
      <span class="tag-name">${esc(h.name)}${store.challengeOf(h.id) ? ' <span class="gang-mark">gang</span>' : ''}</span>
      <span class="tag-streak">${right}</span>
    </button></li>`;
  };
  const strip = (title, list) => (list.length
    ? `<h3 class="strip-h">${title}</h3><ul class="today-list">${list.map((h) => tag(h, flexibleProgress(h, d).words)).join('')}</ul>` : '');
  const allDone = day.goal > 0 && day.done === day.goal && dueToday.length > 0;
  const foot = allDone ? 'Everything due today is folded. A whole crane.'
    : next ? `Next up: ${esc(next.name)} at ${esc(next.time)}.` : dueToday.length ? `${day.goal - day.done} still open today.` : 'Nothing has a fixed slot today.';
  const rem = store.reminders();
  const nudge = nextReminder(state, new Date());
  const remLine = !rem.enabled
    ? `<a href="#/habits/${key}#reminders">Turn on reminders</a>`
    : nudge ? `Next nudge at ${clock(nudge.at)} for ${esc(nudge.habit.name)}.` : 'No more nudges today.';
  return `<section class="panel span-5" aria-labelledby="today-h">
    <div class="panel-head"><h2 id="today-h">${dayLong(now.y, now.m, d)} ${d} ${monthName(now.m)}</h2><p>${day.done} of ${day.goal} done</p></div>
    ${dueToday.length ? `<ul class="today-list">${dueToday.map((h) => tag(h)).join('')}</ul>` : '<p class="note">No habit is due on a fixed day today.</p>'}
    ${strip('This week', thisWeek)}
    ${strip('This month', thisMonth)}
    <p class="today-foot">${foot} ${remLine}</p>
  </section>`;
}

// Where a weekly or monthly habit stands today: "1 of 3 this week", "done this month".
function flexibleProgress(h, d) {
  if (h.unit === 'month') {
    const day = h.cells.findIndex(Boolean) + 1;
    return day ? { open: false, words: `done on the ${day}${ordinal(day)}` } : { open: true, words: 'not yet this month' };
  }
  const w = weekOf(habitWeeks(h, now.y, now.m), d);
  if (!w) return { open: false, words: '' };
  const got = h.cells.slice(w.from - 1, w.to).filter(Boolean).length;
  return got >= w.target ? { open: false, words: 'done this week' } : { open: true, words: `${got} of ${w.target} this week` };
}
const ordinal = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');

// ---------- Percentages: days so far, goal, or both side by side ----------
// ui.pct is what the screen shows now; the saved default is where it starts.
const pctView = () => ui.pct || store.prefs().percentView;
const shown = (v) => (v === 'both' ? ['days', 'goal'] : [v]);
// Units follow the schedule: days, weeks or the month (D-013).
const units = (n, unit) => `${unit}${n === 1 ? '' : 's'}`;
const figure = (h, which) => (which === 'days'
  ? { value: h.daysPct, has: h.daysSoFar > 0, words: `${h.doneSoFar} of ${h.daysSoFar} ${units(h.daysSoFar, h.unit || 'day')}`, label: 'Days' }
  : { value: h.goalPct, has: h.goal > 0, words: `${h.credit ?? h.done} of ${h.goal} goal ${units(h.goal, h.unit || 'day')}`, label: 'Goal' });
const pctText = (f) => (f.has ? percent(f.value) : '—');

function viewSwitch() {
  const cur = pctView();
  const def = store.prefs().percentView;
  return `<div class="pct-switch">
    <div class="seg" role="group" aria-label="Show percentages against" title="Days: ticks against the days so far. Goal: ticks against each habit's monthly goal.">
      ${VIEWS.map((v) => `<button type="button" data-pct-view="${v}" aria-pressed="${v === cur}">${VIEW_LABELS[v]}</button>`).join('')}
    </div>
    ${cur === def ? '' : '<button class="seg-link" type="button" data-pct-default>Make default</button>'}
  </div>`;
}

function summaryPanel(s, color) {
  const bestWeek = s.weeks.reduce((a, b) => (b.pct > a.pct ? b : a), s.weeks[0]);
  const ranked = rankHabits(s.habits, pctView());
  const top = ranked[0];
  const weakest = ranked[ranked.length - 1];
  const lead = shown(pctView())[0];
  return `<section class="panel span-5" aria-labelledby="sum-h">
    <div class="panel-head"><h2 id="sum-h">${monthName(s.m)} in short</h2><p>${s.days} days</p></div>
    <ul class="dayline">
      <li style="--c:${color(top.id)}"><time>Top</time><i></i><span>${esc(top.name)}</span><em>${figure(top, lead).words}</em></li>
      <li style="--c:${color(weakest.id)}"><time>Low</time><i></i><span>${esc(weakest.name)}</span><em>${figure(weakest, lead).words}</em></li>
      <li style="--c:var(--ai)"><time>Week</time><i></i><span>Week ${bestWeek.index} was the best</span><em>${bestWeek.done}/${bestWeek.possible}</em></li>
      <li style="--c:var(--shu)"><time>Days</time><i></i><span>Perfect days</span><em>${s.perfectDays}</em></li>
    </ul>
  </section>`;
}

function cranePanel(s, year) {
  const state = store.get();
  const todayMonth = state.months[monthKey(now.y, now.m)];
  const ts = todayMonth ? monthStats(todayMonth, now.y, now.m, now) : null;
  const day = ts?.perDay[now.d - 1];
  const progress = day && day.goal ? day.done / day.goal : 0;
  const remaining = Math.max(0, CRANE_GOAL - year.cranes);
  const perDay = Math.ceil(remaining / daysLeftInYear(now));
  const wish = wishOf(state, now.y)
    ? `Wish: “${esc(wishOf(state, now.y))}”`
    : `<a href="#/habits/${monthKey(now.y, now.m)}#wish">Write the wish for crane ${CRANE_GOAL_TEXT}</a>`;
  return `<section class="panel crane-panel span-4" aria-labelledby="crane-h">
    <div class="panel-head"><h2 id="crane-h">Today's crane</h2><p>${day ? `${day.done} of ${day.goal} folds` : ''}</p></div>
    <div class="crane-slot" data-progress="${progress.toFixed(4)}"></div>
    <p class="crane-count">${year.cranes}<small>of ${CRANE_GOAL_TEXT} cranes</small></p>
    <div class="wish-meter" aria-hidden="true"><span style="width:${Math.min(100, (year.cranes / CRANE_GOAL) * 100)}%"></span></div>
    <p class="wish-line">${remaining ? `${remaining} to go: about ${perDay} a day until 31 December. ` : `${CRANE_GOAL_TEXT} cranes. `}${wish}
      <span aria-hidden="true">·</span> <button type="button" aria-haspopup="dialog" data-crane-story>Why ${CRANE_GOAL_TEXT}?</button></p>
  </section>`;
}

function figuresPanel(s) {
  const t = s.total;
  const days = { value: t.daysPct, text: `of days${s.isCurrent ? ' so far' : ''}: ${t.doneSoFar} of ${t.daysSoFar}` };
  const goal = { value: t.goalPct, text: `of goals: ${t.goalMet} of ${t.target} goal days` };
  const [first, second] = pctView() === 'goal' ? [goal, days] : [days, goal];
  return `<section class="panel span-3" aria-labelledby="fig-h">
    <div class="panel-head"><h2 id="fig-h">This month</h2></div>
    <div class="figures">
      <div class="figure-ring">${ring(first.value, { size: 96, stroke: 14 })}
        <div><p class="big">${percent(first.value)}</p><p class="label">${first.text}</p></div></div>
      <div><p class="big">${percent(second.value)}</p><p class="label">${second.text}</p></div>
      <div><p class="big">${s.perfectDays}</p><p class="label">perfect day${s.perfectDays === 1 ? '' : 's'}, every habit done</p></div>
      ${liveRun(s)}
    </div>
  </section>`;
}

function liveRun(s) {
  if (!s.isCurrent) return `<div><p class="big">${s.weeks.reduce((a, w) => Math.max(a, w.done), 0)}</p><p class="label">ticks in the best week</p></div>`;
  // Runs are compared within their own unit; a 3-week run is shown as weeks, not turned into days.
  const r = s.habits.map((h) => ({ h, run: streakOf(store.get(), h.id, now) })).sort((a, b) => b.run.n - a.run.n)[0];
  const unit = `${r.run.unit}${r.run.n === 1 ? '' : 's'}`;
  return `<div><p class="big">${r.run.n}<small> ${unit}</small></p><p class="label">longest run going: ${esc(r.h.name)}</p></div>`;
}

function gridPanel(key, s, color) {
  const { y, m } = s;
  const state = store.get();
  const todayCol = s.isCurrent ? now.d : 0;
  const days = Array.from({ length: s.days }, (_, i) => i + 1);
  const isWeekend = (d) => [0, 6].includes(weekday(y, m, d));
  // Summary columns change with the view, so every number says what it counts.
  const leftCell = (h) => (h.left < 0 ? `<td class="sum neg" title="${-h.left} over the goal">+${-h.left}</td>` : `<td class="sum">${h.left}</td>`);
  const pctCell = (h, which) => { const f = figure(h, which); return `<td class="sum" title="${f.words}">${pctText(f)}</td>`; };
  const cols = {
    days: [
      ['Done', 'Days ticked', (h) => `<td class="sum">${h.done}</td>`],
      ['Due', 'Still to do this month: the goal minus what is done', (h) => `<td class="sum">${Math.max(0, h.left)}</td>`],
      ['% due', 'Done against what was due so far', (h) => pctCell(h, 'days')],
    ],
    goal: [
      ['Done', 'Days ticked', (h) => `<td class="sum">${h.done}</td>`],
      ['Goal', 'Monthly goal in days', (h) => `<td class="sum">${h.goal}</td>`],
      ['Left', 'Days left to reach the goal', leftCell],
      ['% goal', 'Ticks against the goal', (h) => pctCell(h, 'goal')],
    ],
    both: [
      ['Done', 'Days ticked', (h) => `<td class="sum">${h.done}</td>`],
      ['% due', 'Done against what was due so far', (h) => pctCell(h, 'days')],
      ['Goal', 'Monthly goal in days', (h) => `<td class="sum">${h.goal}</td>`],
      ['% goal', 'Ticks against the goal', (h) => pctCell(h, 'goal')],
    ],
  }[pctView()];
  const streakCols = [['Run', 'Current streak'], ['Best', 'Longest streak this month']];
  const nSum = cols.length + streakCols.length;
  const head1 = `<tr class="week-row"><th></th>${s.weeks.map((w) => `<th class="wk" colspan="${w.to - w.from + 1}">Week ${w.index}</th>`).join('')}<th colspan="${nSum}"></th></tr>`;
  const head2 = `<tr><th></th>${days.map((d) => `<th class="${isWeekend(d) ? 'weekend' : ''}" aria-hidden="true">${NARROW.format(new Date(y, m - 1, d))}</th>`).join('')}
    ${[...cols, ...streakCols].map(([head, title]) => `<th scope="col" title="${title}">${head}</th>`).join('')}</tr>`;
  const head3 = `<tr><th></th>${days.map((d) => `<th scope="col" class="${d === todayCol ? 'is-today' : ''}${isWeekend(d) ? ' weekend' : ''}">${d}</th>`).join('')}<th colspan="${nSum}"></th></tr>`;

  const rows = s.habits.map((h) => {
    const run = s.isCurrent ? streakOf(state, h.id, now) : null;
    const cells = h.cells.map((c, i) => {
      const d = i + 1;
      const label = `${h.name}, ${d} ${monthShort(m)}`;
      if (c === null) return `<td><span class="cell na" title="Not tracked yet on this day"></span></td>`;
      // A weekday habit's day off: no box, not a miss. (A tick left from an older schedule still shows.)
      if (h.due[i] === 'rest' && !c) return `<td class="${d === todayCol ? 'is-today' : ''}"><span class="cell rest" title="Rest day: ${esc(h.name)} isn't due"></span></td>`;
      const future = s.isCurrent ? d > now.d : s.lastDay === 0;
      const kind = h.due[i] === 'flex' ? ' flex' : '';
      return `<td class="${d === todayCol ? 'is-today' : ''}"><button class="cell${kind}${future ? ' future' : ''}" type="button" aria-pressed="${c}" aria-label="${esc(label)}" data-toggle="${h.id}:${d}" data-focus="cell:${h.id}:${d}" data-r="${h.id}" data-d="${d}"></button></td>`;
    }).join('');
    const sched = cadenceOf(h) === 'daily' ? '' : `${esc(describe(h))} · `;
    const runCell = run === null ? '<td class="sum muted">—</td>'
      : `<td class="sum" title="${runWords(run)}">${run.n}${run.unit === 'day' || !run.n ? '' : `<small>${run.unit === 'week' ? 'wk' : 'mo'}</small>`}</td>`;
    return `<tr style="--c:${color(h.id)}">
      <th class="h-name" scope="row"><div class="h-name-inner"><i></i><b title="${esc(h.name)}">${esc(h.name)}</b><small>${store.challengeOf(h.id) ? '<span class="gang-mark">gang</span> ' : ''}${h.time ? `${esc(h.time)} · ` : ''}${sched}goal ${h.goal}</small></div></th>
      ${cells}${cols.map(([, , cell]) => cell(h)).join('')}
      ${runCell}<td class="sum">${h.longest}</td></tr>`;
  }).join('');

  const doneRow = `<tr><th scope="row">Done</th>${s.perDay.map((d) => `<td>${d.past || d.done ? d.done : ''}</td>`).join('')}<td colspan="${nSum}"></td></tr>`;
  const barRow = `<tr><th scope="row">Score</th>${s.perDay.map((d) => `<td><div class="day-bar${d.goal && d.done === d.goal ? ' perfect' : ''}" title="${d.done} of ${d.goal}"><span style="height:${Math.round(d.pct * 100)}%"></span></div></td>`).join('')}<td colspan="${nSum}"></td></tr>`;

  return `<section class="panel grid-panel span-12" aria-labelledby="grid-h">
    <div class="panel-head"><h2 id="grid-h">The month</h2><p>Tap a square to tick it. Arrow keys move around.</p></div>
    <div class="grid-scroll">
      <table class="habit-grid" data-grid>
        <colgroup><col class="c-name">${days.map(() => '<col class="c-day">').join('')}${'<col class="c-sum">'.repeat(nSum)}</colgroup>
        <thead>${head1}${head2}${head3}</thead>
        <tbody>${rows}</tbody>
        <tfoot>${doneRow}${barRow}</tfoot>
      </table>
    </div>
    <div class="grid-legend"><span><i style="background:var(--ai)"></i>Day's score</span><span><i style="background:var(--shu)"></i>Perfect day</span><span><i style="outline:1px solid var(--bg-3);outline-offset:-1px"></i>Still to come</span><span>% due counts today from the start of the day; dots are rest days</span>${pctView() === 'days' ? '' : '<span>Left shows +n once a goal is passed</span>'}</div>
  </section>`;
}

function dailyPanel(s) {
  const values = s.perDay.map((d) => (d.past ? d.pct : null));
  const past = s.perDay.filter((d) => d.past);
  const avg = pct(past.reduce((a, d) => a + d.pct, 0), past.length);
  const ticks = [1, 5, 10, 15, 20, 25, s.days];
  return `<section class="panel span-8" aria-labelledby="daily-h">
    <div class="panel-head"><h2 id="daily-h">Daily score</h2><p>${past.length ? `Average ${percent(avg)} over ${past.length} day${past.length === 1 ? '' : 's'}` : 'No days yet'}</p></div>
    <div class="hills-wrap">${hills(values, { width: 820, height: 190, color: 'var(--matcha)', today: s.isCurrent ? now.d : null })}</div>
    <div class="axis" aria-hidden="true">${ticks.map((t) => `<span>${t}</span>`).join('')}</div>
  </section>`;
}

function weeklyPanel(s) {
  return `<section class="panel span-4" aria-labelledby="weekly-h">
    <div class="panel-head"><h2 id="weekly-h">Weeks</h2><p>From the 1st</p></div>
    <div class="weeks">${s.weeks.map((w) => `<div class="week"><span>Week ${w.index}<small>${w.from}–${w.to} ${monthShort(s.m)}</small></span>
      <div class="week-track"><div class="week-fill" style="width:${w.pct * 100}%"></div></div><b>${w.done}/${w.possible}<small>${percent(w.pct)}</small></b></div>`).join('')}</div>
  </section>`;
}

function rankedPanel(s, color, span) {
  const v = pctView();
  const which = shown(v);
  const note = { days: 'Ticks against the days so far', goal: 'Ticks against each goal', both: 'Days so far and goal, side by side' }[v];
  const bar = (h, w) => {
    const f = figure(h, w);
    return `<div class="rank-row${which.length > 1 ? ' two' : ''}" title="${f.words}">${which.length > 1 ? `<span>${f.label}</span>` : ''}
      <div class="rank-bar"><i style="width:${Math.min(100, f.value * 100)}%"></i></div><b>${pctText(f)}</b></div>`;
  };
  return `<section class="panel ${span}" aria-labelledby="rank-h">
    <div class="panel-head"><h2 id="rank-h">Top habits</h2><p>${note}</p></div>
    <ol class="ranked">${rankHabits(s.habits, v).slice(0, 10).map((h) => `<li style="--c:${color(h.id)}"><span class="rank-name">${esc(h.name)}</span>${which.map((w) => bar(h, w)).join('')}</li>`).join('')}</ol>
  </section>`;
}

function dayPanel(key, s, color) {
  const d = s.isCurrent ? now.d : null;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const list = s.habits.filter((h) => h.time).sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
  const next = d ? list.find((h) => !h.cells[d - 1] && minutesOf(h.time) >= nowMin) : null;
  return `<section class="panel span-6" aria-labelledby="day-h">
    <div class="panel-head"><h2 id="day-h">Your day, in order</h2><p>${next ? `Next: ${next.time}` : d ? 'Nothing else timed today' : 'The usual times'}</p></div>
    <ol class="dayline">${list.map((h) => `<li class="${d && h.cells[d - 1] ? 'done' : ''}${h === next ? ' next' : ''}" style="--c:${color(h.id)}"><time>${esc(h.time)}</time><i></i><span>${esc(h.name)}</span>${h === next ? '<em>next</em>' : ''}</li>`).join('')}</ol>
  </section>`;
}

// ---------- Year ----------
function yearView(y) {
  const state = store.get();
  const ys = yearStats(state, y, now);
  const v = pctView();
  const lead = shown(v)[0];
  const sum = summarise(ys.months, lead);
  const perfect = ys.months.reduce((a, x) => a + (x.perfectDays || 0), 0);
  const of = { days: 'of days', goal: 'of goals' };
  const rateText = (x) => (v === 'both'
    ? `${x.daysRate === null ? '—' : percent(x.daysRate)} · ${x.goalRate === null ? '—' : percent(x.goalRate)}`
    : rateOf(x, v) === null ? '—' : percent(rateOf(x, v)));
  const finding = sum.best
    ? `<strong>${ys.cranes} cranes</strong> folded in ${y}. ${monthName(sum.best.m)} was the best month at ${percent(sum.bestRate)} ${of[lead]}; the average is ${percent(sum.average)}.`
    : `Nothing folded in ${y}.`;
  const cards = ys.months.map((x) => {
    const key = monthKey(y, x.m);
    const month = state.months[key];
    if (!month || !month.habits.length) {
      const reachable = key >= firstMonthKey(state, now) && key <= lastMonthKey(now);
      const inner = `<h3>${monthName(x.m)}<span>—</span></h3><p>${key > monthKey(now.y, now.m) ? 'Still ahead' : 'Not started'}</p>`;
      return reachable ? `<a class="month-card empty" href="#/month/${key}">${inner}</a>` : `<div class="month-card empty">${inner}</div>`;
    }
    const s = monthStats(month, y, x.m, now);
    const heat = s.habits.map((h) => h.cells.map((c) => `<i class="${c ? 'on' : ''}" style="--c:${store.color(h.id)}"></i>`).join('')).join('');
    return `<a class="month-card" href="#/month/${key}"><h3>${monthName(x.m)}<span title="${v === 'both' ? 'Days · goal' : of[lead]}">${rateText(x)}</span></h3>
      <div class="heat" style="grid-template-columns:repeat(${s.days},minmax(0,1fr))" aria-hidden="true">${heat}</div>
      <p>${s.total.done} of ${s.total.possible} ticks · ${s.perfectDays} perfect day${s.perfectDays === 1 ? '' : 's'}</p></a>`;
  }).join('');
  const heights = ys.months.map((x) => ({ ...x, rate: rateOf(x, lead) }));
  const label = (x) => {
    const r = rateOf(x, lead);
    const main = r === null ? '—' : `${Math.round(r * 100)}<span class="pct">%</span>`;
    const extra = v === 'both' && x.goalRate !== null ? `<small>goal ${Math.round(x.goalRate * 100)}%</small>` : '';
    return `<li class="${r === null ? 'muted' : ''}"><span class="long">${monthShort(x.m)}</span><span class="short">${monthShort(x.m)[0]}</span><b>${main}</b>${extra}</li>`;
  };
  const rangeNote = { days: 'Ticks against the days in each month (so far, for this one)', goal: 'Ticks against each month\'s goals', both: 'Mountains show days; the goal figure sits under each month' }[v];
  return `<div class="title-row"><h1>${y}</h1><p class="finding">${finding}</p>
      <div class="month-nav">${viewSwitch()}${yearStep(y, -1, icon.prev)}${yearStep(y, 1, icon.next)}</div></div>
    ${yearSlip(y, ys)}
    <div class="board">
      <section class="panel span-12" aria-labelledby="range-h">
        <div class="panel-head"><h2 id="range-h">Success rate by month</h2><p>${rangeNote}</p></div>
        <div class="year-range"><div class="year-sun" aria-hidden="true"></div><svg viewBox="0 0 1200 380" preserveAspectRatio="none" role="img" aria-label="Monthly success rates as mountains">${mountains(heights, { width: 1200, height: 380, current: y === now.y ? now.m : null })}</svg></div>
        <ol class="range-labels">${ys.months.map(label).join('')}</ol>
      </section>
      <section class="panel span-3"><p class="big">${ys.cranes}</p><p class="label">cranes folded</p></section>
      <section class="panel span-3"><p class="big">${percent(sum.average)}</p><p class="label">average month, ${of[lead]}</p></section>
      <section class="panel span-3"><p class="big">${sum.best ? monthShort(sum.best.m) : '—'}</p><p class="label">best month${sum.best ? `, ${percent(sum.bestRate)} ${of[lead]}` : ''}</p></section>
      <section class="panel span-3"><p class="big">${perfect}</p><p class="label">perfect days</p></section>
      ${flock.stampBook(y)}
      <div class="span-12"><h2 class="visually-hidden">Months</h2><div class="months">${cards}</div></div>
    </div>`;
}

function yearStep(y, delta, glyph) {
  const to = y + delta;
  return to >= yearBounds(store.get(), now).first && to <= now.y
    ? `<a class="icon-btn" href="#/year/${to}" aria-label="${to}">${glyph}</a>`
    : `<button class="icon-btn" type="button" disabled aria-label="${to}">${glyph}</button>`;
}

// The year's wish, and whether the year has been folded.
function yearSlip(y, ys) {
  const state = store.get();
  const wish = wishOf(state, y);
  const folded = foldedAt(state, y);
  const canFold = y < now.y || now.m === 12;
  const wishText = wish ? `The wish for ${y}: “${esc(wish)}”` : `No wish written for ${y} yet.`;
  const date = folded && new Date(folded);
  const foldText = folded ? `Folded on ${date.getDate()} ${monthName(date.getMonth() + 1)}.` : canFold ? 'Not folded yet.' : '';
  const action = canFold
    ? `<a class="btn ${folded ? 'btn--quiet' : 'btn--ink'}" href="#/fold/${y}">${folded ? `Look back at ${y}` : `Fold ${y}`}</a>`
    : `<a class="seg-link" href="#/habits/${monthKey(now.y, now.m)}#wish">${wish ? 'Change the wish' : 'Write the wish'}</a>`;
  return `<section class="year-slip panel" aria-label="The wish for ${y}">
      <p>${wishText} <span>${ys.cranes} of ${CRANE_GOAL_TEXT} cranes. ${foldText}</span></p>
      ${action}
    </section>`;
}

// ---------- Fold the year (D-017) ----------
// From December to January: look back at the year, choose the habits that come along, and write
// next year's wish. Months carry their habits over anyway; this is the moment to choose.
function foldBar() {
  const y = yearToFold(store.get(), now);
  if (!y) return '';
  return `<section class="backup-bar fold-bar sheet-wrap" aria-labelledby="fold-bar-h">
    <div class="backup-bar-sheet">
      <div><h2 id="fold-bar-h">Fold ${y}</h2><p>${now.m === 12 ? `${y} is nearly folded.` : `${y} is done.`} Look back, pick what comes with you into ${y + 1}, and write its wish.</p></div>
      <div class="backup-bar-actions"><a class="btn btn--ink" href="#/fold/${y}">Look back at ${y}</a></div>
    </div>
  </section>`;
}

function foldView(y) {
  const state = store.get();
  const ys = yearStats(state, y, now);
  const sum = summarise(ys.months, 'days');
  const perfect = ys.months.reduce((a, x) => a + (x.perfectDays || 0), 0);
  const run = longestRun(state, y, now);
  const folded = foldedAt(state, y);
  const wish = wishOf(state, y);
  // The habit folded most often in the year.
  const totals = {};
  Object.entries(state.months).forEach(([k, mo]) => {
    if (!k.startsWith(`${y}-`)) return;
    mo.habits.forEach((h) => { totals[h.id] = { name: h.name, n: (totals[h.id]?.n || 0) + (mo.checks[h.id]?.length || 0) }; });
  });
  const top = Object.values(totals).sort((a, b) => b.n - a.n)[0];
  const runName = run && (totals[run.id]?.name || run.name); // the habit's latest name in the year
  const jan = state.months[monthKey(y + 1, 1)];
  const habits = jan ? jan.habits : closingHabits(state, y);
  const wishLine = wish
    ? (ys.cranes >= CRANE_GOAL ? `${CRANE_GOAL_TEXT} cranes for “${esc(wish)}”. Make the wish.` : `${ys.cranes} cranes toward “${esc(wish)}”. Every one was a time you got up.`)
    : `${ys.cranes} cranes, each one a time you got up.`;
  const fact = (big, label) => `<div class="fold-fact"><p class="big">${big}</p><p class="label">${label}</p></div>`;

  return `<div class="title-row"><h1>Fold ${y}</h1>
      <p class="finding">${y === now.y ? 'December is still open; its ticks keep counting after you fold. ' : ''}Look back, choose what comes with you, and write the wish for ${y + 1}.</p>
      <div class="month-nav"><a class="icon-btn" href="#/year/${y}">Back to ${y}</a></div></div>
    <div class="board">
      <section class="panel span-8 fold-look" aria-labelledby="look-h">
        <div class="panel-head"><h2 id="look-h">${y}, looking back</h2><p>Best month counts ticks against its days</p></div>
        <p class="fold-wish">${wishLine}</p>
        <svg class="fold-range" viewBox="0 0 640 160" preserveAspectRatio="none" aria-hidden="true">${mountains(ys.months.map((x) => ({ ...x, rate: x.daysRate })), { width: 640, height: 160, mini: true })}</svg>
        <div class="fold-facts">
          ${fact(ys.cranes, 'cranes folded')}
          ${fact(perfect, `perfect day${perfect === 1 ? '' : 's'}`)}
          ${fact(sum.best ? monthShort(sum.best.m) : '—', sum.best ? `best month, ${percent(sum.bestRate)} of its days` : 'best month')}
          ${fact(run ? run.length : 0, run ? `days in a row of ${esc(runName)}, the longest run` : 'longest run, in days')}
          ${fact(top ? top.n : 0, top ? `folds of ${esc(top.name)}, more than any other habit` : 'folds of the top habit')}
        </div>
      </section>
      <form class="panel span-4 fold-form" data-fold="${y}" aria-labelledby="carry-h">
        <div class="panel-head"><h2 id="carry-h">Into ${y + 1}</h2><p>${folded ? 'Folded; you can change it' : 'All of them, unless you say'}</p></div>
        <fieldset class="rem-list fold-keep"><legend class="note">Habits for January ${y + 1}</legend>
          ${habits.length ? habits.map((h) => `<label><input type="checkbox" name="keep" value="${h.id}" checked><i style="--c:${store.color(h.id)}"></i><span>${esc(h.name)}</span></label>`).join('') : '<p class="note">No habits to carry. Add some in January.</p>'}
        </fieldset>
        <label class="note" for="next-wish">What will crane ${CRANE_GOAL_TEXT} of ${y + 1} be for? Only you see this.</label>
        <textarea id="next-wish" name="wish" maxlength="200">${esc(wishOf(state, y + 1))}</textarea>
        <button class="btn" type="submit">${folded ? `Fold ${y} again` : `Fold ${y}`}</button>
      </form>
    </div>`;
}

// ---------- Habits editor ----------
function habitsView(key) {
  const { y, m } = parseKey(key);
  const state = store.get();
  const month = store.view(key);
  const days = daysIn(y, m);
  const rows = month.habits.map((h, i) => {
    const c = store.color(h.id);
    return `<div class="edit-row" style="--c:${c}">
      <button class="swatch-btn" type="button" data-swatch="${h.id}" aria-label="Colour for ${esc(h.name)}" aria-expanded="${ui.swatchFor === h.id}"></button>
      <label class="wide">Habit<input data-edit="${h.id}" data-field="name" value="${esc(h.name)}" required></label>
      <label class="third">Time<input data-edit="${h.id}" data-field="time" type="time" value="${esc(h.time || '')}"></label>
      <label class="third">Goal (${{ week: 'weeks', month: 'months' }[unitOfHabit(h)] || 'days'})<input data-edit="${h.id}" data-field="goal" type="number" min="0" max="${days}" value="${h.goal}"></label>
      <label class="third">From day<input data-edit="${h.id}" data-field="start" type="number" min="1" max="${days}" value="${h.start || 1}"></label>
      <div class="row-actions">
        <button class="icon-btn" type="button" data-move="${h.id}:-1" aria-label="Move ${esc(h.name)} up" ${i === 0 ? 'disabled' : ''}>${icon.up}</button>
        <button class="icon-btn" type="button" data-move="${h.id}:1" aria-label="Move ${esc(h.name)} down" ${i === month.habits.length - 1 ? 'disabled' : ''}>${icon.down}</button>
        <button class="icon-btn danger" type="button" data-remove="${h.id}">Remove</button>
      </div>
      ${scheduleEditor(h)}
      ${ui.account.status !== 'signed-in' ? '' : store.challengeOf(h.id)
    ? `<p class="private-toggle gang-note"><b>Part of a gang.</b> Your gang sees your ticks on this habit. <a class="seg-link" href="#/flock">See the gang</a></p>`
    : `<label class="private-toggle"><input type="checkbox" data-private="${h.id}" data-focus="private-${h.id}" ${store.isPrivate(h.id) ? 'checked' : ''}><span><b>Private.</b> Never shown to any buddy, whatever they're allowed to see.</span></label>
      ${store.isPrivate(h.id) ? '' : `<p class="private-toggle gang-note"><a class="seg-link" href="#/flock/start/${h.id}">Fold it with friends</a> Start a gang for this habit.</p>`}`}
      ${ui.swatchFor === h.id ? `<div class="swatches" role="group" aria-label="Paper colours">${PAPERS.map((p) => `<button type="button" style="--c:${p}" data-color="${h.id}:${p}" aria-pressed="${p.toLowerCase() === c.toLowerCase()}" aria-label="${p}"></button>`).join('')}</div>` : ''}
    </div>`;
  }).join('');

  return `<div class="title-row"><h1>Habits for ${monthName(m)}</h1>
      <p class="finding">Changes apply to ${monthName(m)} ${y}. A new month starts with the habits of the month before, so set it up once.</p>
      <div class="month-nav">${stepLink('habits', key, -1, icon.prev)}<a class="icon-btn" href="#/month/${key}">Back to the month</a>${stepLink('habits', key, 1, icon.next)}</div></div>
    <div class="board">
      <section class="span-8" aria-labelledby="list-h">
        <h2 id="list-h" class="visually-hidden">This month's habits</h2>
        <div class="editor">${rows || '<p class="note">No habits yet. Add the first one below.</p>'}</div>
        <form class="panel panel--washi add-form" data-add style="margin-top:24px">
          <label>New habit<input name="name" required placeholder="Stretch for ten minutes"></label>
          <label>Time<input name="time" type="time"></label>
          <label>Repeats<select name="cadence">${CADENCES.map((c) => `<option value="${c}">${CADENCE_LABELS[c]}</option>`).join('')}</select></label>
          <label>Goal (days)<input name="goal" type="number" min="0" max="${days}" value="20"></label>
          <label>From day<input name="start" type="number" min="1" max="${days}" value="${key === monthKey(now.y, now.m) ? now.d : 1}"></label>
          <button class="btn" type="submit">Add habit</button>
        </form>
      </section>
      <div class="span-4 side-stack">
        ${percentagesPanel()}
        ${remindersPanel(month)}
        <section class="panel" id="wish" aria-labelledby="wish-h">
          <div class="panel-head"><h2 id="wish-h">The wish for ${y}</h2></div>
          <form class="wish-form" data-wish="${y}">
            <label class="note" for="wish-text">What will crane ${CRANE_GOAL_TEXT} of ${y} be for? Only you see this.</label>
            <textarea id="wish-text" name="wish" maxlength="200">${esc(wishOf(state, y))}</textarea>
            <button class="btn btn--ink" type="submit">Keep the wish</button>
          </form>
        </section>
        <section class="panel" aria-labelledby="backup-h">
          <div class="panel-head"><h2 id="backup-h">Backup</h2></div>
          <p class="note">${store.mode() === 'synced' ? 'Your folds are saved to your account. A backup file is still yours to keep.' : 'Everything lives in this browser. Save a copy now and then, or move it to another device.'}</p>
          <ul class="safety">
            <li><b>Last backup:</b> ${lastBackupText()}</li>
            <li><b>Storage:</b> ${{
              persistent: 'protected. This browser won\'t clear your data on its own.',
              'best-effort': 'not protected yet. The browser may clear it if the disk runs low. Ticking a habit asks it to keep the data.',
              unknown: 'this browser doesn\'t say whether it keeps data permanently.',
            }[ui.protection || 'unknown']}</li>
          </ul>
          <div class="backup-actions" style="margin-top:14px">
            <button class="btn btn--quiet" type="button" data-export>Save a backup</button>
            <label class="btn btn--quiet" for="import-file">Load a backup</label>
            <input id="import-file" type="file" accept="application/json,.json" class="visually-hidden" data-import>
          </div>
        </section>
      </div>
    </div>`;
}

// ---------- Sync (D-020) ----------
const sync = createSync({
  store,
  storage: store.syncStorage,
  online: () => navigator.onLine,
  onStatus: (s) => {
    ui.sync = s;
    menu.update({ sync: s });
    if (s.message) toast(s.message);
    scheduleRender();
  },
});

// The account lives in the header as a piece of paper (D-022): a crumpled ball when signed out,
// folded flat with your initial when signed in.
function chooseSync(kind) {
  sync.choose(kind).then(() => toast(kind === 'merge' ? 'Kept both. Your account has everything now.' : 'Using your account\'s folds. This browser\'s copy is kept aside.'));
}
const menu = createAccountMenu($('[data-account]'), { page: 'app', onChoose: chooseSync, onLeave: () => sync.stop(), toast: (t) => toast(t) });

// Flock (D-044): buddies, as name cards. A card handed over by link is picked up before anything draws.
captureCard();
const flock = createFlock({ view, store, getClient, toast, rerender: scheduleRender, drawNow: () => render(), openAccount: () => menu.open(), today });
window.addEventListener('resize', () => { if (route().name === 'flock') scheduleRender(); });
flock.captureStart();
wireCraneNotes(view);

// First sign-in on a browser that already has folds, when the account has some too.
function chooseBar() {
  if (ui.sync.state !== 'choose') return '';
  return `<section class="backup-bar sheet-wrap" aria-labelledby="choose-h">
    <div class="backup-bar-sheet">
      <div><h2 id="choose-h">Two sets of folds</h2><p>This browser and your account both have habits. Keep both, or use only your account's.</p></div>
      <div class="backup-bar-actions">
        <button class="btn btn--ink" type="button" data-sync-choose="merge">Keep both</button>
        <button class="seg-link" type="button" data-sync-choose="account">Use only my account's</button>
      </div>
    </div>
  </section>`;
}

function onAccount(account) {
  const was = ui.account;
  ui.account = account;
  menu.update({ account });
  flock.onAccount(account);
  if (account.status === 'signed-in' && account.id) {
    getClient().then((sb) => sync.start(supabaseApi(sb, account.id), account.id)).catch(() => {});
    if (was.status !== 'signed-in') checkPush(account);
  } else if (account.status === 'signed-out' && was.status === 'signed-in') {
    sync.stop();
    setPush('off');
  }
  scheduleRender();
}

const clock = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// ---------- Schedules (D-013) ----------
const unitOfHabit = (h) => ({ times_per_week: 'week', weekly: 'week', monthly: 'month' }[cadenceOf(h)] || 'day');

function scheduleEditor(h) {
  const c = cadenceOf(h);
  const days = c === 'weekdays'
    ? `<div class="wd-chips" role="group" aria-label="Days ${esc(h.name)} is due">${WEEKDAY_SHORT.map((label, i) => {
      const on = (h.weekdays || []).includes(i + 1);
      return `<button type="button" data-wd="${h.id}:${i + 1}" aria-pressed="${on}" aria-label="${label}">${label[0]}${label === 'Thu' || label === 'Sun' || label === 'Sat' ? label[1] : ''}</button>`;
    }).join('')}</div>` : '';
  const times = c === 'times_per_week'
    ? `<label class="tpw">Times<input data-edit="${h.id}" data-field="timesPerWeek" type="number" min="1" max="7" value="${h.timesPerWeek || 3}"></label>` : '';
  return `<div class="edit-schedule">
    <label>Repeats<select data-edit="${h.id}" data-field="cadence">${CADENCES.map((v) => `<option value="${v}" ${v === c ? 'selected' : ''}>${CADENCE_LABELS[v]}</option>`).join('')}</select></label>
    ${days}${times}
    <p class="note">${scheduleNote(h)}</p>
  </div>`;
}

function scheduleNote(h) {
  return {
    daily: 'Due every day.',
    weekdays: 'Only the chosen days get a box; the others are rest days, never misses.',
    times_per_week: 'Any days count. Each week (from the 1st) asks for this many; a short last week asks for a share.',
    weekly: 'Once in each week, on any day.',
    monthly: 'Once in the month, on any day.',
  }[cadenceOf(h)] + ' Changing this resets the goal to match.';
}

function percentagesPanel() {
  const def = store.prefs().percentView;
  const options = [
    ['days', 'Days', 'Ticks against the days so far. 13 gym days in a 30-day month is 43%.'],
    ['goal', 'Goal', 'Ticks against each habit\'s goal. 13 of a 20-day goal is 65%.'],
    ['both', 'Both', 'The two side by side, days first.'],
  ];
  return `<section class="panel" id="percentages" aria-labelledby="pct-h">
    <div class="panel-head"><h2 id="pct-h">Percentages</h2></div>
    <fieldset class="choice"><legend class="note">Which view the tracker opens with. You can switch on the Month and Year pages at any time.</legend>
      ${options.map(([v, l, d]) => `<label><input type="radio" name="default-view" value="${v}" ${def === v ? 'checked' : ''}><i></i><span><b>${l}</b>${d}</span></label>`).join('')}
    </fieldset>
  </section>`;
}

// ---------- Reminders with the app closed (D-028) ----------
function setPush(state) {
  ui.push = state;
  setPushHere(state === 'on');
  scheduleRender();
}

// Whether this device is signed up, and keep the account's time zone current while it is.
function checkPush(account) {
  if (!pushSupported()) return setPush('unsupported');
  getClient()
    .then(async (sb) => {
      let state = await pushState(sb);
      // On by default (D-043): notifications are already allowed here, so sign this device up
      // without a prompt, and say so while the person is looking.
      if (shouldAutoEnable(pushDevice(state))) {
        try {
          await enablePush(sb, account.id, store.reminders().off);
          setPushOwner(account.id);
          state = 'on';
          toast('Reminders now reach this device even with One More Fold closed. Turn them off any time under Habits, Reminders.');
        } catch { /* stays off; the panel still offers it */ }
      }
      setPush(state);
      if (state === 'on') {
        await saveSettings(sb, account.id, store.reminders().off);
        ui.summaries = await loadSummaries(sb);
        scheduleRender();
      }
    })
    .catch(() => setPush('off'));
}

// This device and person, for the on-by-default rules (src/lib/push-default.js).
function pushDevice(state = ui.push) {
  const now = new Date();
  const month = store.month(monthKey(now.getFullYear(), now.getMonth() + 1));
  return {
    signedIn: ui.account.status === 'signed-in',
    supported: pushSupported(),
    state,
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    homeScreen: needsHomeScreen(),
    account: ui.account.id,
    choice: pushChoice(ui.account.id),
    owner: pushOwner(),
    inTab: store.reminders().enabled === true,
    timed: !!month?.habits.some((h) => h.time),
    until: inviteUntil(),
    now: now.getTime(),
  };
}

// The invitation (D-043): one slip above the month until reminders are on, with "in 3 days".
function inviteBar() {
  if (!shouldInvite(pushDevice())) return '';
  return `<section class="backup-bar sheet-wrap" aria-labelledby="invite-h">
    <div class="backup-bar-sheet">
      <div><h2 id="invite-h">Reminders, even with the app closed</h2><p>Get a nudge before each habit's time, without keeping a tab open. One tap, and you can turn it off any time.</p></div>
      <div class="backup-bar-actions">
        <button class="btn btn--ink" type="button" data-push="on">Turn on</button>
        <button class="seg-link" type="button" data-push-later>Remind me in ${INVITE_DAYS} days</button>
      </div>
    </div>
  </section>`;
}

async function togglePush(on) {
  const account = ui.account;
  if (account.status !== 'signed-in') return;
  setPushChoice(account.id, on);
  setPush('busy');
  try {
    const sb = await getClient();
    if (on) {
      await enablePush(sb, account.id, store.reminders().off);
      ui.summaries = await loadSummaries(sb).catch(() => null);
      setPush('on');
      toast('Reminders will reach this device, even with One More Fold closed.');
    } else {
      await disablePush(sb, account.id);
      setPush('off');
      toast('This device won\'t get reminders while One More Fold is closed.');
    }
  } catch (err) {
    // The browser's own prompt was dismissed without an answer: the invitation waits its 3 days.
    if (on && Notification.permission === 'default') snoozeInvite();
    setPush(Notification.permission === 'denied' ? 'denied' : 'off');
    toast(err.message || 'That didn\'t work. Try again in a moment.');
  }
}

// The part of the Reminders panel about closed-app reminders. Shown only once the site has a VAPID key.
function closedAppReminders() {
  if (!pushSupported()) return '';
  let body;
  if (ui.account.status !== 'signed-in') {
    body = '<p class="note">Sign in from the paper ball at the top, and reminders can reach this device even with One More Fold closed.</p>';
  } else if (needsHomeScreen()) {
    body = '<p class="note">On iPhone and iPad, reminders reach One More Fold only from the Home Screen. In Safari, tap Share, then Add to Home Screen, open One More Fold from there and turn this on.</p>';
  } else if (ui.push === 'on') {
    body = `<p class="note">On for this device. Each reminder arrives up to 30 minutes before its habit's time, even with One More Fold closed, for the habits ticked below. Tap Done on it to fold the habit, or Later to hear about it again (not on iPhone and iPad).</p>
      ${summarySettings()}
      <div class="backup-actions"><button class="btn btn--quiet" type="button" data-push="off">Turn off on this device</button></div>`;
  } else if (ui.push === 'denied') {
    body = '<p class="note">Notifications are blocked for this site. Allow them in the browser\'s site settings, then come back here.</p>';
  } else {
    const busy = ui.push === 'busy' || ui.push === 'unknown';
    body = `<p class="note">Get a reminder up to 30 minutes before each habit's time, even when One More Fold isn't open. Each device you turn it on for gets them.</p>
      <div class="backup-actions"><button class="btn" type="button" data-push="on" ${busy ? 'disabled' : ''}>${ui.push === 'busy' ? 'Turning on…' : 'Remind me when One More Fold is closed'}</button></div>`;
  }
  return `<div class="push-box"><h3>When One More Fold is closed</h3>${body}</div>`;
}

// The daily summary and weekly recap (D-042): saved in the account, sent to every device with
// closed-app reminders on, at the chosen time in the person's own time zone.
function summarySettings() {
  const s = ui.summaries;
  if (!s) return '';
  return `<fieldset class="rem-list push-extra"><legend>Also send me</legend>
      <label><input type="checkbox" data-summary="daily" ${s.daily ? 'checked' : ''}><i></i><span>A daily summary: how today went</span></label>
      <label><input type="checkbox" data-summary="weekly" ${s.weekly ? 'checked' : ''}><i></i><span>A weekly recap, on Sundays</span></label>
    </fieldset>
    <label class="rem-lead">At<select data-summary-time>${SUMMARY_TIMES.map((t) => `<option value="${t}" ${s.time === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
}

async function changeSummaries(patch) {
  const before = { ...ui.summaries };
  ui.summaries = { ...ui.summaries, ...patch };
  scheduleRender();
  try {
    await saveSummaries(await getClient(), ui.account.id, patch);
    if (patch.daily || patch.weekly) toast(`On. It arrives at ${ui.summaries.time}, even with One More Fold closed.`);
  } catch (err) {
    ui.summaries = before;
    scheduleRender();
    toast(err.message);
  }
}

function remindersPanel(month) {
  const rem = store.reminders();
  const perm = permissionState();
  const timed = month.habits.filter((h) => h.time).sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
  const untimed = month.habits.length - timed.length;
  const status = !rem.enabled ? 'Off. Turn them on to get a nudge at each habit\'s time.'
    : perm === 'granted' ? 'On. Nudges arrive as notifications, and as a note on this page when it\'s open in front.'
      : perm === 'denied' ? 'On, but notifications are blocked for this site in the browser\'s settings. Nudges show as a note on this page instead.'
        : perm === 'unsupported' ? 'On. This browser can\'t show notifications, so nudges show as a note on this page.'
          : 'On. Allow notifications when the browser asks, or nudges only show on this page.';
  const leads = [[0, 'At the habit\'s time'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before']];
  return `<section class="panel" id="reminders" aria-labelledby="rem-h">
    <div class="panel-head"><h2 id="rem-h">Reminders</h2><p>${rem.enabled ? 'On' : 'Off'}</p></div>
    <p class="note">${status}</p>
    <div class="backup-actions" style="margin-top:14px">
      ${rem.enabled
        ? `<button class="btn btn--quiet" type="button" data-rem="off">Turn off</button>${perm === 'default' ? '<button class="btn" type="button" data-rem="on">Allow notifications</button>' : ''}`
        : '<button class="btn" type="button" data-rem="on">Turn on reminders</button>'}
      <button class="btn btn--quiet" type="button" data-rem="test" ${timed.length ? '' : 'disabled'}>Send a test</button>
    </div>
    <label class="rem-lead">When<select data-rem-lead>${leads.map(([v, l]) => `<option value="${v}" ${rem.lead === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <fieldset class="rem-list"><legend>Nudge me for</legend>
      ${timed.map((h) => `<label style="--c:${store.color(h.id)}"><input type="checkbox" data-rem-habit="${h.id}" ${rem.off[h.id] ? '' : 'checked'}><i></i><time>${esc(h.time)}</time><span>${esc(h.name)}</span></label>`).join('') || '<p class="note">No habit has a time yet.</p>'}
    </fieldset>
    <p class="note">${untimed ? `${untimed} habit${untimed === 1 ? ' has' : 's have'} no time, so ${untimed === 1 ? 'it gets' : 'they get'} no nudge. ` : ''}${ui.push === 'on' ? 'With a tab open in front, nudges also show as a note on the page.' : 'Without the setting below, browsers only send nudges while a One More Fold tab is open; it can sit in the background. A missed nudge still arrives for two hours after its time.'}</p>
    ${closedAppReminders()}
  </section>`;
}

// ---------- Interaction ----------
let toastTimer;
function toast(text) {
  const el = $('[data-toast]');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- Keeping data safe ----------
// The nudge exists only while data lives on this one device (store.backupDue is 0 once synced).
function backupBar() {
  const days = store.backupDue();
  if (!days) return '';
  const since = store.meta().lastBackupAt ? `${days} days since your last backup` : `${days} days of folds and no backup yet`;
  return `<section class="backup-bar sheet-wrap" aria-labelledby="backup-bar-h">
    <div class="backup-bar-sheet">
      <div><h2 id="backup-bar-h">Save a backup</h2><p>${since}. Your folds live only in this browser.</p></div>
      <div class="backup-bar-actions">
        <button class="btn btn--ink" type="button" data-export>Save a backup</button>
        <button class="seg-link" type="button" data-backup-later>Remind me tomorrow</button>
      </div>
    </div>
  </section>`;
}

function lastBackupText() {
  const at = store.meta().lastBackupAt;
  if (!at) return 'never.';
  const days = Math.floor((Date.now() - at) / 86400000);
  const when = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(new Date(at));
  return days === 0 ? `today, ${when}.` : days === 1 ? `yesterday, ${when}.` : `${days} days ago, ${when}.`;
}

// Asks the browser to keep the data permanently, once per visit, after a real click.
let protectionAsked = false;
function protectData() {
  if (protectionAsked || ui.protection === 'persistent') return;
  protectionAsked = true;
  store.protect().then((p) => { ui.protection = p; scheduleRender(); });
}

function toggle(btn) {
  protectData();
  const [id, dayStr] = btn.dataset.toggle.split(':');
  const day = Number(dayStr);
  const key = route().key;
  const on = store.toggle(key, id, day);
  const rect = btn.getBoundingClientRect();
  if (on) {
    const { y, m } = parseKey(key);
    const s = monthStats(store.get().months[key], y, m, now);
    const d = s.perDay[day - 1];
    if (d.goal && d.done === d.goal) {
      confetti();
      sfxPop(rect.right, rect.top, 'パーフェクト!', { size: 30 });
      toast(`Perfect day: all ${d.goal} habits on ${day} ${monthName(m)}.`);
    } else {
      sfxPop(rect.left + rect.width / 2, rect.top, 'パタ', { size: btn.classList.contains('cell') ? 18 : 24 });
    }
  }
  requestAnimationFrame(() => {
    const again = $(`[data-toggle="${CSS.escape(btn.dataset.toggle)}"]${btn.classList.contains('cell') ? '.cell' : '.tag'}`);
    const box = again?.classList.contains('tag') ? $('.tag-box', again) : again;
    if (box && !reduced) gsap.fromTo(box, { rotateY: on ? -180 : 0, scale: on ? 0.7 : 1 }, { rotateY: 0, scale: 1, duration: 0.45, ease: 'back.out(2)' });
  });
}

view.addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle]');
  if (t) return toggle(t);
  // The thousand cranes story (D-023), loaded the first time someone asks for it.
  if (e.target.closest('[data-crane-story]')) {
    return import('./ui/crane-story.js').then((m) => m.openCraneStory({ page: 'app' }))
      .catch(() => toast("The story couldn't load. Check your connection and try again."));
  }
  const sw = e.target.closest('[data-swatch]');
  if (sw) { ui.swatchFor = ui.swatchFor === sw.dataset.swatch ? null : sw.dataset.swatch; return render(); }
  const col = e.target.closest('[data-color]');
  if (col) { const [id, c] = col.dataset.color.split(':'); ui.swatchFor = null; return store.setColor(id, c); }
  const mv = e.target.closest('[data-move]');
  if (mv) { const [id, dir] = mv.dataset.move.split(':'); return store.moveHabit(route().key, id, Number(dir)); }
  const rm = e.target.closest('[data-remove]');
  if (rm) {
    const key = route().key;
    const h = store.view(key).habits.find((x) => x.id === rm.dataset.remove);
    if (h && window.confirm(`Remove “${h.name}” from ${monthName(parseKey(key).m)}? Its ticks for this month go with it.`)) {
      store.removeHabit(key, h.id);
      toast(`Removed ${h.name}.`);
    }
    return;
  }
  if (e.target.closest('[data-export]')) {
    store.markBackedUp();
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `onemorefold-backup-${monthKey(now.y, now.m)}-${String(now.d).padStart(2, '0')}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return toast('Backup saved to your downloads. Keep it somewhere safe.');
  }
  if (e.target.closest('[data-backup-later]')) {
    store.snoozeBackup(1);
    return toast('Okay, tomorrow.');
  }
  const wd = e.target.closest('[data-wd]');
  if (wd) {
    const [id, dayStr] = wd.dataset.wd.split(':');
    const key = route().key;
    const habit = store.view(key).habits.find((x) => x.id === id);
    if (!habit) return;
    const day = Number(dayStr);
    const current = habit.weekdays || [];
    const next = current.includes(day) ? current.filter((x) => x !== day) : [...current, day];
    if (!next.length) return toast('A habit on chosen days needs at least one day.');
    store.updateHabit(key, id, { weekdays: next });
    return;
  }
  const pv = e.target.closest('[data-pct-view]');
  if (pv) { ui.pct = pv.dataset.pctView; return render(); }
  if (e.target.closest('[data-pct-default]')) {
    store.setPref('percentView', pctView());
    ui.pct = null;
    return toast(`${VIEW_LABELS[pctView()]} is now your default view.`);
  }
  if (e.target.closest('[data-push-later]')) {
    snoozeInvite();
    toast(`Okay. We'll ask again in ${INVITE_DAYS} days.`);
    return render();
  }
  const push = e.target.closest('[data-push]');
  if (push) return togglePush(push.dataset.push === 'on');
  const rem = e.target.closest('[data-rem]');
  if (rem) {
    const act = rem.dataset.rem;
    if (act === 'on') {
      enableReminders().then((perm) => toast(perm === 'granted' ? 'Reminders on. Your habits will nudge you.' : 'Reminders on. They\'ll show on this page.'));
    } else if (act === 'off') {
      disableReminders();
      toast('Reminders off.');
    } else if (act === 'test' && !sendTestReminder()) {
      toast('Give a habit a time first.');
    }
    return;
  }
  const choose = e.target.closest('[data-sync-choose]');
  if (choose) return chooseSync(choose.dataset.syncChoose);
});

// Time and number fields fire `change` at every step of their picker or spinner (the hour, then
// the minutes, then AM/PM). Saving there redraws the editor, which closes the picker after one step,
// so these save when you leave the field or press Enter instead.
const savesOnLeave = (el) => el.type === 'time' || el.type === 'number';
function saveEdit(input) {
  if (input.dataset.field === 'name' && !input.value.trim()) { input.value = input.defaultValue; return; }
  if (input.value.trim() === input.defaultValue) return; // unchanged: no save, no redraw
  store.updateHabit(route().key, input.dataset.edit, { [input.dataset.field]: input.value.trim() });
}
view.addEventListener('focusout', (e) => {
  const input = e.target.closest?.('[data-edit]');
  if (input && savesOnLeave(input)) saveEdit(input);
});
view.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('[data-edit]') && savesOnLeave(e.target)) saveEdit(e.target);
});

view.addEventListener('change', (e) => {
  const input = e.target.closest('[data-edit]');
  if (input) {
    if (!savesOnLeave(input)) saveEdit(input);
    return;
  }
  if (e.target.matches('[data-private]')) {
    const id = e.target.dataset.private;
    store.setPrivate(id, e.target.checked);
    const h = store.view(route().key).habits.find((x) => x.id === id);
    return toast(e.target.checked ? `${h?.name || 'That habit'} is private: no buddy sees it.` : `${h?.name || 'That habit'} can be shared again, with buddies you pick it for.`);
  }
  if (e.target.matches('[name="default-view"]')) {
    ui.pct = null;
    store.setPref('percentView', e.target.value);
    return toast(`${VIEW_LABELS[e.target.value]} is now your default view.`);
  }
  if (e.target.matches('[data-rem-lead]')) return store.setReminders({ lead: Number(e.target.value) });
  const summary = e.target.closest('[data-summary]');
  if (summary && ui.account.status === 'signed-in') return changeSummaries({ [summary.dataset.summary]: summary.checked });
  if (e.target.matches('[data-summary-time]') && ui.account.status === 'signed-in') return changeSummaries({ time: e.target.value });
  if (e.target.matches('[data-rem-habit]')) {
    store.setHabitReminder(e.target.dataset.remHabit, e.target.checked);
    if (ui.push === 'on' && ui.account.status === 'signed-in') {
      getClient().then((sb) => saveSettings(sb, ui.account.id, store.reminders().off)).catch(() => toast('That change couldn\'t reach your account just now.'));
    }
    return;
  }
  const file = e.target.closest('[data-import]');
  if (file?.files?.[0]) {
    file.files[0].text().then((text) => {
      try { store.importJSON(text); toast('Backup loaded.'); } catch (err) { toast(err.message || 'That file could not be read.'); }
    });
  }
});

view.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.matches('[data-add]')) {
    const data = Object.fromEntries(new FormData(form));
    if (!data.name.trim()) return;
    const added = store.addHabit(route().key, { name: data.name, time: data.time, goal: data.goal, start: data.start, cadence: data.cadence });
    toast(added ? `Added ${data.name.trim()}.` : 'That habit could not be added. A month holds up to 50 habits.');
    requestAnimationFrame(() => $('[data-add] input[name="name"]')?.focus());
  }
  if (form.matches('[data-wish]')) {
    store.setWish(Number(form.dataset.wish), new FormData(form).get('wish'));
    toast(`Wish kept. ${CRANE_GOAL_TEXT} cranes to make it count.`);
  }
  if (form.matches('[data-fold]')) {
    const y = Number(form.dataset.fold);
    const data = new FormData(form);
    const kept = store.foldYear(y, { keep: data.getAll('keep'), wish: data.get('wish') });
    if (!reduced) confetti();
    toast(kept.length
      ? `${y} folded. ${kept.join(', ')} stayed: January already has ticks for ${kept.length === 1 ? 'it' : 'them'}.`
      : `${y} folded. January ${y + 1} is ready.`);
    location.hash = `#/year/${y}`;
  }
});

// Arrow keys move around the grid like a spreadsheet.
view.addEventListener('keydown', (e) => {
  const cell = e.target.closest('.cell[data-r]');
  if (!cell || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const rows = [...new Set($$('.cell[data-r]', view).map((c) => c.dataset.r))];
  let r = rows.indexOf(cell.dataset.r);
  let d = Number(cell.dataset.d);
  const find = (row, day) => $(`.cell[data-r="${CSS.escape(row || '')}"][data-d="${day}"]`, view);
  let target = null;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    // Skip rest days, which have no box to land on.
    const step = e.key === 'ArrowLeft' ? -1 : 1;
    for (let dd = d + step; dd >= 1 && dd <= 31 && !target; dd += step) target = find(rows[r], dd);
  } else {
    const step = e.key === 'ArrowUp' ? -1 : 1;
    // Nearest box in the next row that has one on or near this day.
    for (let rr = r + step; rr >= 0 && rr < rows.length && !target; rr += step) {
      for (let off = 0; off <= 6 && !target; off++) target = find(rows[rr], d - off) || find(rows[rr], d + off);
    }
  }
  target?.focus();
});

store.subscribe((state, info) => {
  flock.onStore();
  if (info?.saveFailed) toast('This browser refused to save. Your last change may be lost; save a backup now.');
  scheduleRender();
});
store.startClock();
store.protection().then((p) => { ui.protection = p; scheduleRender(); });
// "#/habits/2026-10#reminders" opens the view and scrolls to that panel.
function scrollToAnchor() {
  const anchor = location.hash.split('#')[2];
  const el = anchor && document.getElementById(anchor);
  if (el) el.scrollIntoView({ block: 'start' });
  else window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', () => {
  captureCard();
  flock.captureStart();
  ui.swatchFor = null;
  if (route().name === 'flock') flock.refresh();
  render();
  view.focus({ preventScroll: true });
  scrollToAnchor();
});
// Another tab (or a reminder fired there) changed the data: take its copy.
window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) store.reloadFromStorage(); });
// A new day, or the next nudge time, while the tab is open.
let nudgeSig = '';
setInterval(() => {
  const n = nextReminder(store.get(), new Date());
  const sig = n ? `${n.habit.id}@${n.at}` : '';
  if (today().d !== now.d || sig !== nudgeSig) scheduleRender();
  nudgeSig = sig;
}, 60000);

render();
scrollToAnchor();
if (location.hash.endsWith('#wish')) $('#wish-text')?.focus();
startReminders({ toast });
// After the first render: the sign-in client is only needed once the page is usable. A timer, not
// requestAnimationFrame, so a tab opened in the background still signs in.
setTimeout(() => startAuth(onAccount, toast), 0);
// Back online, or back to this tab: send what's queued and fetch what other devices changed.
window.addEventListener('online', () => sync.pull());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.pull(); });
setInterval(() => { if (document.visibilityState === 'visible') sync.pull(); }, 5 * 60 * 1000);
if (!reduced) gsap.from('.panel, .title-row', { opacity: 0, y: 18, duration: 0.6, stagger: 0.05, ease: 'power3.out', clearProps: 'opacity,transform' });
