import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { store, STORE_KEY } from './lib/store.js';
import { monthName, monthShort, minutesOf } from './lib/dates.js';
import { yearStats, percent } from './lib/stats.js';
import { CRANE_GOAL, CRANE_GOAL_TEXT, AUTHOR, PRIVACY_PATH, TERMS_PATH, PATCH_NOTES_PATH } from './config.js';
import { tearAll, craneMark, sfxPop, confetti, rng, inkOn } from './ui/paper.js';
import { hills, mountains } from './ui/charts.js';
import { featuredMonth, daysLeftInYear } from './ui/insights.js';
import { createCraneStage } from './three/stage.js';
import { startReminders } from './ui/reminders.js';
import { esc, safeColor } from './lib/sanitize.js';
import { sheetState, STORY_DATE, STORY_SPAN } from './data/story.js';
import { DEMO_HABITS, STORY_ALIASES } from './data/demo.js';
import { createAccountMenu } from './ui/account-menu.js';
import { startAuth } from './lib/auth.js';
import { watchTheme } from './lib/theme.js';
import { hangBulletin } from './ui/bulletin.js';

gsap.registerPlugin(ScrollTrigger);
window.__oz = true;
watchTheme();
hangBulletin(document.querySelector('[data-bulletin]'));

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// The page tells the story of the sheet this app grew from (D-016, D-021): oze's real numbers up
// to 22 October 2026, the day before One More Fold was born, under everyday habit names.
function storyState() {
  const s = sheetState();
  for (const month of Object.values(s.months)) {
    for (const h of month.habits) Object.assign(h, STORY_ALIASES[h.id] || { name: 'A habit', time: '' });
  }
  return s;
}
const state = storyState();
const now = STORY_DATE;
const feat = featuredMonth(state, now);
const year = yearStats(state, now.y, now);
const color = (id) => safeColor(state.colors[id]);

$$('[data-mark]').forEach((el) => { el.innerHTML = craneMark(); });

// ---------- Hero collage pieces ----------
function cloud(seed) {
  const r = rng(seed);
  const bumps = Array.from({ length: 5 }, (_, i) => ({ cx: 30 + i * 34 + r() * 8, cy: 52 - Math.sin((i / 4) * Math.PI) * 22 - r() * 6, r: 22 + r() * 12 }));
  return `<svg viewBox="0 0 220 90">${bumps.map((b) => `<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="var(--paper-back)"/>`).join('')}<rect x="14" y="52" width="192" height="30" rx="15" fill="var(--paper-back)"/></svg>`;
}
$$('[data-cloud]').forEach((el, i) => { el.innerHTML = cloud(i * 13 + 5); });

const lines = $('[data-speedlines]');
if (lines) {
  const r = rng(9);
  let s = '';
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + r() * 0.05;
    const inner = 190 + r() * 60, outer = 430;
    const w = 1 + r() * 3.5;
    const x1 = 300 + Math.cos(a) * inner, y1 = 300 + Math.sin(a) * inner;
    const x2 = 300 + Math.cos(a - 0.012 * w) * outer, y2 = 300 + Math.sin(a - 0.012 * w) * outer;
    const x3 = 300 + Math.cos(a + 0.012 * w) * outer, y3 = 300 + Math.sin(a + 0.012 * w) * outer;
    s += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} L${x3.toFixed(1)} ${y3.toFixed(1)} Z" fill="var(--paper-back)"/>`;
  }
  lines.innerHTML = s;
}

// ---------- The live thing: fold today's habits into a crane ----------
// Generic tasks, not anyone's real habits (D-016).
const demoHabits = DEMO_HABITS;
const demoDone = new Set();
const list = $('[data-demo-list]');
const count = $('[data-demo-count]');
const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

list.innerHTML = demoHabits.map((h) => `
  <li><button class="tag" type="button" aria-pressed="false" data-id="${h.id}" style="--c:${h.color}">
    <span class="tag-box" aria-hidden="true"></span>
    <span class="tag-time">${esc(h.time) || '—'}</span>
    <span class="tag-name">${esc(h.name)}</span>
  </button></li>`).join('');

const stage = createCraneStage($('.stage-canvas'), {
  color: '#C8302C',
  progress: 0,
  flock: reduced ? 0 : 3,
  onCraneClick: (e) => sfxPop(e.clientX, e.clientY, 'パタパタ'),
});

