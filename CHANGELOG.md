# Changelog

What changed, for people using the app. Why it changed lives in [docs/decisions.md](docs/decisions.md).
Dates are when the work landed.

## 0.12.1 — 30 October 2026

### Fixed
- The big "onemorefold" at the foot of the landing page ran off the right edge (it was sized for
  the shorter "eightfold"). It now fits the page at any width.

## 0.12.0 — 30 October 2026

### Changed
- **Eightfold is now One More Fold.** "Eightfold" is shared by several large companies, so people
  searching for the tracker found them instead; the new name matches the address, onemorefold.com.
  The story stays: fall seven, rise eight, always one more fold. Saved folds, accounts, reminders
  and backups carry on unchanged. Backups are now saved as `onemorefold-backup-....json`. (D-038)

## 0.11.0 — 28 October 2026

### Added
- **Reminders with Eightfold closed.** Signed in, turn them on for each device under Habits →
  Reminders: a notification arrives up to 30 minutes before each habit's time, even when no
  Eightfold tab is open. On iPhone and iPad, from Eightfold added to the Home Screen. Signing out
  stops them on that device. (D-028; setup: docs/push-setup.md)
- Eightfold can be added to the Home Screen as an app (a web app manifest).

### Changed
- The checks run on an invented example year instead of oze's own log. The log stays, renamed
  `story.js`, for the landing page's story, and is kept out of the open-source licence. (D-036)
- The Privacy page says what closed-app reminders keep and that the browser's push service
  delivers them, encrypted.

### Fixed
- In Dark (and slightly in Warm), the tracker's "This month", "Daily score" and "Weeks" cards
  had dark text on a dark card. A landing-page rule for coloured zine panels was also matching the
  tracker's panels. (D-033)

### Tooling
- Docs come in two sets: public ones in git, and the owner's private ones (open security
  weaknesses, personal notes) in a `private/` folder that git ignores. (D-037)
- **`.env` is no longer in git.** It only ever held public values, but no env file belongs in the
  repository. `.env.example` lists the settings; Cloudflare and GitHub provide them to the builds
  as variables. (D-035)
- Work now reaches the live site in two steps: into `preview` first, then from `preview` into
  `main`. GitHub rulesets and a new CI check enforce it; only the owner can push to `main`
  directly. (D-034)
- The `preview` branch gets its own preview site on Cloudflare (Worker Previews), so changes can
  be tried before they go live. Other branches don't make one. (D-034)

### Docs
- Eightfold is open source under the MIT licence. The name and branding aren't part of it. (D-036)
- A new README, a contributing guide with the rules every change follows, a security policy for
  reporting problems privately, and a pull request template.

## 0.10.0 — 28 October 2026

### Added
- **Light, warm and dark papers.** Choose under **Paper** in the account chit: Auto (follows your
  device, the default), Light, Warm (sepia, with less blue, for the evening) or Dark (black washi
  for the night). Every page follows it, including the crane note and the patch notes; the choice
  is kept on this device. (D-033)

### Changed
- Colours now come from role tokens that each theme fills in, and `npm run check` checks contrast
  in all three themes and fails on stray colours. In light mode nothing should look different.

## 0.9.0 — 28 October 2026

### Added
- **Patch notes**, at /patch-notes: what's new in each version, in plain and slightly silly words,
  linked from the landing page's footer and the account chit, which marks a patch you haven't
  read yet. (D-032)
- **Crane notes**, the app's way of explaining itself: tap the little crane by a feature and a paper
  crane flies in and unfolds into a note from oze on why it exists, then folds back up and flies
  away. The first one is on the patch notes page. (D-031)

### Docs
- The plan for buddies, buddy and gang challenges, user tags, the crane note, and notifications
  with the app closed (reminders, a daily summary, a weekly recap) is agreed (D-028 to D-031).
  Nothing is built yet.
- End-to-end encryption of habit names is written up as a parked idea in the vision, with why it
  waits (one key on several devices at once).

## 0.8.0 — 25 October 2026

### Added
- **Privacy and Terms pages**, in plain words, linked from the footer and the account menu. Signing
  in now says that it means agreeing to them. (D-026)
