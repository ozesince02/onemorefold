// Shelves of scrolls (D-048): Flock keeps each gang and each buddy as a big rolled scroll standing
// upright on a wooden shelf, a little crooked, the way scrolls stand when someone just put them
// down. A scroll unrolls sideways where it stands (its roll stays upright at the left, the paper
// comes out to the right) and pushes the scrolls after it to the end of the shelf. When the shelf
// has no room for it, the scroll is pulled out and opened on its own instead.
//
// An item: { key, name, seal, paper, width, sheet, ghost? }
//   key    'gang:<id>', 'buddy:<id>', 'new:gang', 'new:buddy'; also its place in the open state
//   name   on the label down the roll (escaped here)
//   seal   a few characters at the roll's foot: a code, "4/5", "rest" (escaped here)
//   paper  one of the papers (the cord around the roll and the paper's top edge)
//   width  the unrolled sheet's width in px
//   sheet  the sheet's content, already escaped by whoever made it
import { esc } from '../lib/sanitize.js';

export const ROLL = 46;          // a rolled scroll's width
export const ROLLED_OPEN = 30;   // the roll left standing once a scroll is open
export const EDGE = 9;           // the stick at the paper's free edge
export const GAP = 12;
export const SIDE = 16;          // the shelf's own padding, each side
const PAPERS = ['sora', 'sakura', 'matcha', 'yamabuki', 'kraft', 'ai', 'shu'];

// The same crooked angle for the same scroll every time it's drawn: -3.5 to 3.5 degrees.
export function tiltOf(key) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return ((h % 71) - 35) / 10;
}

const sheetId = (key) => `scroll-${key.replace(/[^a-z0-9]/gi, '-')}`;

// One scroll, rolled or open. Its roll is the button; the sheet sits beside it, inert while rolled.
export function scrollHTML(item, open, { pulled = false } = {}) {
  const paper = PAPERS.includes(item.paper) ? item.paper : 'kraft';
  const id = sheetId(item.key) + (pulled ? '-pulled' : '');
  return `<div class="scroll${open ? ' is-open' : ''}${item.ghost ? ' scroll--ghost' : ''}" role="listitem"
    data-flip-id="${esc(item.key)}${pulled ? '-pulled' : ''}" style="--tilt:${tiltOf(item.key)}deg;--w:${Math.round(item.width)}px;--c:var(--${paper})">
    <button class="scroll-roll" type="button" aria-expanded="${open}" aria-controls="${id}" data-scroll="${esc(item.key)}" data-focus="roll-${esc(item.key)}${pulled ? '-pulled' : ''}">
      <span class="scroll-knob scroll-knob--t" aria-hidden="true"></span><span class="scroll-cap scroll-cap--t" aria-hidden="true"></span>
      <span class="scroll-cyl" aria-hidden="true"><span class="scroll-tie"></span></span>
      <span class="scroll-cap scroll-cap--b" aria-hidden="true"></span><span class="scroll-knob scroll-knob--b" aria-hidden="true"></span>
      <span class="scroll-label">${esc(item.name)}</span>
      ${item.seal ? `<span class="scroll-seal" data-len="${String(item.seal).length}" aria-hidden="true">${esc(item.seal)}</span>` : ''}
      <span class="visually-hidden">${open ? ', roll it up' : ', unroll'}</span>
    </button>
    <div class="scroll-sheet" id="${id}" ${open ? '' : 'inert'}><div class="scroll-body">${open ? item.sheet : ''}</div></div>
    <span class="scroll-edge" aria-hidden="true"></span>
  </div>`;
}

// How many rolled scrolls stand on one shelf `width` px wide.
export const perShelf = (width) => Math.max(3, Math.floor((width - 2 * SIDE + GAP) / (ROLL + GAP)));

// Whether a scroll `w` px wide can unroll on a shelf `width` px wide that holds `others` more rolls.
export const fits = (width, w, others) => ROLLED_OPEN + w + EDGE + others * (ROLL + GAP) + GAP + 2 * SIDE <= width;

// Scrolls on as many shelves as they need. `open` is the key of the scroll unrolled here, if it
// fits on its shelf; a scroll that doesn't fit is drawn rolled (it's pulled out instead).
export function shelvesHTML(items, { open = null, width = 800, label = 'Scrolls' } = {}) {
  const n = perShelf(width);
  const rows = [];
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
  return `<div class="shelves">${rows.map((row) => `<div class="shelf-row">
    <div class="shelf" role="list" aria-label="${esc(label)}">${row.map((item) => scrollHTML(item, item.key === open && fits(width, item.width, row.length - 1))).join('')}</div>
    <div class="shelf-plank" aria-hidden="true"></div>
  </div>`).join('')}</div>`;
}

// Whether `open` would have to be pulled out on these shelves.
export function pulledOut(items, open, width) {
  const n = perShelf(width);
  const i = items.findIndex((x) => x.key === open);
  if (i < 0) return false;
  const rowLength = Math.min(n, items.length - Math.floor(i / n) * n);
  return !fits(width, items[i].width, rowLength - 1);
}
