// Feeds hostile and broken data to the validator that guards backups and stored data.
import assert from 'node:assert/strict';
import { cleanState, parseBackup, esc, LIMITS } from '../src/lib/sanitize.js';
import { SAMPLE_MONTHS, SAMPLE_COLORS } from '../src/data/sample.js';

const exampleState = () => ({
  version: 1,
  colors: { ...SAMPLE_COLORS },
  months: Object.fromEntries(Object.entries(SAMPLE_MONTHS).map(([k, hs]) => [k, {
    habits: hs.map(({ id, name, goal, time, start }) => ({ id, name, goal, time: time || '', start: start || 1 })),
    checks: Object.fromEntries(hs.map((h) => [h.id, [...h.days]])),
  }])),
  years: {},
});

// A real-looking year passes through unchanged.
const seed = exampleState();
assert.deepEqual(cleanState(seed), seed, 'the example year survives validation untouched');

// Hostile values are neutralised.
const evil = cleanState({
  version: 1,
  wish: '<img src=x onerror=alert(1)>'.repeat(50),
  colors: { german: 'red;"><script>alert(1)</script>', 'bad id"': '#000000', dsa: '#E9B33F' },
  months: {
    '2026-10': {
      habits: [
        { id: 'x" onmouseover="alert(1)', name: 'attribute breakout', goal: 5 },
        { id: 'german', name: '<script>alert(1)</script>German', goal: 9999, time: '07:00"><b>', start: -4 },
        { id: 'german', name: 'duplicate id', goal: 1 },
        { id: 'dsa', name: '   ', goal: 20 },
        { id: 'core', name: 'Core\u0000\u001b', goal: '20', time: '07:30', start: 40 },
      ],
      checks: { german: [1, 2, 2, 0, 32, 'x', 5.5, -1, 31], core: 'not an array', ghost: [1, 2, 3] },
    },
    'not-a-month': { habits: [{ id: 'a', name: 'a' }] },
    '2026-13': { habits: [] },
    __proto__: { polluted: true },
  },
  prefs: { percentView: 'javascript:alert(1)' },
  reminders: { enabled: 'yes', lead: 999, off: { dsa: true, 'x y': true }, log: { 'nope': {}, '2026-10-23:german': { firedAt: 'soon', snoozeUntil: 5 } } },
  extra: 'dropped',
});
const oct = evil.months['2026-10'];
assert.deepEqual(Object.keys(evil.months), ['2026-10'], 'bad month keys are dropped');
assert.deepEqual(oct.habits.map((h) => h.id), ['german', 'core'], 'bad, duplicate and nameless habits are dropped');
const german = oct.habits[0];
assert.equal(german.name, '<script>alert(1)</script>German', 'free text is kept as text (escaped when shown)');
assert.equal(esc(german.name).includes('<script>'), false, 'esc() makes it inert');
assert.equal(german.goal, 20, 'impossible goal falls back to 20');
assert.equal(german.time, '', 'malformed time is dropped');
assert.equal(german.start, 1, 'negative start becomes 1');
assert.equal(oct.habits[1].name, 'Core', 'control characters are stripped');
assert.equal(oct.habits[1].start, 1, 'start past the month end falls back to 1');
assert.deepEqual(oct.checks.german, [1, 2, 31], 'only real days of the month survive, once each');
assert.deepEqual(oct.checks.core, [], 'non-array ticks become empty');
assert.equal('ghost' in oct.checks, false, 'ticks for unknown habits are dropped');
assert.deepEqual(evil.colors, { dsa: '#E9B33F' }, 'only #RRGGBB colours on valid ids survive');
assert.equal(evil.years[2026].wish.length, LIMITS.wish, 'wish is capped');
assert.equal(evil.prefs.percentView, 'days', 'unknown view falls back to days');
assert.deepEqual(evil.reminders, { enabled: false, lead: 0, off: { dsa: true }, log: { '2026-10-23:german': { firedAt: undefined, snoozeUntil: 5 } } });
assert.equal('extra' in evil, false, 'unknown keys are dropped');
const meta = cleanState({ version: 1, months: {}, meta: { firstUsedAt: 1700000000000, lastBackupAt: '<b>', backupSnoozedUntil: -5, other: 1 } }).meta;
assert.deepEqual(meta, { firstUsedAt: 1700000000000, lastBackupAt: undefined, backupSnoozedUntil: undefined }, 'backup times must be real timestamps');
assert.equal({}.polluted, undefined, 'no prototype pollution');

