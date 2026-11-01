// Renders the link preview card (scripts/og-card.html) to public/og.png at 1200×630 with a local
// headless Edge or Chrome (D-040). Run with the dev server up (npm run dev), then: npm run og
// The card uses the site's fonts through the dev server, so it looks like the site.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const browsers = [
  process.env.OG_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browser = browsers.find((b) => existsSync(b));
if (!browser) throw new Error('No Edge or Chrome found; set OG_BROWSER to one.');

const out = join(import.meta.dirname, '..', 'public', 'og.png');
const url = process.env.OG_URL || 'http://localhost:5173/scripts/og-card.html';
// Its own throwaway profile, so an already-open browser window can't take the job over.
const profile = mkdtempSync(join(tmpdir(), 'og-'));
const run = spawnSync(browser, [
  `--user-data-dir=${profile}`, '--no-first-run', '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1200,630', '--virtual-time-budget=4000', `--screenshot=${out}`, url,
], { stdio: 'inherit' });
rmSync(profile, { recursive: true, force: true });
if (run.status !== 0 || !existsSync(out)) throw new Error('The browser did not write the card.');
console.log(`wrote ${out}`);