- **Delete my account**, in the account chit: removes your account and every habit, fold and wish
  in it, from the servers and from this browser, after a confirmation with "Save a backup first".
  (D-025)
- **Sign out and remove your folds from this browser**, for a shared computer. Your folds stay in
  your account; if some changes haven't reached it yet, you're asked first.

### Changed
- **The fonts come from Eightfold itself**, not Google Fonts, so no other company sees your visits.
  The security policy no longer allows any third-party style or font origin. (D-027)

## 0.7.0 — 24 October 2026

### Changed
- Landing page: the demo is "Try it with these six", and "Your day, in order" describes the
  feature for everyone rather than the sheet's habit names. "Streaks that survive the 1st" is now
  "Habits on your schedule" (chosen days, times a week, weekly, monthly); the zine's streaks panel
  says that a run keeps counting past the 1st.
- **The landing page speaks to new visitors.** Sections sit closer together; the "What it keeps"
  cards now fit on screen while they slide. Numbers are labelled as an example from oze's own sheet
  (1 January to 22 October 2026) and habit names are everyday ones. New closing words, and a
  footer with the author's name, email and GitHub. (D-021)
- **A new visitor's tracker starts empty**, instead of showing the sheet's habits. "Reset to the
  sheet" is gone. The landing page still tells the sheet's story. (D-016, D-020)
- The backup reminder stops while you're signed in and synced.
- The landing page's "Try it with today's six" now uses six generic tasks (make your bed, walk outside,
  read ten pages...) instead of real habits. (D-016)
- The tracker opens months from your first month of habits up to next month, and the arrows stop
  at those ends. Looking at a month no longer saves an empty copy of it; it's saved once you change
  something. (D-017)

### Fixed
- **Deploying to Cloudflare works.** A `wrangler.jsonc` tells Cloudflare to serve the built site
  instead of guessing from the Vite config (which failed). The tracker lives at `/app`; old
  `/app.html` links still work. (D-014)
- Development tooling uses a patched `undici` (a dependency of Wrangler) after new security
  advisories. Nothing visitors download changed.

### Added
- **Why a thousand cranes?** The story behind the name, on a paper scroll: the crane, senbazuru,
  the 1797 folding book, Sadako Sasaki, "fall seven, rise eight", and how Eightfold folds. Open it
  from the folded note on the landing page's wish card, from the crane once you've ticked the six,
  or from "Why 1,000?" in the tracker. (D-023)
- **Your account, in the corner.** A crumpled paper ball in the header of every page: tap it to
  sign in, or to keep going on this device only. Signed in, it's folded flat with your initial and
  shows whether your folds are saved. (D-022)
- **Sign in and sync.** Sign in with Google or an emailed link from the Account panel on the
  Habits page, and your folds are saved to your account and reach your other devices. Changes made
  offline sync when you're back. Optional: signed out, everything works as before. (D-019, D-020)
- A not-found page in the paper style.
- **Fold the year.** In December and January a slip offers a look back at the year (cranes,
  perfect days, best month, longest run, most-folded habit), lets you choose which habits come into
  January, and asks for next year's wish. (D-017)
- **A wish for each year.** Crane 1,000 of 2027 can be for something new; the year view shows each
  year's wish. Your current wish stays with 2026. (D-017)

### Docs
- D-018: the accounts database (tables, limits and row-level security), ready to run in Supabase.
  Nothing changes in the app yet.
- D-015: the product keeps the name **Eightfold**; onemorefold.com is its address. Eightfold is
  one more fold after seven: "fall seven, rise eight".
- D-016: what personal data is public for now, and the accepted risk of a public repository.

## 0.6.0 — 24 October 2026

### Added
- **Habit schedules.** A habit can repeat every day, on chosen days (say Monday and Wednesday),
  a number of times a week, once a week, or once a month. Set it under Habits → Repeats; the goal
  updates to match. (D-013)
  - The month grid only puts boxes on days a habit is due; other days show a quiet dot and are
    never counted as misses.
  - Today shows what's due today, then **This week** and **This month** strips with progress like
    "1 of 3 this week".
  - Percentages, goals and runs count in the habit's own units: days, weeks or months.
  - Reminders skip rest days and stop once a weekly or monthly goal is met.