list.addEventListener('click', (e) => {
  const btn = e.target.closest('.tag');
  if (!btn) return;
  const id = btn.dataset.id;
  const on = !demoDone.has(id);
  on ? demoDone.add(id) : demoDone.delete(id);
  btn.setAttribute('aria-pressed', String(on));
  const n = demoDone.size, total = demoHabits.length;
  stage.setProgress(n / total);
  const r = btn.querySelector('.tag-box').getBoundingClientRect();
  if (on) sfxPop(r.right + 6, r.top + 4, n === total ? 'パーフェクト!' : 'パタ', { size: n === total ? 30 : 24 });
  if (on && !reduced) gsap.fromTo(btn.querySelector('.tag-box'), { rotateY: -180 }, { rotateY: 0, duration: 0.5, ease: 'back.out(2)' });
  if (n === total && on) { confetti(); craneSays(); }
  count.textContent = n === 0 ? 'No folds yet. Tap a habit you\'ve done.'
    : n === total ? `All ${words[total]?.toLowerCase() || total}. That's a whole crane.`
      : `${words[n] || n} of ${total} folds. ${total - n} to go.`;
});

// ---------- The thousand cranes story (D-023) ----------
// One scroll, loaded on first use. The crane's line and the folded note start loading it as soon
// as they appear, so it opens without a wait.
const story = () => import('./ui/crane-story.js');
const openStory = (onClose) => story().then((m) => m.openCraneStory({ page: 'landing', onClose }));

// Once the six are ticked and the crane is whole, it asks a question, once per visit.
const says = $('[data-crane-says]');
let saidIt = false;
function craneSays() {
  if (saidIt) return;
  saidIt = true;
  story();
  setTimeout(() => { says.hidden = false; }, reduced ? 0 : 900);
}
says.addEventListener('click', (e) => {
  if (e.target.closest('[data-story]')) openStory().catch(() => {});
  else if (e.target.closest('[data-crane-says-x]')) says.hidden = true;
});

// The folded note on the wish card: it wiggles once when it comes into view, and unfolds into the
// story when tapped. It folds itself back up once the story is closed.
const note = $('[data-fold-note]');
note.addEventListener('click', () => {
  if (note.classList.contains('is-open')) return;
  note.classList.add('is-open');
  const refold = () => setTimeout(() => note.classList.remove('is-open'), 250);
  setTimeout(() => openStory(refold).catch(refold), reduced ? 0 : 480);
});
new IntersectionObserver((entries, io) => {
  if (!entries[0].isIntersecting) return;
  io.disconnect();
  story();
  note.classList.add('is-seen');
}, { threshold: 0.9 }).observe(note);

// ---------- Why: real numbers from the sheet ----------
const monthsWithData = year.months.filter((x) => x.rate !== null).length;
const fs = feat.stats;
$('[data-why-numbers]').innerHTML = [
  ['13', 'tabs in oze\'s old sheet'],
  [String(fs.total.possible), `checkboxes in ${monthName(feat.m)} alone`],
  [String(year.cranes), `ticks from 1 January to 22 October`],
].map(([n, l]) => `<div class="ticket"><dt>${n}</dt><dd>${l}</dd></div>`).join('');

// The torn spreadsheet scrap uses the sheet's own TRUE/FALSE cells.
const scrapHabits = fs.habits.slice(0, 4);
$('[data-scrap]').innerHTML = `<tr><th></th>${Array.from({ length: 6 }, (_, i) => `<th>${String.fromCharCode(74 + i)}</th>`).join('')}</tr>` +
  scrapHabits.map((h) => `<tr><td>${esc(h.name)}</td>${h.cells.slice(0, 6).map((c) => `<td class="${c ? 't' : 'f'}">${c ? 'TRUE' : 'FALSE'}</td>`).join('')}</tr>`).join('');