// Broken files are refused with a readable reason, and nothing half-loads.
assert.throws(() => parseBackup('not json'), /not valid JSON/);
assert.throws(() => parseBackup('[]'), /not a One More Fold backup/);
assert.throws(() => parseBackup('{"version":2,"months":{}}'), /version/);
assert.throws(() => parseBackup('{"version":1}'), /no months/);
assert.throws(() => parseBackup(' '.repeat(LIMITS.backupBytes + 1)), /too large/);
assert.ok(parseBackup(JSON.stringify(seed)).months['2026-10'], 'a real backup round-trips');

console.log('security: all checks pass');

// Build settings (D-035): .env is never in git; .env.example lists the names. Both files, when
// present, may hold only the public settings, and nothing shaped like a secret.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const ALLOWED_ENV = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_VAPID_PUBLIC_KEY']);
const SECRET_SHAPES = /sb_secret_|service_role|eyJhbGci|-----BEGIN|re_[A-Za-z0-9]{20,}|GOCSPX-|VAPID_PRIVATE|CRON_SECRET/;
for (const file of ['.env.example', '.env']) {
  const url = new URL(`../${file}`, import.meta.url);
  if (file === '.env' && !existsSync(url)) continue;
  const lines = readFileSync(url, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  for (const line of lines) {
    const [name, ...rest] = line.split('=');
    const value = rest.join('=').trim();
    assert.ok(ALLOWED_ENV.has(name.trim()), `${file} may only hold public settings; found ${name.trim()}`);
    assert.doesNotMatch(value, SECRET_SHAPES, `${file} value for ${name.trim()} looks like a secret`);
    // A VAPID public key is a 65-byte point (87 characters). The private half is 43: never here.
    if (name.trim() === 'VITE_VAPID_PUBLIC_KEY' && value) assert.match(value, /^B[A-Za-z0-9_-]{86}$/, `${file}: VITE_VAPID_PUBLIC_KEY must be the public key (87 characters, starting with B)`);
  }
}
// .env, the push secrets and the owner's private docs (D-037) must never be tracked (CI checks out a
// clean copy, so this holds there too).
const tracked = execFileSync('git', ['ls-files', '--', '.env', '.env.local', '.env.production', 'supabase/.env.functions', 'supabase/schedule.local.sql', 'private'], { encoding: 'utf8' }).trim();
assert.equal(tracked, '', `env files, secrets and private docs must not be in git: ${tracked}`);
console.log('env: only public settings, and no env file or private doc in git');

// No third-party origins for styles or fonts (D-027): every page uses the self-hosted fonts, and
// the CSP allows fonts only from this site. Nothing on a page may reach Google Fonts again.
const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
assert.match(headers, /font-src 'self';/, "the CSP allows fonts only from 'self'");
assert.match(headers, /style-src 'self' 'unsafe-inline';/, 'the CSP allows styles only from this site');
for (const page of ['index.html', 'app.html', 'privacy.html', 'terms.html', 'patch-notes.html', '404.html']) {
  const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/, `${page} doesn't load Google Fonts`);
  assert.match(html, /\/src\/styles\/fonts\.css/, `${page} uses the self-hosted fonts`);
  // Link previews (D-040): every public page names the card, on our own domain only.
  if (page !== '404.html') {
    assert.match(html, /<meta property="og:image" content="https:\/\/onemorefold\.com\/og\.png">/, `${page} has the link preview card`);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/, `${page} asks X for the large card`);
  }
}
console.log('fonts: self-hosted only');
