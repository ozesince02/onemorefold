// The sugoroku board (D-050): a gang's whole run as a paper board game the gang walks together.
// Squares snake along rows of seven (for a daily gang, a row is a week); a square everyone folded
// gets the gang's crane stamped on it, a square some folded shows how many, and a square nobody
// folded stays plain paper. The piece stands on today and moves on a square a day, whatever
// happened: nobody is ever sent back. The squares come from boardOf() (src/lib/gangs.js).
import { esc } from '../lib/sanitize.js';
import { monthShort } from '../lib/dates.js';
import { parseDay } from '../lib/gangs.js';
import { craneMark } from './paper.js';

const COLS = 7;
const DAY_NAME = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const TINTS = ['sora', 'sakura', 'matcha', 'yamabuki'];

// Where square i sits: rows of seven, every other row running back the other way.
const place = (i) => { const r = Math.floor(i / COLS); const c = i % COLS; return { r, c: r % 2 ? COLS - 1 - c : c }; };

function dateLabel(sq, unit, first) {
  const a = parseDay(sq.from);
  if (unit === 'month') return `<span class="sq-date">${monthShort(a.m)}</span>`;
  const month = first || a.d === 1 || (unit === 'week' && a.d <= 7) ? `<small>${monthShort(a.m)}</small>` : '';
  if (unit === 'week') return `<span class="sq-date">${a.d}–${parseDay(sq.to).d}${month}</span>`;
  return `<span class="sq-date">${a.d}${month}</span>`;
}

function words(sq, unit, members) {
  const a = parseDay(sq.from);
  const b = parseDay(sq.to);
  const when = unit === 'day' ? `${DAY_NAME.format(new Date(a.y, a.m - 1, a.d))} ${a.d} ${monthShort(a.m)}`
    : unit === 'week' ? `${a.d} to ${b.d} ${monthShort(b.m)}` : `${monthShort(a.m)} ${a.y}`;
  const names = sq.folded.map((i) => members[i].name).join(', ');
  const said = {
    rest: 'a rest day',
    future: 'still to come',
    all: sq.active.length > 1 ? `everyone folded, a gang crane (${names})` : `folded (${names})`,
    some: `${sq.folded.length} of ${sq.active.length} folded (${names})`,
    none: sq.now ? 'nobody has folded yet' : 'nobody folded',
  }[sq.state];
  return `${when}: ${said}${sq.now ? ', today' : ''}`;
}

const piece = (where) => `<span class="koma koma--${where}" aria-hidden="true">${craneMark('var(--on-color)', 'var(--on-color)')}</span>`;

export function boardHTML(g, board) {
  const { squares, unit, at } = board;
  const n = squares.length;
  if (!n) return '';
  const rows = Math.ceil(n / COLS);
  const points = squares.map((_, i) => { const { r, c } = place(i); return `${c * 100 + 50},${r * 100 + 50}`; }).join(' ');
  const cells = squares.map((sq, i) => {
    const { r, c } = place(i);
    const tint = TINTS[i % TINTS.length];
    const dots = sq.state === 'rest' || sq.state === 'future' || sq.active.length < 2 ? ''
      : `<span class="sq-dots" aria-hidden="true">${sq.active.map((k) => `<i class="${sq.folded.includes(k) ? 'on' : ''}"></i>`).join('')}</span>`;
    const middle = sq.state === 'all' ? `<span class="sq-stamp" aria-hidden="true">${craneMark('var(--accent)', 'var(--accent)')}</span>`
      : sq.state === 'some' ? `<span class="sq-count" aria-hidden="true">${sq.folded.length}/${sq.active.length}</span>` : '';
    const flags = `${i === 0 ? '<span class="sq-flag sq-flag--start" aria-hidden="true">フリダシ</span>' : ''}${i === n - 1 ? '<span class="sq-flag sq-flag--end" aria-hidden="true">アガリ</span>' : ''}`;
    const here = at === i ? piece('here') : at === -1 && i === 0 ? piece('waiting') : at === n && i === n - 1 ? piece('home') : '';
    return `<li class="sq sq--${sq.state}${sq.now ? ' is-now' : ''}" style="grid-row:${r + 1};grid-column:${c + 1};--tint:var(--${tint})">
      <span class="sq-paper" role="img" aria-label="${esc(words(sq, unit, g.members))}">${dateLabel(sq, unit, i === 0)}${middle}${dots}</span>${flags}${here}</li>`;
  }).join('');
  const per = { day: 'day', week: 'week', month: 'month' }[unit];
  return `<div class="sugoroku"><div class="sugoroku-field">
    <svg class="sugoroku-path" viewBox="0 0 ${COLS * 100} ${rows * 100}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}"/></svg>
    <ol class="sugoroku-squares" aria-label="The board: a square a ${per}, from the start to the finish">${cells}</ol>
  </div></div>
  <div class="grid-legend sugoroku-legend">
    <span><i class="lg-stamp" aria-hidden="true">${craneMark('var(--accent)', 'var(--accent)')}</i>Everyone folded: a gang crane</span>
    <span><b aria-hidden="true">2/3</b>Some folded</span>
    <span><i class="lg-plain" aria-hidden="true"></i>Nobody folded</span>
    ${unit === 'day' && squares.some((x) => x.rest) ? '<span><i class="lg-rest" aria-hidden="true"></i>Rest day</span>' : ''}
    <span><i class="lg-koma" aria-hidden="true">${craneMark('var(--on-color)', 'var(--on-color)')}</i>The gang, ${at >= n ? 'home' : at < 0 ? 'waiting at the start' : unit === 'day' ? 'today' : `this ${per}`}</span>
  </div>`;
}