// ---------- Keeps: the zine ----------
const top = fs.top[0];
const best = [...fs.habits].sort((a, b) => b.longest - a.longest)[0];
const mName = monthName(feat.m);
const goalHabit = [...fs.habits].sort((a, b) => b.goal - a.goal)[0];
const weekLine = fs.weeks.filter((w) => w.done > 0).slice(0, 2).map((w) => `week ${w.index} was ${w.done} of ${w.possible}`).join(', ');
const panels = [
  ['The month on one page', 'Every habit down the side, every day across, one tap to tick.',
    `<div class="mini-grid" style="grid-template-columns:repeat(${fs.days},minmax(0,1fr))">${fs.habits.map((h) => h.cells.map((c, i) => `<i class="${c ? 'on' : ''}${fs.isCurrent && i + 1 === now.d ? ' is-today' : ''}" style="--c:${color(h.id)}"></i>`).join('')).join('')}</div>`],
  ['A goal for each habit', `${esc(goalHabit.name)} wants ${goalHabit.goal} days in ${mName}. Each habit shows what's done and what's left.`,
    `<div class="goal-bars">${fs.habits.slice(0, 5).map((h) => `<div class="goal-bar" style="--c:${color(h.id)}"><span>${esc(h.name)}</span><span>${h.done}/${h.goal}</span><div class="goal-track"><div class="goal-fill" style="width:${Math.min(100, h.progress * 100)}%"></div></div></div>`).join('')}</div>`],
  ['Streaks, current and longest', `${esc(best.name)} ran ${best.longest} days in a row in ${mName}. A run keeps counting past the 1st of the month, and today's counts until midnight.`,
    `<div class="chain" style="--c:${color(best.id)}">${'<i></i>'.repeat(best.longest)}</div><p class="chain-label">${best.longest} days, ${esc(best.name)}</p>`],
  ['Five weeks at a glance', `Weeks count from the 1st, like the sheet did: ${weekLine}.`,
    `<div class="weeks">${fs.weeks.map((w) => `<div class="week"><span>Week ${w.index}</span><div class="week-track"><div class="week-fill" style="width:${w.pct * 100}%"></div></div><span>${w.done}/${w.possible}</span></div>`).join('')}</div>`],
  ['Every day\'s score', 'The daily line the sheet drew as a chart, here as paper hills.',
    hills(fs.perDay.map((d) => (d.past ? d.pct : null)), { width: 320, height: 150, today: fs.isCurrent ? now.d : null })],
  ['The habits, ranked', `${esc(top.name)} leads ${mName} at ${percent(top.progress)} of its goal.`,
    `<ol class="ranked">${fs.top.slice(0, 6).map((h) => `<li style="--c:${color(h.id)};color:${inkOn(color(h.id))}"><span>${esc(h.name)}</span><span>${percent(h.progress)}</span></li>`).join('')}</ol>`],
  ['The whole year', 'Each month\'s success rate, January to December, on one ridge.',
    `<svg class="mini-range" viewBox="0 0 320 150" aria-hidden="true">${mountains(year.months, { width: 320, height: 150, mini: true })}</svg>`],
];
$('[data-zine]').innerHTML = panels.map(([h, p, viz]) => `<li class="panel"><h3>${h}</h3><p>${p}</p><div class="panel-viz">${viz}</div></li>`).join('');

// ---------- Year: the mountain range ----------
const nWord = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'][monthsWithData];
$('[data-year-title]').textContent = `${nWord} months, ${year.cranes} cranes.`;
const rated = year.months.filter((x) => x.rate !== null && !(x.m === now.m && now.y === year.year));
const worst = rated.reduce((a, b) => (b.rate < a.rate ? b : a), rated[0]);
$('[data-year-lede]').textContent = `An example from oze's own year, ${STORY_SPAN}. Each mountain is a month, as tall as its success rate. ${monthName(year.best.m)} was the best at ${percent(year.best.rate)}, ${monthName(worst.m)} the dip at ${percent(worst.rate)}. ${monthName(now.m)} was still being folded when this tracker was born on 23 October.`;
$('[data-range]').innerHTML = mountains(year.months, { current: now.m });
$('[data-range-labels]').innerHTML = year.months.map((x) => `<li class="${x.rate === null ? 'muted' : ''}"><span class="long">${monthShort(x.m)}</span><span class="short">${monthShort(x.m)[0]}</span><b>${x.rate === null ? '—' : `${Math.round(x.rate * 100)}<span class="pct">%</span>`}</b></li>`).join('');

