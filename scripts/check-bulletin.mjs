// The noren (D-040): when it hangs, and that its text and link can't carry anything harmful.
import assert from 'node:assert/strict';
import { shouldShow, bulletinHTML } from '../src/ui/bulletin.js';
import { BULLETIN } from '../src/data/bulletin.js';

const b = { show: true, id: 'news-1', until: '2026-11-30', label: 'Notice', panels: ['One', 'Two'], link: { text: 'Go', href: 'app' } };
assert.equal(shouldShow(b, { date: '2026-11-01' }), true, 'hangs when switched on');
assert.equal(shouldShow({ ...b, show: false }, { date: '2026-11-01' }), false, 'show: false takes it down');
assert.equal(shouldShow(b, { date: '2026-11-30' }), true, 'hangs through its last day');
assert.equal(shouldShow(b, { date: '2026-12-01' }), false, 'and not after it');
assert.equal(shouldShow({ ...b, until: null }, { date: '2099-01-01' }), true, 'no end date: hangs until taken down');
assert.equal(shouldShow(b, { date: '2026-11-01', closedId: 'news-1' }), false, 'closed on this device: stays closed');
assert.equal(shouldShow(b, { date: '2026-11-01', closedId: 'news-0' }), true, 'a new message (new id) hangs again');
assert.equal(shouldShow({ ...b, panels: [] }, { date: '2026-11-01' }), false, 'nothing to say, nothing hung');

const html = bulletinHTML({ ...b, panels: ['<img src=x onerror=alert(1)>', 'Fine'], link: { text: '"><script>', href: 'app' } });
assert.doesNotMatch(html, /<img|<script/, 'panel and link text are escaped');
assert.match(bulletinHTML(b), /href="\/app(\.html)?"/, 'a named page becomes its address');
assert.doesNotMatch(bulletinHTML({ ...b, link: { text: 'Win', href: 'https://evil.example.com' } }), /<a /, 'an outside address is never linked');
assert.doesNotMatch(bulletinHTML({ ...b, link: { text: 'x', href: 'javascript:alert(1)' } }), /<a /, 'nor a script');
assert.doesNotMatch(bulletinHTML({ ...b, link: { text: 'x', href: 'constructor' } }), /<a /, 'nor a name that only exists on every object');
assert.equal((bulletinHTML({ ...b, panels: ['1', '2', '3', '4', '5', '6'] }).match(/noren-panel/g) || []).length, 4, 'at most four strips');

// The message that's live: short phrases, a valid id.
assert.ok(BULLETIN.panels.every((p) => typeof p === 'string' && p.length <= 32), 'each strip is a short phrase');
assert.match(BULLETIN.id, /^[a-z0-9-]{1,40}$/, 'the id is a simple name');
console.log('bulletin: all checks pass');
