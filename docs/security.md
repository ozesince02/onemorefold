# Security

Reliability and security come before features (decision D-011). This page is the threat model,
the rules every change follows, and the record of what has been checked.

## What we protect

- **People's habit data:** what they do every day, when, and how consistently. Personal, sometimes
  sensitive ("therapy", "medication"). Today it lives in one browser; after accounts (D-008) it lives
  in Supabase too.
- **Their accounts and sessions**, once sign-in exists.
- **The integrity of the app:** nobody else's code should ever run on a One More Fold page.

## Where attacks could come from

| Source | Today | After accounts |
| --- | --- | --- |
| A backup file someone is sent and loads | Yes | Yes |
| A crafted link (`?remind=…`, `#/…`) | Yes | Yes |
| Another script on the same origin editing localStorage | Unlikely (no third-party scripts) | Same |
| Compromised npm packages | Build tools and the two runtime libraries (three, gsap) | Plus the Supabase client |
| Another user's data shown to you | No | Yes, with opt-in buddies |
| Stolen session tokens | No sessions | Yes |
| Over-broad database access | No database | Yes: row-level security is the guard |

## Rules for every change

1. **Validate on the way in.** Anything from outside the code (backup files, stored data, URL
   parameters, service-worker messages, later the network) goes through
   [src/lib/sanitize.js](../src/lib/sanitize.js): known keys only, strict formats (ids
   `^[a-z0-9][a-z0-9-]{0,63}$`, colours `#RRGGBB`, times `HH:MM`, real days of the month), size limits.
   Unknown keys are dropped; bad values fall back to safe defaults.
2. **Escape on the way out.** Free text (habit names, the wish) goes through `esc()` before it
   enters any HTML string. Prefer `textContent` for single values. Never put unescaped data in
   `innerHTML`, an attribute or a `style`.
3. **No inline scripts, no `eval`, no new third-party scripts.** The Content-Security-Policy in
   [public/_headers](../public/_headers) forbids them. A new external origin (fonts, Supabase) is
   added to the policy deliberately, with a note here.
4. **Secrets never in git, and no env file in git at all** (D-035). Build settings are variables
   in Cloudflare and GitHub; `.env.example` lists their names. The Supabase *publishable* key is
   public by design; the *service-role* key never reaches the browser or the repository.
5. **Least privilege in the database.** Every table has row-level security on, with
   `user_id = auth.uid()` policies. Buddy access is read-only and exposes only what was shared.
6. **Dependencies:** `npm audit` must report 0 before merging to `main`. Upgrade promptly; prefer
   fewer dependencies. Prefer releases at least two weeks old (a fresh release is the usual way a
   hijacked package spreads); a security patch from the same maintainers may be taken sooner, noted
   in the audit log.
7. **Fail safe, keep data.** If data can't be read, keep it aside (`eightfold:v1:unreadable:<time>`)
   and start clean; never silently delete what someone saved.
8. **Review:** run `npm run check` (includes the security checks) on every branch, and the
   security-review skill on branches that touch data, storage, rendering, auth or headers.

## Security headers (production)