- Arrow keys in the grid hop over rest days.

### Changed
- In the Days view the grid's columns are now "Due" and "% due", since a weekly habit is counted in weeks.

### Fixed
- On phones, the habit editor squeezed Time and From day into a 40px column; it now uses three even columns.

### Docs
- `main` now changes only through pull requests ([CLAUDE.md](CLAUDE.md), D-010).

### Tooling
- GitHub Actions CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `npm ci`, `npm run check`,
  `npm run build` and `npm audit` on every pull request and every push to `main`. Read-only
  permissions; actions pinned to commit SHAs.

## 0.5.0 — 24 October 2026

### Added
- **Your data is safer in the browser.** After your first tick of a visit, Eightfold asks the
  browser to keep its data permanently; the Backup panel shows whether it's protected and when you
  last saved a backup.
- **Weekly backup nudge:** a slip at the top of the month after 7 days without a backup, with
  "Remind me tomorrow". It disappears once accounts and sync exist. (D-012)
- If the browser ever refuses to save a change, you're told straight away.

### Security
- Backups are checked field by field before loading; a damaged or crafted file is refused with a
  plain reason and nothing changes. Stored data gets the same checks every time the app opens, and
  data that can't be read is kept aside instead of deleted.
- Habit names on the landing page are now escaped, so text in a name can never run as code.
- Security headers and a strict Content-Security-Policy for the hosted site (`public/_headers`).
- Links that act on a reminder only work for a reminder that actually fired.
- Development tools upgraded (Vite 8, sharp 0.35): `npm audit` reports 0 vulnerabilities.
- New [docs/security.md](docs/security.md) with the threat model, rules and audit log;
  `npm run check` now includes 25 hostile-data checks.

### Docs
- Branch conventions and the security-first rule in [CLAUDE.md](CLAUDE.md) (D-010, D-011).
- Accounts and cloud data decided (D-008, now accepted): Google and email-link sign-in, private
  accounts with opt-in buddies later, Cloudflare Pages hosting with Supabase in Mumbai.
  Details in [docs/data-storage.md](docs/data-storage.md).
- New ideas in [docs/vision.md](docs/vision.md): opt-in buddies, and weekly and monthly goals with
  habits on chosen days. The proposed schema leaves room for those schedules.

## 0.4.0 — 23 October 2026

### Added
- **Days, Goal or Both.** A switch on the Month and Year pages chooses how percentages are read:
  ticks against the days so far, against each habit's goal, or the two side by side. Days is the
  default; change it with "Make default" or on the Habits page. (D-006)
- Every percentage now says what it counts, for example "13 of 30 days" or "13 of 20 goal days".
- Docs: this changelog, [decisions](docs/decisions.md), the [design system](docs/design.md),
  the [data storage study](docs/data-storage.md) and the [vision](docs/vision.md).

### Changed
- This month's success rate counts only the days so far. Today counts once it's ticked.
- A month's goal total counts each habit at most at its goal.

### Fixed
- September's gym read 65% with no hint that it was against a 20-day goal, not 30 days.

## 0.3.0 — 23 October 2026

### Changed
- **Renamed to Eightfold** (was the working name Orizuru). New hero line, "Fall seven, rise eight",
  and the story behind the name in the Why section. (D-009)
- Data saved under the old name is picked up automatically.
- The project now lives in its own folder on the Desktop.

## 0.2.0 — 23 October 2026

### Added
- **Reminders** at each habit's time: system notifications with Done and "In 10 minutes" buttons,
  or a paper note on the page. Choose how early, and which habits. (D-007)
- "Next nudge" line under Today.

### Fixed
- Ticking a square no longer scrolls the month grid back to the 1st.

## 0.1.0 — 23 October 2026

### Added
- Landing page: the crane that folds as you tick today's habits, the story, the feature zine,
  the year as paper mountains, what's new.
- Tracker: the month grid with goals and streaks, today's checklist, daily and weekly scores,
  top habits, your day in order, the year view, a habit editor, the 1,000-crane wish, JSON backup.
- January to October 2026 imported from the Google Sheet.
