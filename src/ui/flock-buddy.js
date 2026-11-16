// A buddy's page in Flock (D-050, D-051): their figures, and, when they share their habits day by
// day, their month as their own Month tab draws it, read-only. Built from what my_buddies() and
// buddy_month() return; every name is escaped with esc() here.
import { esc } from '../lib/sanitize.js';
import { monthName, monthShort, weekday } from '../lib/dates.js';
import { monthStats, percent } from '../lib/stats.js';
import { cadenceOf, describe } from '../lib/schedule.js';
import { trendOf, ageOf } from '../lib/buddies.js';

const NARROW = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow' });
const TRENDS = { rising: 'Rising', steady: 'Steady', quieter: 'Quieter lately' };
const dateText = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${monthName(m)}`; };

// Their four figures: the last 7 days, the last 30, the longest run going, and the trend.
export function figuresHTML(b, now) {
  const f = b.figures;
  if (!f || !f.week_due) {
    return `<section class="panel span-12 buddy-figures"><p class="note">No figures from ${esc(b.name)} yet. They appear once they've had something due.</p></section>`;
  }
  const trend = trendOf(f);
  const age = ageOf(f.as_of, now);
  const cell = (big, label) => `<div class="buddy-figure"><p class="big">${big}</p><p class="label">${label}</p></div>`;
  return `<section class="panel span-12 buddy-figures" aria-labelledby="bf-h">
    <div class="panel-head"><h2 id="bf-h">How ${esc(b.name)} is doing</h2><p>${age ? `As of ${dateText(f.as_of)}${age > 2 ? `, ${age} days ago` : ''}` : 'As of today'}</p></div>
    <div class="buddy-figure-row">
      ${cell(`${f.week_done}<small> of ${f.week_due}</small>`, 'due in the last 7 days, done')}
      ${cell(`${f.month_done}<small> of ${f.month_due}</small>`, 'due in the last 30 days, done')}
      ${cell(`${f.run}<small> ${f.run === 1 ? 'day' : 'days'}</small>`, 'longest run going')}
      ${cell(trend ? TRENDS[trend] : '—', trend ? 'this week, against the week before' : 'no trend yet: a week with nothing due')}
    </div>
  </section>`;
}

// Their month: the habits they share, as their Month tab shows them, with nothing to press.
// `month`: { habits, checks, colors } from loadBuddyMonth().
export function monthGridHTML(b, month, y, m, now, nav) {
  const head = `<div class="panel-head"><h2 id="bm-h">${esc(b.name)}'s ${monthName(m)}</h2>${nav}</div>`;
  if (!month) return `<section class="panel span-12 grid-panel" aria-labelledby="bm-h" aria-busy="true">${head}<p class="note">Opening their month…</p></section>`;
  if (month.failed) return `<section class="panel span-12 grid-panel" aria-labelledby="bm-h">${head}<p class="note">Couldn't load their month. Check your connection, then come back to Flock.</p></section>`;
  if (!month.habits.length) {
    return `<section class="panel span-12 grid-panel" aria-labelledby="bm-h">${head}
      <p class="note">Nothing to show for ${monthName(m)}: none of the habits ${esc(b.name)} shares were in their tracker then.</p></section>`;
  }
  const s = monthStats(month, y, m, now);
  const todayCol = s.isCurrent ? now.d : 0;
  const days = Array.from({ length: s.days }, (_, i) => i + 1);
  const isWeekend = (d) => [0, 6].includes(weekday(y, m, d));
  const cols = [
    ['Done', 'Days ticked', (h) => h.done],
    ['% due', 'Done against what was due so far', (h) => (h.daysSoFar > 0 ? percent(h.daysPct) : '—')],
    ['Goal', 'Their monthly goal in days', (h) => h.goal],
    ['Best', 'Longest run this month', (h) => h.longest],
  ];
  const head1 = `<tr class="week-row"><th></th>${s.weeks.map((w) => `<th class="wk" colspan="${w.to - w.from + 1}">Week ${w.index}</th>`).join('')}<th colspan="${cols.length}"></th></tr>`;
  const head2 = `<tr><th></th>${days.map((d) => `<th class="${isWeekend(d) ? 'weekend' : ''}" aria-hidden="true">${NARROW.format(new Date(y, m - 1, d))}</th>`).join('')}
    ${cols.map(([h, title]) => `<th scope="col" title="${title}">${h}</th>`).join('')}</tr>`;
  const head3 = `<tr><th></th>${days.map((d) => `<th scope="col" class="${d === todayCol ? 'is-today' : ''}${isWeekend(d) ? ' weekend' : ''}">${d}</th>`).join('')}<th colspan="${cols.length}"></th></tr>`;
  const rows = s.habits.map((h) => {
    const cells = h.cells.map((c, i) => {
      const d = i + 1;
      const today = d === todayCol ? ' class="is-today"' : '';
      const when = `${d} ${monthShort(m)}`;
      if (c === null) return `<td><span class="cell na" role="img" aria-label="${esc(h.name)}, ${when}: not tracked yet"></span></td>`;
      if (h.due[i] === 'rest' && !c) return `<td${today}><span class="cell rest" role="img" aria-label="${esc(h.name)}, ${when}: a rest day"></span></td>`;
      const future = s.isCurrent ? d > now.d : s.lastDay === 0;
      const kind = h.due[i] === 'flex' ? ' flex' : '';
      return `<td${today}><span class="cell${kind}${c ? ' is-on' : ''}${future ? ' future' : ''}" role="img" aria-label="${esc(h.name)}, ${when}: ${c ? 'ticked' : future ? 'still to come' : 'not ticked'}"></span></td>`;
    }).join('');
    const sched = cadenceOf(h) === 'daily' ? '' : `${esc(describe(h))} · `;
    return `<tr style="--c:${month.colors[h.id]}">
      <th class="h-name" scope="row"><div class="h-name-inner"><i></i><b title="${esc(h.name)}">${esc(h.name)}</b><small>${sched}goal ${h.goal}</small></div></th>
      ${cells}${cols.map(([, , v]) => `<td class="sum">${v(h)}</td>`).join('')}</tr>`;
  }).join('');
  return `<section class="panel span-12 grid-panel" aria-labelledby="bm-h">
    ${head}
    <div class="grid-scroll">
      <table class="habit-grid is-readonly">
        <colgroup><col class="c-name">${days.map(() => '<col class="c-day">').join('')}${'<col class="c-sum">'.repeat(cols.length)}</colgroup>
        <thead>${head1}${head2}${head3}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="grid-legend"><span>Only the habits ${esc(b.name)} picked to share. Their private habits never show.</span><span>Dots are rest days</span></div>
  </section>`;
}