Set by Cloudflare Pages from [public/_headers](../public/_headers). Test locally with
`npm run build && node scripts/serve-dist.mjs` (serves `dist/` on http://localhost:4173 with these headers).

| Header | Value (short) | Why |
| --- | --- | --- |
| Content-Security-Policy | `default-src 'self'; script-src 'self'; …` | Blocks injected and third-party scripts, plugins, framing and form hijacking |
| — `style-src` | `'self' 'unsafe-inline'` | Inline `style` attributes carry habit colours; styles can't run code |
| — `font-src` | `'self'` | Self-hosted fonts (D-027); `check-security.mjs` keeps Google Fonts out |
| — `img-src` | `'self' data: blob:` | The paper-grain texture is a data: SVG |
| — `connect-src` | `'self'` | Add the Supabase project URL when accounts arrive |
| X-Content-Type-Options | `nosniff` | No MIME sniffing |
| X-Frame-Options / `frame-ancestors` | `DENY` / `'none'` | No clickjacking |
| Referrer-Policy | `strict-origin-when-cross-origin` | Don't leak paths to other sites |
| Permissions-Policy | camera, microphone, geolocation, payment, usb off | The app needs none of them |
| Strict-Transport-Security | one year, subdomains | HTTPS only |
| Cross-Origin-Opener-Policy | `same-origin` | Isolates the window from pages it opens |

## Audit log

### 24 October 2026 — first audit (branch `hotfix/security-hardening`)

| # | Severity | Finding | Fix | Test |
| --- | --- | --- | --- | --- |
| 1 | High | The landing page put habit names into HTML unescaped. A crafted backup (or later a buddy's data) could run script. | All names and times escaped with `esc()` | Browser test: hostile names render as text, no script runs |
| 2 | High | "Load a backup" accepted any JSON; ids, colours and times went into HTML attributes unchecked, so a file could break out of an attribute. | `parseBackup()` / `cleanState()` validate every field; stored data is validated on load too; every store write validates its input | `scripts/check-security.mjs` (25 cases) |
| 3 | Medium | No Content-Security-Policy or security headers for hosting | `public/_headers`; the one inline script moved to `public/boot.js` | Production build served with the headers: no violations, fonts and the 3D crane load |
| 4 | Medium | A crafted link `app.html?remind=done&h=…&d=…` could tick a habit with no reminder having fired | URL actions only apply if that reminder fired; service-worker messages must come from our own worker | Browser test: crafted link ignored and stripped |
| 5 | High (dev only) | `npm audit`: esbuild (Vite dev server) and sharp (image script) vulnerabilities | Vite 8, sharp 0.35; dev server bound to `localhost` | `npm audit`: 0 vulnerabilities |
| 6 | Low | Corrupted or tampered stored data was either trusted or dropped | Validated on load; unreadable data kept aside, not deleted | Unit test via `cleanState` |

Independent review of the branch with the security-review skill: no HIGH or MEDIUM findings. One LOW
suggestion applied: the local preview server (`scripts/serve-dist.mjs`) now refuses sibling folders
like `dist-x/` and malformed URL encoding.

Not issues, checked: notification text uses plain text APIs; `confirm()` and toasts use text;
CSS selectors built from data use `CSS.escape`; the service worker builds same-origin URLs with
`URLSearchParams`; no secrets in the repository.

### 24 October 2026 — habit schedules (branch `feature/habit-schedules`)

New input: `cadence`, `weekdays`, `timesPerWeek` on each month's habit. All paths (backup import,
stored data, add and edit) go through `cleanSchedule()`: cadence from a fixed list, weekdays and
times a week as integers 1–7. New HTML only shows fixed words, bounded integers or escaped names.
Security-review skill: no HIGH or MEDIUM findings.

### 24 October 2026 — CI

GitHub Actions runs the checks, build and `npm audit` on every PR and push to `main`, so a
vulnerable dependency or a failing security check blocks a merge. Supply-chain care: `permissions:
contents: read`, `persist-credentials: false`, actions pinned to full commit SHAs, `npm ci` from the
lockfile.

### 24 October 2026 — undici advisories (branch `chore/patch-undici`)

`npm audit` started failing CI on every branch: undici 7.29.1, pulled in by `wrangler` →
`miniflare`, has three new advisories (GHSA-4qv8-2p9j-2685 high, a denial of service in the
EventSource parser; GHSA-f72v-6w45-q472 and GHSA-xjj6-f33q-929c moderate). Development and
deploy tooling only: undici never reaches the site's visitors. Fix: an `overrides` entry pins
undici 7.30.1, the patched release from the same maintainers (9 days old, taken early under rule 6
because it is a security patch). Remove the override once a Wrangler release ships a patched
undici. Test: `npm audit` 0, `npm run check`, build, `wrangler deploy --dry-run`.
**26 October:** Wrangler 4.153.0 (released 26 Oct) depends on undici 7.30.1. On or after
9 November (two weeks, rule 6), upgrade Wrangler to it and remove the override on a `chore/` branch.

### 24 October 2026 — years (branch `feature/years`)

New input: a top-level `years` map (`{ "2026": { wish, foldedAt } }`) in stored data and backups.
`cleanState()` keeps only four-digit years with object records, caps the wish at 200 characters and
the map at 100 years, and drops bad timestamps; an old single `wish` is moved, not trusted as is.
Wishes and habit names on the new fold page and year slip go through `esc()`; the fold form sends
only habit ids, which `foldYear()` checks with `isId()`. Route arguments are clamped to real months
and years before use. Tests: `scripts/check-years.mjs` (including hostile year records) and a
browser check that a wish containing HTML shows as text.

### 24 October 2026 — accounts database (branch `feature/accounts-schema`)

New surface: Supabase's Data API, callable by anyone with the public key and, once signed in, their
own session. Defences in the migration: RLS on all six tables with `user_id = auth.uid()` policies,
no grants for `anon`, no delete on profiles, the app's validation repeated as constraints, size
limits per person as triggers, `security definer` only on the sign-up trigger (fixed
`search_path`, inserts only the new user's id), helper functions in a non-exposed `private` schema.
Test: `scripts/check-schema.mjs` on real Postgres; a deliberately removed RLS line makes it fail.
Open: sign-up policy (D-018).

### 24 October 2026 — sign-in (branch `feature/accounts-signin`)

New surface: the Supabase Auth session (stored by supabase-js in this origin's localStorage) and
two new origins in `connect-src` (the project's https and wss addresses only). Measures: PKCE flow;
redirects only to this page (and Supabase accepts only the listed redirect URLs); failed-sign-in
descriptions from the URL are never shown; email checked for shape and length before sending;
the signed-in email is escaped; the client loads from our own origin (bundled, no CDN). The strict
CSP (no inline or third-party scripts) is what keeps the session token out of reach of injected
script, so it stays non-negotiable. `.env` was committed with public values only, guarded by
`check-security.mjs` (no longer: D-035); the build refuses a non-publishable key.

### 24 October 2026 — sync (branch `feature/accounts-sync`)

Data from the account is validated with `cleanState()` before use, like a backup file. Realtime
uses a private channel per person with RLS on `realtime.messages` (topic must be `user:<own id>`);
the broadcast carries no data. Realtime "Postgres changes" was ruled out because delete events
skip RLS. Deletes and upserts are scoped to the signed-in user both by the request and by RLS.
The queue is keyed to the user id, so one person's pending changes are never sent as another's;
a flush stops if the session changes mid-way, and rows always carry the signed-in id (set last, so
a tampered queue can't override it). On a shared browser, a different person signing in never
receives the previous person's folds (kept aside instead; test scenario 11). Found by our own
review of the branch; the security-review pass then found nothing at confidence 8 or above.
New visitors no longer see the owner's habits in the tracker (D-016).
Test: `scripts/check-sync.mjs` (includes a second person who never sees the owner's rows) and
the channel policies in `check-schema.mjs`.

### 25 October 2026 — privacy review

Who can see a person's habits, checked end to end. Other accounts and signed-out visitors: no
(grants plus RLS on every table, tested in `check-schema.mjs`). What was still open:

| # | Severity | Finding | Fix | Test |
| --- | --- | --- | --- | --- |
| 1 | Medium | On a shared computer, signing out left the folds in the browser, and a later account's sign-in parked the earlier person's copy there too. The next person at that computer could read them. | "Sign out and remove my folds from this browser" in the account chit removes every One More Fold key (tracker, sync queue, copies kept aside, old name); asks first if changes haven't reached the account. Sync `stop()` is now safe to call twice and writes nothing to a cleared browser. (branch `fix/sign-out-clears-browser`) | `check-sync.mjs` scenarios 10b, 12b and 13. Review follow-up: a sync read still in flight when the person signs out is now thrown away instead of written back into the cleared browser. |
| 2 | Medium | No way for a person to delete their account and data; only the owner could, from the dashboard. | "Delete my account" in the account chit calls `public.delete_my_account()`: SECURITY DEFINER, empty search_path, deletes only `auth.uid()`'s auth user (everything cascades); not callable by anon. The browser then stops syncing, forgets its copy and reloads signed out. (branch `feature/delete-account`, D-025) | `check-schema.mjs`: anon can't call it, B deleting removes only B, A's rows all go, an old token can't write afterwards |
| 3 | Low | Google Fonts sees every visitor's IP address on every page load. | Fonts served from our own site (Fontsource, woff2 only); CSP `font-src 'self'`, Google origins removed from `style-src`. (branch `chore/self-host-fonts`, D-027) | `check-security.mjs` (fonts); production build: no font requests leave the site, no CSP violations |
| 4 | Info | The owner (dashboard, secret key) can read everyone's rows; RLS protects users from each other, not from the operator. | Stated in the privacy policy; two-factor sign-in on every admin account. End-to-end encryption is a possible later "private mode" (docs/vision.md). | — |

### 28 October 2026 — themes (branch `feature/light-warm-dark`)

New input: `eightfold:v1:theme` in localStorage. Both readers (public/theme.js before paint,
src/lib/theme.js after) accept only `light`, `warm`, `dark` (anything else means auto), and the
value only ever becomes a `data-theme` attribute, never HTML. theme.js is a same-origin file, so
the CSP still forbids inline scripts; no new origins. "Remove my folds from this browser" clears
the key with the rest of `eightfold:v1:*`. The 404 page now uses the shared tokens; its small
inline `<style>` was already allowed (`style-src 'unsafe-inline'`). Test: check-themes.mjs.

### 28 October 2026 — reminders with the app closed (branch `feature/closed-app-reminders`)

New inputs: a device's push address and keys, reminder settings and a time zone, all written by
signed-in people; and the sender, which runs with the service role and posts to those addresses.
- **The sender can't be aimed elsewhere:** `push_subscriptions.endpoint` must be an https address at
  Google's, Mozilla's, Apple's or Microsoft's push service; the sender never follows redirects.
- **Devices only through `register_push()`** (SECURITY DEFINER, signed-in only): it may take over an
  address from another account, because the address is an unguessable secret of that browser; ten
  devices a person at most. People can read and delete only their own rows; `push_log` has no
  policies and no grants.
- **Every column checked by the database:** key and secret lengths, time zone names, and the list of
  habits switched off (ids only; a test caught that one element could hide a comma, so the list
  must also split back into exactly as many ids).
- **The sender** is called only with the cron secret (compared by hash, so timing says nothing),
  deployed without JWT checks for that reason. It logs counts only, never names or addresses, sends
  at most 30 notifications a person a day, and claims each reminder in the log before sending.
- **Messages** are encrypted per device (RFC 8291) and signed (VAPID); the service worker still
  checks every field before showing it.
- **Leaving:** signing out, removing folds from a browser and deleting the account take the device's
  address off before the session ends, so a shared computer stops getting someone's reminders.
- **Secrets:** made on the owner's computer by `npm run vapid` into git-ignored files, never printed.
  `.env` may hold only the VAPID *public* key, and `check-security.mjs` and the build refuse
  anything shaped like the private one.
- **Review (28 Oct), fixed before merging:** the API returns at most 1,000 rows per request, even
  to the service role, and drops the rest silently; with a few people's ticks that would have meant
  reminders for habits already done. The sender now reads every list page by page, a hundred people
  at a time. Also: each push gives up after 10 seconds, one person's odd data skips only them, and
  deleting an account takes the device off only after the delete succeeds.
- Tests: `check-push.mjs` (RFC 8291 byte for byte, a browser-side decrypt, VAPID signature, the
  planner across time zones, daily cap, copies in sync), `check-schema.mjs` (RLS, register_push,
  every refused value, cascade on account deletion), `check-reminders.mjs` (the half-hour windows).
### 29 October 2026 — `.env` out of git (branch `chore/untrack-env`)

The owner flagged that `.env` was tracked. It held only the Supabase URL and publishable key, both
public, and a search of every env file's history for secret-shaped values found none. It's now
untracked and ignored; `.env.example` lists the names, and the hosted builds read Cloudflare and
GitHub variables (D-035). `check-security.mjs` now fails if any env or push-secret file is
tracked. The ignore rule for `*.local.sql` (the cron SQL with its secret) is added here too, so it
holds on every branch.

### 30 October 2026 — follow-ups (owner, in the dashboards)

- **Sign-in email rate limits** in Supabase (Authentication → Rate Limits) checked and set low by
  the owner. Not visible from outside; recorded on the owner's word.
- **Dependabot alerts and security updates** are on (confirmed through the GitHub API). Its
  security pull requests open against `main`, the default branch, which only takes pull requests
  from `preview`: retarget each one to `preview` (`gh pr edit <n> --base preview`) and it follows
  the normal road.
- **Closed-app reminders verified end to end** by the owner on the live site: the half-hourly
  `send-reminders` runs log as expected, and a reminder arrived with Eightfold closed (D-028).

### 1 November 2026 — Done and Later on closed-app reminders (branch `feature/reminder-actions`)

New input: a one-time token posted by the service worker to `act-reminder`, a function that runs
without JWT checks.
- **The token is the permission, and a small one:**
  - 32 random bytes; only its SHA-256 is stored, in `push_actions`, which has no policies and no
    grants;
  - single use: `act_on_reminder()` marks it used in the same statement that finds it;
  - expires after 36 hours (a database check caps it at two days);
  - can only tick or snooze the one habit and day it was made for.
- **`act_on_reminder()` is SECURITY DEFINER** with an empty `search_path`, callable only by the
  service role. It refuses unknown actions before touching the token, and a Done for a habit
  deleted since does nothing.
- **`act-reminder`:**
  - accepts only a well-formed token and `done` or `later`, in a body of at most 512 bytes;
  - answers CORS only for our own origins;
  - logs the action and result, never the token or anything about the person.
- **Later can't loop:** at most three sends of a reminder, and re-sends count towards the daily cap
  of 30.
- **Review (1 Nov), fixed before merging:**
  - `act-reminder` now reads at most 512 bytes of a body instead of reading it all before checking.
  - A token that can't be saved no longer stops the sender's run: that reminder goes out without
    buttons and the rest carry on.
  - The service worker checks the token and address again when a button is pressed.
  - Later on the third send says it was the last, instead of silently doing nothing.
- **The service worker** shows the buttons only with a well-formed token and an address that is a
  Supabase function called `act-reminder`; the CSP's `connect-src` allows only our project anyway.
- **Tests:**
  - `check-schema.mjs`: single use, expiry, unknown tokens, a deleted habit, refused actions, the
    three-send cap, no access for people or visitors.
  - `check-push.mjs`: re-sends, the cap, tokens, and the service worker in a sandbox (buttons only
    for good payloads, what's posted, tab updates, failures).

### 3 November 2026 — daily summary and weekly recap (branch `feature/summaries`)

New input: two switches and a time in `push_settings`, written by signed-in people under the
existing "own rows only" policy. The database refuses times off the half hour, and the browser
sends only known fields and offered times. Summaries are built from the person's own rows only (a
test checks someone else's habits never count), sent through the same encrypted Web Push, logged
once a day each (`push_log` kinds widened to `daily` and `weekly`), and their text is fixed wording
around numbers and the person's own habit names.
- **Review (3 Nov), fixed before merging:**
  - A summary no longer shares a notification tag with a habit (a habit named "Summary" could have
    been replaced on screen); summaries carry a kind and get `~daily` and `~weekly` tags.
  - Each batch's reminders and summaries fail on their own, so a database error at 21:30 can't cost
    everyone their summary.
  - Summaries go out ten at a time.
  - Turning off the last device clears the summary switches too.

### 4 November 2026 — closed-app reminders on by default (branch `feature/reminders-by-default`)

Reminders now switch on without a prompt where the browser already allows our notifications
(D-043). Our review found that permission belongs to the browser, not the account. On a shared
computer the next person to sign in would have been signed up silently, with their habit names
arriving on that machine. Someone who had switched in-tab reminders off, or removed their folds,
could also have had them come back. Fixed before merging:
- it happens only for the first account it happened for in that browser;
- only while in-tab reminders are still on;
- "turned off" is remembered per account.

The invitation slip waits its 3 days if the browser's prompt is dismissed. The noren's closed list
is gone (closing lasts one visit), and the old key is cleared.

### 11 November 2026 — buddies (branch `feature/flock-buddies`)

The first feature where one person's data reaches another (D-029, D-044, D-045). The rule held to:
nobody reads another person's rows. Everything about a buddy comes from `my_buddies()`, a
SECURITY DEFINER function that acts only for `auth.uid()`, checks the pair exists both ways, and
returns only what that buddy's level allows. It never returns a private habit.
- **New input:**
  - tags: shape-checked twice, with invisible and direction-changing characters refused;
  - sharing levels and habit lists: only the caller's own direction, only those two columns;
  - figures: own row only, every field bounded, each shared habit exactly
    `{slug, name, done, due}`;
  - invite hashes: hex SHA-256 only, made only through `create_invite()`.
- **Invites:** the secret never reaches a server or log (it's after `#`, and only its hash is
  stored). Guessing a 256-bit secret isn't practical. A card works once, lasts 7 days, and can be
  taken back. A forwarded card works for whoever opens it first: the link is the key, as with any
  invite link. The person accepting sees the sender's tag before agreeing.
- **Shown in the page:** tags and habit names come from other people, so every one goes through
  `esc()`. The functions' answers are reshaped and checked before use (ids, levels, numbers).
- **Tests:** `check-schema.mjs` covers strangers, removed buddies, half pairs, each level, private
  habits, visitors, one-time cards, expiry, the limits and account deletion. `check-buddies.mjs`
  covers tags, the figures and private habits through sync.

### 12 November 2026 — gangs (branch `feature/flock-gangs`)

Gang members see each other's ticks on one habit (D-046). As with buddies, nobody reads another
person's rows directly:
- **Reading:** `my_gangs()` returns only gangs the caller is in, and only ticks from each member's
  linked, non-private habit between the gang's dates.
- **Tables:** `challenges` and `challenge_members` have row-level security on, with no policies and
  no grants, so they're reached only through the functions.
- **Owner-only actions:** renaming, extending and removing members are checked against the caller.
- **Linking:** a habit can link only to a gang its owner is in, once. Anything else is unlinked by
  a trigger, so a device that hasn't heard you left can still sync the rest of your tracker.
- **Leaving:** leaving, being removed or deleting your account unlinks your habit, passes the gang
  on and removes an empty gang.
- **Cards:** the database now hashes the card secret itself, so the stored hash is no longer usable
  in place of the secret (from the 11 Nov review).
- **Shown in the page:** gang names and tags go through `esc()`.
- **Tests:** `check-schema.mjs` covers strangers, links to other gangs, private habits, owner-only
  actions, handover, ended and full gangs, the limits and account deletion. `check-gangs.mjs`
  covers the maths and the link through sync.
- **Review (12 Nov), fixed before merging:** a member removed by the owner could have come back
  with a second account, using gang cards they made before being removed: a card was checked
  against its sender's membership only when it was made. Now leaving or being removed takes back
  your cards for that gang, and a card from someone no longer in it is gone. A test covers it.

### Accepted risks (owner's decision, 24 Oct 2026, D-016)

- The repository is public and holds the owner's January–October 2026 habit log (names, times,
  ticks) in `src/data/story.js`, which the landing page tells its story with. The owner shares it
  on purpose. Since 29 Oct (D-036) it's excluded from the MIT licence by name, and nothing else
  uses it: the tracker never loads it, and the checks use an invented year. Revisit before any
  sensitive habit is added.
- ~~Until accounts ship, onemorefold.com shows that data to any visitor with nothing saved.~~ No
  longer: new trackers start empty (D-020); only the landing page shows it.

### Earlier to-do list, closed 29 October 2026

Done, and checked on 29 October where it can be checked from outside. Anything left from the old
list moved to the owner's private list (see below):

- Row-level security on every table, the publishable key as a build setting, Supabase in
  `connect-src`, and sign-in redirect URLs limited to our own addresses (D-018, D-019, D-035).
- The live site's headers: HSTS, the CSP above, `X-Frame-Options: DENY`, `nosniff`, the referrer and
  permissions policies, all served on onemorefold.com. Plain `http://` redirects to `https://` (301).
- The fonts are self-hosted (D-027).

**Open weaknesses aren't listed here.** A public list of what isn't fixed yet is a map for
attackers. Fixed problems go in the audit log above, in the open; open ones are kept in the owner's
private docs (`private/`, ignored by git, D-037) until they're fixed.