// ---------- New ----------
const remaining = Math.max(0, CRANE_GOAL - year.cranes);
const daysLeft = daysLeftInYear(now);
$('[data-wish-text]').textContent = remaining > 0
  ? `Every tick folds one crane, and legend says a thousand grant a wish. By 22 October oze had folded ${year.cranes}: ${remaining} more by 31 December is about ${Math.ceil(remaining / daysLeft)} a day.`
  : `Every tick folds one crane, and legend says a thousand grant a wish. oze passed ${CRANE_GOAL_TEXT} this year.`;
$('[data-wish-figure]').textContent = `${year.cranes} of ${CRANE_GOAL_TEXT}`;

const dayHabits = [...feat.month.habits].filter((h) => h.time).sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
const next = dayHabits.find((h) => minutesOf(h.time) >= nowMin);
$('[data-dayline]').innerHTML = dayHabits.map((h) => `<li class="${h === next ? 'next' : ''}" style="--c:${color(h.id)}"><time>${esc(h.time)}</time><i></i><span>${esc(h.name)}${h === next ? '<em>next</em>' : ''}</span></li>`).join('');

// Schedules (D-013): three made-up habits, each on a different kind of week.
// tick: done; due: due and not yet done; open: any day counts; rest: not due, never a miss.
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const schedules = [
  { name: 'Gym', rule: 'Mon, Wed, Fri', c: 'var(--ai)', days: ['tick', 'rest', 'tick', 'rest', 'due', 'rest', 'rest'], note: '2 of 3 this week' },
  { name: 'Swim', rule: '3 times a week', c: 'var(--matcha)', days: ['tick', 'open', 'open', 'tick', 'open', 'open', 'open'], note: '2 of 3 this week' },
  { name: 'Call home', rule: 'Once a week', c: 'var(--shu)', days: ['open', 'open', 'tick', 'open', 'open', 'open', 'open'], note: 'Done this week' },
];
const dayWord = { tick: 'done', due: 'due', open: 'any day', rest: 'rest day' };
$('[data-sched]').innerHTML = schedules.map((s) => `<li style="--c:${s.c}">
  <span class="sched-name">${esc(s.name)}</span><span class="sched-rule">${esc(s.rule)}</span>
  <span class="sched-week" aria-hidden="true">${s.days.map((d, i) => `<i class="${d}" title="${WEEK[i]}: ${dayWord[d]}"></i>`).join('')}</span>
  <span class="sched-note">${esc(s.note)}</span></li>`).join('');
const perfectYear = year.months.reduce((s, x) => s + (x.perfectDays || 0), 0);
$('[data-perfect-text]').textContent = `Tick every habit in a day and the crane takes off. oze's ${mName} had ${fs.perfectDays} by the 22nd; the year, ${perfectYear}.`;
$('[data-confetti]').addEventListener('click', (e) => { confetti(); sfxPop(e.clientX, e.clientY - 10, 'パーフェクト!'); });

// Who made this (config.js): plain text and two fixed link shapes, nothing from outside.
$('[data-author]').innerHTML = `Made by ${esc(AUTHOR.nickname)} (${esc(AUTHOR.name)}), folded out of ${esc(AUTHOR.nickname)}'s Habit Tracker v2.`;
$('[data-author-links]').innerHTML = `<a href="mailto:${esc(AUTHOR.email)}">${esc(AUTHOR.email)}</a><a href="${esc(AUTHOR.github)}" rel="noopener">GitHub</a><a href="${PATCH_NOTES_PATH}">Patch notes</a><a href="${PRIVACY_PATH}">Privacy</a><a href="${TERMS_PATH}">Terms</a>`;
$('[data-patch-link]').href = PATCH_NOTES_PATH;

tearAll();

