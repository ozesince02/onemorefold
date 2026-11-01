# One More Fold

**Fall seven times, rise eight.** A paper-craft habit tracker for people who have started over
more times than they can count. Tick a habit and it becomes a fold; tick a day's habits and a paper
crane folds itself; a thousand cranes make a wish.

**Live:** [onemorefold.com](https://onemorefold.com) · tracker at
[onemorefold.com/app](https://onemorefold.com/app) · what's new:
[patch notes](https://onemorefold.com/patch-notes)

One More Fold began as *oze's Habit Tracker v2*, a Google Sheet held together with COUNTIFs, and was
folded into something lighter. It's made by one person, [oze](https://github.com/ozesince02),
with Claude Code as a pair programmer.

## What it does

- **A month on paper:** a grid of ticks, today's list in time order, goals, streaks, daily and
  weekly scores, and the year as paper mountains. Every percentage says what it counts.
- **Habits on your schedule:** every day, chosen weekdays, a few times a week, weekly or monthly.
  A rest day is rest, never a miss.
- **A crane a day, a wish a year:** a 3D origami crane folds as you tick, and a thousand of them
  grant the wish you wrote. In December and January you can fold the year and set the next wish.
- **Reminders:** at each habit's time while a tab is open, and, if you sign in and turn them on,
  even with One More Fold closed (Web Push, encrypted for your device).
- **Your data, your call:** works fully without an account, with everything kept in your browser.
  Sign in (Google or an email link) only if you want it on several devices. Backups, "remove my
  folds from this browser", and delete-my-account are all one tap.
- **Three papers:** Light, Warm (sepia) and Dark.

No ads, no analytics, no trackers. See the [Privacy page](https://onemorefold.com/privacy).

## How it's built

| Part | What |
| --- | --- |
| Front end | Plain ES modules, no framework. [Vite](https://vite.dev) builds a multi-page static site. [Three.js](https://threejs.org) for the crane, [GSAP](https://gsap.com) for motion. Self-hosted fonts. |
| Data | Local first: one object in `localStorage` (`eightfold:v1`). When signed in, a sync engine mirrors it to Supabase. |
| Backend | [Supabase](https://supabase.com) (Postgres in Mumbai): Auth, row-level security on every table, Realtime for sync, and one Edge Function that sends closed-app reminders every 30 minutes. |
| Hosting | A Cloudflare Worker serving the built files, with strict security headers and a Content-Security-Policy that allows no third-party scripts. |
| Checks | Node scripts with `node:assert` (no test framework), including the real database schema run on [PGlite](https://pglite.dev) and Web Push checked against RFC 8291. |

## Getting started

You need **Node 24** and npm.

```bash
git clone https://github.com/ozesince02/onemorefold.git
cd onemorefold
npm ci
npm run dev
```

The landing page is at http://localhost:5173 and the tracker at http://localhost:5173/app.html.

**Without any settings,** the dev server works fully on your device, with no accounts or sync.
That's enough for most work.

**To try accounts and sync,** make your own free Supabase project:
1. Run the SQL files in [supabase/migrations](supabase/migrations) in order, in its SQL Editor.
2. Copy `.env.example` to `.env` and fill in your project's URL and publishable key. `.env` is
   ignored by git, and it only ever holds public values.

`npm run build` needs these settings and stops on purpose when they're missing.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run check` | Every check: stats, reminders, seed data, security, themes, backups, schedules, years, the database schema and its row-level security, sync, Web Push |
| `npm run build` | The production site in `dist/` |
| `npm run serve:dist` | Serves `dist/` with the real security headers, on http://localhost:4173 |
| `npm audit` | Must report 0 vulnerabilities |
| `npm run shared` | Copies the shared reminder logic into the Edge Function, after changing it in `src/lib` |
| `npm run vapid` | One-time key setup for closed-app reminders (owner only; [docs/push-setup.md](docs/push-setup.md)) |

## What's where

| Path | What it is |
| --- | --- |
| `index.html`, `src/landing.js` | The landing page: the crane you fold by ticking six habits, the story, the feature zine |
| `app.html`, `src/app.js` | The tracker: Month, Year and Habits views |
| `privacy.html`, `terms.html`, `patch-notes.html`, `404.html` | The other pages |
| `src/lib/` | The logic, all plain functions: `store.js` (data), `stats.js` (every number), `schedule.js`, `reminders-core.js`, `sanitize.js` (validation and `esc()`), `sync/` (sync engine), `auth.js`, `push.js` |
| `src/ui/` | Paper pieces: torn edges, charts, the account menu, the crane story scroll, crane notes, reminders |
| `src/three/` | The Three.js crane that folds from a flat square |
| `src/data/bulletin.js` | The noren: the notice under the landing header. Edit it to change or take down the message |
| `src/data/` | oze's own log for the landing page's story (`story.js`), an invented year for the checks (`sample.js`), the demo habits, the patch notes and the crane notes' text |
| `src/styles/` | CSS, with every colour a role token in `tokens.css` |
| `public/` | Static files: the service worker, icons, `_headers` (security headers and CSP) |
| `supabase/migrations/` | The database, as SQL, run by hand in order |
| `supabase/functions/` | The `send-reminders` Edge Function and its shared code |
| `scripts/` | Checks, build helpers and setup scripts |
| `docs/` | Design, decisions, security, plans |

## Documentation

| Read | For |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute, and the rules every change follows |
| [SECURITY.md](SECURITY.md) | How to report a security problem |
| [docs/security.md](docs/security.md) | Threat model, rules and the audit log |
| [docs/design.md](docs/design.md) | The design system: paper, colour tokens, type, motion, voice |
| [docs/decisions.md](docs/decisions.md) | Why things are the way they are (D-001 onwards) |
| [docs/data-storage.md](docs/data-storage.md) | Accounts, the database and sync |
| [docs/buddies-and-notifications.md](docs/buddies-and-notifications.md) | The plan for buddies, challenges and notifications |
| [docs/vision.md](docs/vision.md) | Ideas for later |
| [CHANGELOG.md](CHANGELOG.md) | Every change, for people using the app |
| [CLAUDE.md](CLAUDE.md) | The project's working instructions for Claude Code (the same rules, written for the AI) |

## Contributing

Ideas, bug reports and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
first: One More Fold puts security and people's data ahead of features, and the guide explains the
branch flow, the checks and the design rules. For anything bigger than a small fix, open an issue
first so we can talk it through.

Found a security problem? Please don't open a public issue; see [SECURITY.md](SECURITY.md).

## Licence

The code is [MIT licensed](LICENSE): use it, change it, build on it.

**The name and branding are not part of the licence.** "One More Fold" (and its former name,
"Eightfold"), onemorefold.com, the crane
mark and the wordmark (`public/favicon.svg`, the app icons in `public/`, and the mark drawn in the
code) belong to the author. If you run your own copy, give it its own name and look, so nobody
mistakes it for this one.

Also not covered by the licence:

- **`src/data/story.js`:** oze's own habit log from January to October 2026, which the landing
  page tells its story with. It's personal data, shared for that page, not something to reuse. The
  checks use the invented year in `src/data/sample.js` instead.
- **The pictures:** public-domain prints and photos. Their sources are in
  [public/img/credits.json](public/img/credits.json) and in the site's footer.