// ---------- Motion ----------
if (reduced) {
  gsap.set('.reveal', { opacity: 1 });
  $('[data-wish-meter] span').style.width = `${Math.min(100, (year.cranes / CRANE_GOAL) * 100)}%`;
} else {
  // The collage assembles itself: sheets drop onto the table one after another.
  const hero = gsap.timeline({ defaults: { ease: 'back.out(1.6)' } });
  hero
    .fromTo('.stage-sky', { opacity: 0, y: -40, rotate: -8 }, { opacity: 1, y: 0, rotate: -1.5, duration: 0.7 })
    .fromTo('.stage-sun', { scale: 0 }, { scale: 1, duration: 0.5 }, '-=0.35')
    .fromTo('.speedlines', { opacity: 0, scale: 0.8 }, { opacity: 0.55, scale: 1, duration: 0.6, ease: 'power2.out' }, '-=0.3')
    .fromTo('.cloud', { opacity: 0, x: (i) => (i ? 60 : -60) }, { opacity: 1, x: 0, duration: 0.6, stagger: 0.1 }, '-=0.4')
    .fromTo('.today', { opacity: 0, y: 60, rotate: 6 }, { opacity: 1, y: 0, rotate: 1.2, duration: 0.7 }, '-=0.3')
    .fromTo('.stage-sfx', { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(3)' }, '-=0.2');
  gsap.fromTo('.hero .reveal', { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.09, ease: 'power3.out', delay: 0.1 });

  // Section entrances: heading, then text, then pictures, 80ms apart.
  $$('main > section:not(.hero)').forEach((sec) => {
    const items = $$('.reveal', sec);
    if (!items.length) return;
    gsap.fromTo(items, { opacity: 0, y: 26 }, {
      opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out',
      scrollTrigger: { trigger: sec, start: 'top 78%', once: true },
    });
  });

  // Scroll-linked drift on the photographs: each print slides a little against the page.
  $$('.book, .range-print, .closing-print, .wish-photo').forEach((el, i) => {
    gsap.fromTo(el.querySelector('img') || el, { yPercent: -4 }, {
      yPercent: 4, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
    });
    el.style.overflow = 'hidden';
    if (i === 0) el.querySelector('img').style.scale = '1.1';
  });
  $$('.range-print img, .closing-print img, .wish-photo img').forEach((img) => { img.style.scale = '1.1'; });

  // Mountains rise out of the ground in order, January first.
  gsap.fromTo('.range-svg .mtn', { scaleY: 0 }, {
    scaleY: 1, duration: 0.9, ease: 'back.out(1.4)', stagger: 0.06,
    scrollTrigger: { trigger: '.range', start: 'top 75%', once: true },
  });
  gsap.fromTo('.range-svg .peak-flag', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, delay: 1, scrollTrigger: { trigger: '.range', start: 'top 75%', once: true } });

  gsap.fromTo('[data-wish-meter] span', { width: '0%' }, {
    width: `${Math.min(100, (year.cranes / CRANE_GOAL) * 100)}%`, duration: 1.6, ease: 'power2.out',
    scrollTrigger: { trigger: '.piece--wish', start: 'top 75%', once: true },
  });

  // The signature move: the zine of features unfolds as you scroll through it.
  const mm = gsap.matchMedia();
  mm.add('(min-width: 761px)', () => {
    const zine = $('.zine');
    const panelsEls = $$('.panel', zine);
    const distance = () => Math.max(0, zine.scrollWidth - zine.parentElement.clientWidth);
    gsap.set(panelsEls, { rotateY: (i) => (i % 2 ? -32 : 32) });
    const tl = gsap.timeline({
      scrollTrigger: { trigger: '.keeps', start: 'top top', end: () => `+=${distance() + 160}`, scrub: 0.6, pin: true, invalidateOnRefresh: true },
    });
    tl.to(panelsEls, { rotateY: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out' }, 0)
      .to(zine, { x: () => -distance(), duration: 1, ease: 'none' }, 0.1);
  });

  // Hovering a piece of the collage lifts it like a sheet being picked up.
  $$('.piece, .ticket').forEach((el) => {
    el.addEventListener('pointerenter', () => gsap.to(el, { y: -6, rotate: '+=0.6', duration: 0.3, ease: 'power2.out' }));
    el.addEventListener('pointerleave', () => gsap.to(el, { y: 0, rotate: '-=0.6', duration: 0.4, ease: 'power2.out' }));
  });
}

window.addEventListener('load', () => ScrollTrigger.refresh());

// The account ball in the header (D-022). Sign-in is loaded after the page, never before it.
const menu = createAccountMenu($('[data-account]'), { page: 'landing' });
window.addEventListener('load', () => startAuth((account) => menu.update({ account })));

// Nudges also arrive while only this page is open.
startReminders();
window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) store.reloadFromStorage(); });
