# Decisions

Every decision that shapes the app, why it was made, and what it costs. Newest last.
Add one when a choice would surprise someone reading the code later. Status is **Accepted**,
**Proposed** or **Replaced by D-xxx**.

---

## D-001 A static site: Vite, plain JavaScript, Three.js, GSAP
Accepted · 23 Oct 2026

- **Context:** a single-person habit tracker that may become a phone app and a small multi-user app.
- **Decision:** no framework. ES modules built by Vite into a static site with two pages:
  `index.html` (landing) and `app.html` (tracker). Three.js draws the crane, GSAP runs the motion.
- **Why:** the app is small, renders from one state object, and needs no server. Static files host
  anywhere for free and wrap into a phone app with Capacitor unchanged.
- **Cost:** views re-render with template strings, so focus and scroll are restored by hand
  (`render()` in app.js). If screens grow much more complex, revisit a small view library.

## D-002 All data in one localStorage object
Accepted · 23 Oct 2026 · will be extended by D-008

- **Decision:** one JSON object under `eightfold:v1`: `months[YYYY-MM] = { habits[], checks{id: [days]} }`,
  plus `wish`, `colors`, `reminders`, `prefs`. JSON backup and restore on the Habits page.
- **Why:** zero setup, works offline, trivially exported.
- **Cost:** one browser only; clearing site data deletes it. See [data-storage.md](data-storage.md).

## D-003 Seeded from the Google Sheet, January to October 2026
Accepted · 23 Oct 2026

- **Decision:** the sheet's ticks were copied by hand into `src/data/seed.js` (now `story.js`, D-036), with habit ids
  (`move`, `dsa`, `german`...) that link renamed habits across months.
  `scripts/check-seed.mjs` recomputes every month against the sheet's printed success rate.
- **Known difference:** January shows 44% against the sheet's 45%. The sheet counted one stray tick
  in a habit row with no name; it was left out.
- **The sheet is not synced.** It was a one-time import.

## D-004 No stored formulas: every number is computed
Accepted · 23 Oct 2026

- **Decision:** `src/lib/stats.js` computes everything the sheet's formulas did from the ticks:
  per-habit done, left and progress, streaks, daily and weekly scores, monthly and yearly rates.
- **Kept from the sheet on purpose:** weeks count from the 1st (days 1–7, 8–14...), not calendar
  weeks. A habit added mid-month has a `start` day and no boxes before it.
- **Changed from the sheet:** current streaks continue across months (the sheet reset them each tab).

## D-005 The look: paper-cut collage, origami and anime touches
Accepted · 23 Oct 2026

- **Decision:** the owner asked for a Vox-style paper collage with origami and anime vibes, cute but
  not girly. The full system is in [design.md](design.md).
- **Deliberate departures from the design-taste skill's house rules:** paper sheets cast shadows,
  because a shadow is what makes paper read as paper; torn edges and tape are decorative by nature.
  Gradients, glass, emoji and stock icon cards stay banned.
- **Palette adjusted after review:** the first pairing (cream with orange-vermilion) read as a generic
  "assistant" palette. The ground moved to a neutral stone washi `#E6E5E1` and the accent to crimson
  `#C8302C`, which also passes contrast for white text.

## D-006 Three ways to read a percentage: days, goal, both
Accepted · 23 Oct 2026

- **Context:** the owner saw September's gym at 65% after 13 days in a 30-day month. 65% was 13
  against the sheet's 20-day goal. The app mixed three denominators without saying which.
- **Decision:**
  - **Days** (default): ticks against the days so far. Today counts only once it's ticked, so an
    unticked morning isn't a miss. Past months use every day. (Changed by D-041: today now counts from the start of the day.)
  - **Goal**: ticks against each habit's monthly goal, as the sheet's PROGRESS column did.
    A habit can pass 100% (January DSA was 27 against 10). In month totals each habit counts at most
    its goal, so one overachiever can't hide the rest.
  - **Both**: the two side by side, days first.
  - A switch on the Month and Year pages changes the view; "Make default" or the Habits page sets
    the default (`prefs.percentView`).
  - Every percentage on screen says what it counts ("13 of 30 days", "13 of 20 goal days").
- **Consequence:** the current month's success rate is now counted so far. October reads 61%
  (80 of 132) where the sheet said 43% by counting 24–31 October as misses. For now October also
  shows as the best month of the year, because it's measured on 22 days.
- **Checks:** `scripts/check-stats.mjs`.

## D-007 Reminders in the browser only, for now
Accepted · 23 Oct 2026

- **Decision:** a timer checks every 20 seconds. A habit that has a time, is switched on, started
  and is not ticked fires once a day, up to two hours late. A system notification is used when the tab is in
  the background (with Done and "In 10 minutes" buttons through a service worker, `public/sw.js`);
  a paper note shows on the page when it's in front or notifications are blocked.
- **Limit:** browsers only run this while an Eightfold tab is open. Reminders with the app closed
  need push from a server (D-008, phase 3) or the phone app.
- **Checks:** `scripts/check-reminders.mjs`.

## D-008 Accounts and cloud data: Supabase behind a storage adapter, local-first
Accepted · 23 Oct 2026 · not built yet

- **Context:** family and friends may use the app, which needs sign-in, sessions and data that
  outlives a browser, without loading the app with a backend before it's needed.
- **Decision:** keep the app working with no account. When accounts come, add Supabase (Postgres,
  built-in auth and sessions, row-level security) behind the same `store.js` API, syncing a local copy.
  Full comparison with Firebase, PocketBase and Cloudflare D1, the schema, and the phases are in
  [data-storage.md](data-storage.md).
- **Settled with the owner:**
  - **Sign-in:** Google and emailed magic links; no passwords. Email needs a custom SMTP provider,
    because Supabase's built-in email only reaches the project's own team, 2 messages an hour.
  - **Sharing:** every account private at launch. Opt-in buddies come later; the schema keeps
    `user_id` on every row so sharing is new rules, not moved data.
  - **Hosting:** Cloudflare Pages for the site, Supabase in Mumbai for the database.
    A custom domain is needed (also for email links), and the project needs a git repository.

## D-009 The name: Eightfold
Accepted · 23 Oct 2026

- **Context:** working name was Orizuru (paper crane). The owner wanted something personal and global:
  they were inconsistent for years and are now building discipline.
- **Decision:** Eightfold. Fall seven times, rise eight: this is the eighth rise. It also means
  folding (every tick is a fold), and nods to the Eightfold Path, which began in India.
- **Note:** a large AI hiring company is also called Eightfold; for app stores, list as
  "Eightfold: Habits".
- **Migration:** data saved under the old key `orizuru:v1` is read automatically and saved under
  `eightfold:v1`. The 3D model is still called an orizuru in code comments: that's the Japanese
  word for a paper crane.

## D-010 Git workflow: main is production, work on prefixed branches
Accepted · 24 Oct 2026

- **Decision:** the repository lives at github.com/ozesince02/eightfold. `main` is what Cloudflare
  Pages hosts and is never committed to directly. Work happens on `feature/`, `fix/`, `hotfix/`,
  `docs/`, `refactor/` or `chore/` branches (conventions in [CLAUDE.md](../CLAUDE.md)) and merges
  into `main` once checks and the build pass and the owner agrees.
- **Why:** hosting from a branch that only receives finished, checked work keeps the live app stable.
- **Update, 24 Oct 2026:** `main` changes only through pull requests, merged when the owner agrees.

## D-011 Security and reliability before features
Accepted · 24 Oct 2026

- **Context:** the app will hold family and friends' personal data. The owner set the priority:
  "features are secondary but reliability is primary".
- **Decision:** every change follows [security.md](security.md): validate input through
  `src/lib/sanitize.js`, escape output, a strict Content-Security-Policy and security headers
  (`public/_headers`), no secrets in git, `npm audit` at zero, row-level security once there's a
  database, and an audit log of what was found and fixed.
- **Cost:** some inline convenience is gone (the boot snippet is a file now), and new external
  services need a deliberate CSP change.

## D-012 Local data safety, and backups only while unsynced
Accepted · 24 Oct 2026

- **Decision:** storage goes through an adapter (`src/lib/adapters/local.js`). The app asks the
  browser for persistent storage after a real click (Firefox may show a prompt, so never on load),
  reports a refused save once, and nudges for a JSON backup every 7 days with a one-day snooze.
- **The owner's rule:** once data is on Supabase, changes sync in real time, or as soon as there is a
  network, and the backup nudge goes away. The nudge is tied to `adapter.mode === 'local'`.
- **Checks:** `scripts/check-backup.mjs`.

## D-013 Habit schedules: chosen days, times a week, weekly and monthly
Accepted · 24 Oct 2026

- **Context:** the owner wants long-term goals (weekly, monthly) beside daily ones, and habits that
  belong only on some days ("Monday and Wednesday"), shown gracefully in the data and the UI.
- **Decision:** each month's habit has a cadence (`src/lib/schedule.js`):
  - **Every day** (`daily`, the default; existing data has no cadence key and stays daily).
  - **On chosen days** (`weekdays`, 1 = Monday ... 7 = Sunday). Other days are rest days: no box,
    never a miss, and they neither break nor extend a run.
  - **Times a week** (`times_per_week`, N from 1 to 7). Any day counts. Weeks are the app's weeks from
    the 1st; a short last week (29th–31st) asks for round(N × days ÷ 7), at least 1.
  - **Once a week** (`weekly`) and **once a month** (`monthly`), on any day.
- **How they count:**
  - Units follow the schedule: days, weeks, or the month.
  - Days view: done against what was due so far. The current day, week or month only counts once it's done, so it's
    never a miss before it ends. (Changed by D-041 for days: today counts from its start.)
  - Goal view: completed units against the goal. Extra ticks in a week don't count past its target.
  - Changing a schedule resets the goal to what the schedule implies (Mon/Wed/Fri in October is 13,
    three a week is 13, once a week is 5). The goal stays editable.
  - A day's score counts habits due that day plus weekly and monthly ticks made that day, so a
    weekly habit never makes a day look worse.
  - Streaks walk back in the habit's unit and across months while the schedule's unit stays the same.
  - Raw ticks still all count as folds (cranes).
- **In the app:** Today lists what's due today, then "This week" and "This month" strips with
  progress ("1 of 3 this week"). The grid shows dots on rest days and dashed boxes for any-day habits.
  Reminders skip rest days and stop once a weekly or monthly goal is met.
- **Checks:** `scripts/check-schedules.mjs` (hand-counted October 2026 cases).

## D-014 Hosting as a Cloudflare Worker serving static files
Accepted · 24 Oct 2026 · refines D-008's "Cloudflare Pages"

- **Context:** Cloudflare's dashboard now creates a Worker (Workers Builds) when connecting a
  repository, not a classic Pages project. With no config in the repo, its deploy step
  (`npx wrangler deploy`) tried to auto-detect the project from `vite.config.js` and failed.
- **Decision:** `wrangler.jsonc` declares a static-assets Worker that serves `dist/` (built by
  `npm run build`). No server code. `public/_headers` still sets the security headers (verified on
  Cloudflare's local runtime), `public/404.html` is the not-found page, and
  `html_handling: auto-trailing-slash` serves the tracker at `/app` (old `/app.html` links redirect,
  keeping their query string).
- **Pinned tooling:** Wrangler is a dev dependency at an exact version at least two weeks old
  (4.149.0), so Cloudflare installs that rather than whatever is newest, and `npm audit` covers it.
- **Note:** the Worker name in `wrangler.jsonc` must match the Worker's name in the dashboard.

## D-015 The product stays Eightfold; onemorefold.com is the domain
Replaced by D-038 (30 Oct 2026) · was accepted 24 Oct 2026 · replaces the earlier plan (same day) to rename the product to One More Fold

- **Context:** `eightfold.com` and `eightfold.app` are taken. The owner bought **onemorefold.com**,
  and the Cloudflare Worker is called `onemorefold`. The first plan was to rename the product to
  One More Fold once setup was done.
- **Decision:** the product keeps the name **Eightfold**; **onemorefold.com** is only its address.
  The two names tell the same story: the idea is **"fall seven times, rise eight"**, and eightfold
  is one more fold after seven. Nothing is renamed: not the code, the storage key, the docs or the
  GitHub repository (`ozesince02/eightfold`). The Worker keeps its name `onemorefold` (D-014).
- **The landing page can say so.** A "why this name" section can later connect the name and the
  domain, and bring in the words that matter in the owner's life:
  - "Thoughts become things" (*The Secret*): every fold turns an intention into something real;
    the thousandth is the wish.
  - "The only way to eat an elephant is one bite at a time" (heard in the film *The Six Triple Eight*):
    a thousand cranes, folded one at a time.
  - "To lose patience is to lose the battle": not one big effort, just one more.
  - *Make Your Bed*: start with one small task, done today.
  - *Ikigai*: steady, unhurried practice as a way of living.
- **Ask the owner to review that copy** before merging it.

## D-016 What personal data is public, for now
Accepted · 24 Oct 2026 · revisit when accounts ship

- **Context:** with the site live on onemorefold.com, the app falls back to the January–October
  sheet data (`src/data/seed.js`, now `story.js`, D-036) for any visitor with nothing saved, and the landing page quotes
  the owner's habits, times and numbers. The GitHub repository is public, so the data is also in
  its history.
- **Decisions by the owner:**
  - **Live tracker:** left as is until accounts exist. When accounts ship, new visitors and new
    accounts start empty; the owner's history moves into the owner's account only.
  - **Landing page:** the goal is the real story and headline totals (ticks, months, the year's
    mountains, perfect days) with no habit names, times or day-by-day grids. **Step one (24 Oct):**
    the "Try it with today's six" demo uses six generic tasks (`src/data/demo.js`). The rest of the
    page keeps its current detail until the owner asks to change it.
  - **Repository:** stays public. The owner judged that a list of habits worked on can't be used
    maliciously. Recorded as an accepted risk in [security.md](security.md).

## D-017 Years: months only when used, a wish per year, and folding the year
Accepted · 24 Oct 2026

- **Context:** the tracker began with 2026 data only. Months are stored by key (`"2026-10"`), so
  2027 is just more months, and habits already carry over from one month to the next. Three things
  around that didn't fit a second year: opening any month (even 2031 or 2019) saved an empty copy
  of it; the arrows went forward and back forever; and there was one wish for all time while the
  crane count resets every year.
- **Decision:**
  - **Months are saved only when something changes in them.** Opening a month that hasn't been
    used shows a draft (last month's habits, empty grid) without saving it. Ticking, adding,
    editing, moving or removing a habit saves the month. This month is always saved, as in the
    sheet, so reminders and the Today list work from the 1st. Once synced, browsing never writes
    rows to the database.
  - **Limits:** the tracker opens months from the first one with a habit in it (nothing before
    the person started) up to next month (so it can be set up ahead). Years go from the first year up
    to this one. An address outside that lands on the nearest month or year that is allowed.
  - **One wish per year:** `years["2026"].wish`. Crane 1,000 of each year is for something new;
    past years keep theirs. An old backup's single `wish` moves to the latest year that has months.
  - **Fold the year:** from 1 December to 31 January, a slip on the current month offers a look
    back at the year (cranes, perfect days, best month, longest run, most-folded habit), a
    checklist of the habits to carry into January (all ticked by default), and next year's wish.
    Folding records `years["2026"].foldedAt`. A habit you let go that already has ticks in January
    stays, and you're told so: ticks are never thrown away. Skipping the ritual changes nothing:
    habits carry over by themselves.
- **Data:** a top-level `years` map, `{ "2026": { wish, foldedAt } }`, validated in
  `cleanState()` (four-digit years, wish capped at 200 characters, at most 100 years). In Postgres
  it becomes a `years` table (see data-storage.md); `profiles.wish` goes away.
- **Later:** a year recap and comparisons between years (vision.md) read the same data; nothing
  extra needs storing for them.

## D-018 The accounts database
Accepted · 24 Oct 2026

- **Context:** sign-in and sync need somewhere to keep each person's data (D-008: Supabase).
- **Decision:** six tables (`profiles`, `years`, `habits`, `months`, `habit_months`, `ticks`) in
  one migration, `supabase/migrations/20261024120000_accounts.sql`, run once in the Supabase SQL
  editor. Details in data-storage.md.
  - **The app's ids are the keys** (`user_id, slug`) instead of new UUIDs: no mapping table, nothing
    to keep in step, and a backup file still maps one to one.
  - **The database enforces the same rules as `sanitize.js`**, plus per-person size limits, because
    anyone can call the Data API with their own session; the app's checks alone aren't enough.
  - **Row-level security on every table; `anon` has no grants at all.** Helper functions live in a
    `private` schema the Data API doesn't expose.
  - **Reminders stay on the device.** Notification permission and timing belong to each phone or
    laptop, so they're not synced.
- **Tested on real Postgres** (PGlite, a dev dependency) in `npm run check`: one user can't read,
  change, delete or plant another's rows; signed-out visitors can't read anything; bad data and
  too many rows are refused; deleting an account removes everything. Turning RLS off on a table
  makes the check fail.
- **Open (owner's call):** whether anyone can sign up, or only invited people. Recommended for
  family and friends: turn off "Allow new users to sign up" in Supabase and invite people from the
  dashboard; the per-person limits cap the damage if sign-up stays open.

## D-019 Sign-in, and settings in one place
Accepted · 24 Oct 2026

- **Sign-in:** Supabase Auth with Google or an emailed link, from an Account panel on the Habits
  page. Optional: signed out, the tracker works exactly as before.
  - **PKCE flow:** Google's redirect and the email link bring back a one-time code that only the
    browser that asked can exchange, never a token in the address bar. So the email link must be
    opened in the same browser; the panel says so.
  - **Loaded late:** the Supabase client is its own chunk, fetched after the tracker has rendered,
    so the landing page never loads it and a slow network never delays the grid.
  - **Errors:** a failed sign-in coming back as `?error=` shows a fixed message (the description
    in the URL is never displayed); the code and error are removed from the address afterwards.
  - **Sign out** is for this device only, and leaves the local data where it is.
  - **This PR doesn't sync yet.** It's meant to ship together with the sync PR that follows.
- **Settings:** deployment values live in `.env` and are read only through `src/config.js`,
  together with product constants (`CRANE_GOAL`, `STORE_KEY`, `BACKUP_EVERY_DAYS`). `.env` is
  committed because everything in it is public and ends up in the built site anyway (Vite's
  convention); secrets go in `.env.local` or the dashboards. **Superseded by D-035 (29 Oct): `.env`
  is no longer in git.** Guards: `npm run check` fails if `.env`
  holds any name other than the two public settings or a value that looks like a key; the build
  fails if they're missing or the key isn't a publishable one; the CSP's Supabase entries are filled
  from `.env` so the two can't drift apart.

## D-020 Sync, and new visitors start empty
Accepted · 24 Oct 2026

- **How:** the store still saves to localStorage first. The sync engine turns each save into row
  changes (a diff of the state as rows against what the account has), queues them on the device,
  and sends them in batches; then it fetches the account's rows and takes them if nothing changed
  here meanwhile. Whole-state diffs mean every way of changing data (ticks, editor, import, fold)
  syncs without each one knowing about the network.
- **Other devices** learn of changes from a broadcast on a private per-person Realtime channel,
  authorised by RLS on `realtime.messages` (migration `20261024130000_sync_channel.sql`). Realtime
  "Postgres changes" was rejected: delete events bypass RLS and would hand other people's keys out.
- **First sign-in with folds on both sides asks** ("Keep both" or "Use only my account's") instead
  of guessing; neither choice deletes anything.
- **Refused rows** (bad data or a limit) are dropped one by one so they can't block the queue, and
  the person is told. Network errors retry with backoff up to a minute.
- **Signing out** stops syncing and clears the queue; the folds stay in the browser.
- **Shared browsers:** the browser remembers which account it last synced with. If someone else
  signs in, the earlier person's folds are kept aside on the device and the tracker starts from the
  new account: they are never uploaded to it or merged into it.
- **Nothing is replaced without a copy:** before "Keep both", before "Use only my account's", and
  before the account's copy replaces local rows the account refused, the browser's data is kept
  aside under a dated key.
- **New visitors start empty (D-016).** The tracker no longer falls back to the sheet's data, and
  "Reset to the sheet" is gone. The landing page still tells the sheet's story from `seedState()` (now `sheetState()` in `story.js`, D-036).
- **Tested** by `scripts/check-sync.mjs`: the real engine against the real schema and RLS, with
  several devices, a second person, offline edits across a reload, conflicting offline ticks, both
  first-sign-in choices, more than 1,000 rows and the broadcast. Skipping deletes in the engine
  makes it fail.

## D-021 The landing page tells oze's story, under everyday names
Accepted · 24 Oct 2026

- **Context:** the landing page showed the owner's real habits and numbers as if they were the
  visitor's, and phrased them as "now" ("October is still being folded"). With the app open to
  everyone, a first-time visitor couldn't tell whose numbers these were.
- **Decision:** the numbers stay real (they're the story) but are **labelled as oze's**, from
  1 January to 22 October 2026, the day before Eightfold was born, and computed **as of that date**
  (`STORY_DATE`), so they never drift. **Habit names are everyday stand-ins** (`STORY_ALIASES` in
  `src/data/demo.js`: "Read ten pages", "Walk outside"...), and the page says so. The closing
  speaks to new visitors and quotes oze. The footer names the author from `AUTHOR` in config.js.
- **Layout:** the space between sections is margin (64–128px by screen width), not padding, so the
  pinned "What it keeps" section holds only its content; its cards size to the screen's height and,
  on screens under 900px tall, the decorative page hides. All cards stay on screen while it slides.

## D-022 The account is a piece of paper in the header
Accepted · 24 Oct 2026

- **Context:** sign-in lived in a panel on the Habits page, three clicks from anywhere and easy to
  miss; once signed in, nothing on screen said so.
- **Decision:** both pages carry the account in the header's right corner (`src/ui/account-menu.js`,
  `src/styles/account.css`). Signed out it's a **crumpled paper ball** that floats a little ("Sign
  in" beside it on wider screens): not yours yet. Signed in it's **folded flat**, a red square on
  its corner with your initial and the sync dot ("Signed in"): yours. Tapping it opens a **chit**,
  taped at the top and torn at the bottom: sign-in choices with "Not now, keep it on this device",
  or who you are, sync status and Sign out (plus "Open your tracker" on the landing page).
- Sign-in from either page returns to the tracker (`APP_PATH`). The Habits page's Account panel is
  gone; the "two sets of folds" slip on the month stays.
- **Accessibility:** a real button with `aria-expanded` and a label that says the state; the chit
  is a labelled dialog, takes focus, closes on Escape or a tap outside and returns focus. Phones
  get the paper without the label and a full-width chit under it. Reduced motion: no float, no unfold.


## D-023 The story of the thousand cranes, behind three doors
Accepted · 24 Oct 2026

- **Context:** the product leans on senbazuru (a thousand cranes, a wish) and "fall seven, rise
  eight", but never told the story; a visitor had to take "legend says" on trust.
- **Decision:** one short story in six chapters (the crane as long life; senbazuru; the 1797
  folding book; Sadako Sasaki; nanakorobi yaoki; how Eightfold uses all of it) on a **hanging
  scroll** of aged paper that unrolls over the page (`src/ui/crane-story.js`,
  `src/styles/story.css`). Three ways in, all opening the same scroll:
  - **The crane's line** in the landing hero, once per visit, after the six demo habits are ticked
    and the crane is whole: curiosity is highest right after the small win.
  - **A folded note** on the "A thousand cranes" card, sealed with 千. It wiggles once when it
    comes into view, its top flap lifts on hover, and on a tap it opens flap by flap into the story.
  - **"Why 1,000?"** in the tracker's crane panel, for people who never see the landing page.
- **Light:** no new library or image. The scroll is CSS (gradients and one small SVG noise tile),
  the 1797 page already on the site, and a native `<dialog>`. The module and its styles load only
  when someone asks for the story (the landing page starts loading it when a door appears).
- **Accuracy:** written in our own words, no quotes. Where retellings disagree (how many cranes
  Sadako folded), it says so instead of repeating one version.
- **Accessibility:** a modal `<dialog>` labelled by its title; Escape, ✕, the closing button or a
  tap outside roll it up and focus returns to the door that opened it. Reduced motion: no unroll,
  no unfold, no wiggle; the scroll simply appears.
- The scroll closes through its own path rather than waiting for the dialog's `close` event, which
  the desktop app's browser pane didn't always send.

## D-024 Signing out can leave nothing behind
Accepted · 25 Oct 2026

- **Context:** folds live in the browser first (D-020). Signing out kept them there, and a second
  account signing in on the same browser parked the first person's copy rather than deleting it.
  Right for your own phone; a leak on a shared computer.
- **Decision:** plain "Sign out" still keeps the folds on the device (it's the safe default: nothing
  is lost, offline changes included). The chit adds **"Sign out and remove my folds from this
  browser"**: it signs out first, then removes every Eightfold key (tracker, sync queue, copies
  kept aside, the old name's data) and shows an empty tracker. If changes are still waiting to reach
  the account, it asks before throwing them away. Other sites' data and Supabase's own keys are
  left alone (signing out already removes the session).

## D-025 People can delete their own account
Accepted · 25 Oct 2026

- **Context:** only the owner could delete an account (Supabase dashboard). A privacy policy that
  promises deletion needs a button that does it.
- **Decision:** "Delete my account" at the bottom of the signed-in chit opens a confirmation:
  what goes (the account, every habit, fold and wish, here and on the servers), that it can't be
  undone, that other devices keep their copy until removed there, and **Save a backup first**
  (the same file as the tracker's backup). "Delete everything" calls the database function
  `public.delete_my_account()` (`supabase/migrations/20261025120000_delete_account.sql`), which
  deletes the caller's auth user; profiles cascade from it and every table from profiles, so
  nothing is left. Then the page stops syncing, removes this browser's copy (D-024) and reloads,
  signed out, with a one-line note.
- **Why a database function, not an Edge Function with the secret key:** it's one statement, it
  runs with the caller's own token, and no secret key has to live anywhere outside the dashboard.
  It's `SECURITY DEFINER` (people can't touch `auth.users` themselves) with an empty
  `search_path`, deletes only `auth.uid()`, and signed-out visitors can't execute it.
- **Not done:** other signed-in devices aren't wiped remotely. Their sign-in stops working (the
  sessions are deleted with the account) but their local copy stays until removed there.

## D-026 Privacy and Terms, in plain words
Accepted · 25 Oct 2026

- **Context:** accounts store personal data (email, habit names, wishes). India's DPDP Act applies
  (an Indian operator, data in Mumbai), the GDPR applies to EU visitors who sign in, and Google's
  sign-in screen asks for a privacy policy. Eightfold had none.
- **Decision:** two static paper pages, `privacy.html` and `terms.html` (`/privacy` and `/terms`
  on the live site), each opening with a yellow "short version" slip. They say what is kept, where
  (Supabase in Mumbai, Cloudflare, Google), who can see it (only the person; the operator only on
  request, for security or by law), how long, and how to export, remove or delete it; and that
  there are no ads, analytics or trackers. Accounts are for people 18 and over (the DPDP Act needs
  a parent's verifiable consent below that); anyone can use Eightfold without one, which sends
  nothing to us. Terms: free, as is, no professional advice, fair use, 30 days' notice before
  closing, Indian law.
- **Where:** linked in the landing footer and in the account chit; the sign-in chit says "By
  signing in you agree to the Terms and the Privacy page". Using Eightfold without an account
  needs no agreement: nothing leaves the device.
- Written without a lawyer, as a plain-language starting point; worth a professional review if
  Eightfold grows or takes payments. The contact address comes from `AUTHOR` in config.js.
- When a service that handles data changes (for example self-hosted fonts drop Google from page
  loads), the Privacy page and its date change in the same pull request.

## D-027 The fonts are served from our own site
Accepted · 25 Oct 2026

- **Context:** every page loaded Dela Gothic One and Zen Maru Gothic from Google Fonts, so Google
  saw each visitor's IP address, even people who never sign in, and the CSP had to allow two Google
  origins.
- **Decision:** the same two typefaces from **Fontsource** (`@fontsource/dela-gothic-one`,
  `@fontsource/zen-maru-gothic`, OFL-1.1, exact versions), imported once in
  `src/styles/fonts.css` and linked by every page. They're split by unicode-range like Google's,
  so a page downloads only the slices it shows (about 85 KB on the landing page).
- `vite.config.js` drops Fontsource's `.woff` fallbacks from the built CSS (every browser we
  support reads woff2; it saves ~10 MB of deploy) and never inlines a font as a `data:` URL, which
  `font-src 'self'` would block. `404.html` moved from `public/` to a Vite page so it gets the fonts
  too. `check-security.mjs` fails if a page loads Google Fonts again or the CSP loosens.
- **Cost:** the deploy carries ~8 MB of font slices (489 files) that visitors fetch only as needed.


## D-028 Notifications with the app closed: a job every 30 minutes
Accepted · 28 Oct 2026 · reminders built 28 Oct (summaries next) · plan: [buddies-and-notifications.md](buddies-and-notifications.md), setup: [push-setup.md](push-setup.md)

- **Decision (the owner's):** Web Push sent by a Supabase Edge Function that Supabase Cron starts
  every 30 minutes, not every minute. Each run reminds habits due in the next half hour, so a
  reminder arrives up to 30 minutes early and names the time ("German at 7:00"). The notification's
  snooze is "Later", since the next run can be up to 30 minutes away.
- **No duplicates, nothing stale:** each send re-checks the habit (still due, not ticked, not
  deleted or moved) and a sent log allows one reminder per habit per day; a tab on a device with
  push on stops showing its own system notifications.
- **Summaries:** a daily summary at a time each person picks (default 21:30) and a weekly recap on
  Sunday, each switched on separately, all off by default. At most 30 notifications a person a day.
- **Why not every minute:** exact times aren't needed for habits; the interval can shrink later
  without changing anything else.
- **As built (28 Oct):**
  - **No Web Push library.** `supabase/functions/_shared/webpush.js` does RFC 8291 encryption and
    RFC 8292 VAPID with WebCrypto alone, checked byte for byte against RFC 8291's worked example.
  - **One set of rules.** The sender runs exact copies of the app's own `dates`, `schedule`,
    `reminders-core` and `sync/rows` modules (`npm run shared`; a check fails if a copy drifts), so
    it and the tracker agree on what's due. It reads each person's clock in their own time zone.
  - **Tables** (`20261028120000_push_reminders.sql`): `push_settings` (on or off, habits off, time
    zone), `push_subscriptions` (one row per device, added only through `register_push()`, ten at
    most, and only addresses at the browsers' own push services, so the sender can't be pointed at
    anything else), and `push_log` (server only, kept two weeks). The sender claims each reminder in
    the log before sending, so two overlapping runs can't both send it.
  - **Per device:** each device opts in. Signing out, "remove my folds from this browser" and
    deleting the account take the device off first. A device that gets closed-app reminders stops
    sending its own system notifications from the tab; the paper note on an open page stays.
  - **The notification** names the time ("Next up: German at 07:00") and opens the tracker. Done
    and Later buttons on it come later: they need a single-use token from the server.
  - **Secrets** (VAPID private key, cron secret) are made by `npm run vapid` on the owner's
    computer into git-ignored files, and live as Edge Function secrets and in Supabase Vault.

## D-029 Buddies: invite links, three sharing levels, user tags
Accepted · 28 Oct 2026 · not built yet · plan: [buddies-and-notifications.md](buddies-and-notifications.md)

- **Decision (the owner's ideas):** several buddies, added only by a one-time invite link (no
  search, community or chat; removing is enough, so no blocking). For each buddy, one of three
  levels: Just buddies, How I'm doing (7- and 30-day consistency, trend, longest current run, no
  habit names), My habits (chosen habits by name). New buddies start at How I'm doing. Private
  habits are never shown to anyone. Up to 50 buddies.
- **Replaces "misses are never shown to buddies"** (data-storage.md): a buddy should be able to
  notice someone struggling, so consistency is shown, but only as totals, never which days.
- **User tags instead of display names:** `name#TAG`, like a Valorant Riot ID, unique ignoring
  capitals, chosen the first time someone uses buddies or challenges, changeable any time, never
  searchable. Emails are never shown to buddies.
- **In the database:** buddies never read habit tables; one function per view checks the
  relationship and level on every call and returns only the totals allowed.
- **Nudges between buddies are out of the first version** (vision.md).

## D-030 Buddy and gang challenges
Accepted · 28 Oct 2026 · not built yet · plan: [buddies-and-notifications.md](buddies-and-notifications.md)

- **Decision (the owner's idea):** a challenge is a habit two people (buddy challenge) or up to ten
  (gang challenge) take on together, for a week, a month, a year or custom dates. Each member ticks
  their own, as a normal habit in their tracker; everyone in it sees everyone's progress on that
  habit only. Members don't have to be buddies; anyone in a challenge can invite with a link.
- The maker can rename it, extend it and remove members; the schedule is fixed once it starts.
  Anyone can leave; their ticks stay theirs.

## D-031 The crane note: the app's info popup
Accepted and built · 28 Oct 2026 · `src/ui/crane-note.js`, first used on the patch notes page

- **Decision (the owner's design):** features explain themselves with a crane note. A small paper
  crane beside a feature's heading opens it: a 3D paper crane flies in, unfolds into a square, turns
  over and opens into a letter from oze on why the feature exists. Closing folds it back into a
  crane that flies away. It is the default info popup for the app; buddies and gangs each get one.
- **Why:** the owner wants people to hear the maker's reasons for a feature, in the app's own
  language: paper that folds. It reuses the crane fold engine, so the folds are real.
- Reduced motion or no WebGL: the note just appears. Escape, ✕, the button or a tap outside close it
  at any point (a tap outside counts only after the first half second, so the second click of a
  double-click doesn't close it). Note texts are written in the code, never read from storage.
- **How the paper lands exactly on the letter:** the camera looks straight at a plane, so a square
  on it projects as a square; the crane is scaled so its sheet is as wide as the letter and placed
  under the letter's top square. The 3D canvas is hidden whenever nothing flies, so a frame left
  from a paused tab can't cover the letter. Three.js loads only when a trigger is hovered, focused
  or tapped. If the animation stalls (a background tab), it jumps to the letter after 4.5s and
  finishes closing after 3.5s.

## D-032 Patch notes, for people rather than developers
Accepted · 28 Oct 2026

- **Decision (the owner's):** a patch notes page (`/patch-notes`) telling people what was added
  and when, in a witty, friendly voice, with no technical detail. User-facing changes only;
  CHANGELOG.md stays the full record for the project.
- **One sheet per version,** newest first: a red hanko stamp with the number, the date, a title,
  a few lines, a katakana sticker. A "Next on the folding table" slip at the end, without dates.
  The text lives in `src/data/patch-notes.js` and is escaped when shown.
- **Versions:** the unreleased work was cut into 0.7.0 (24 October: accounts and sync) and 0.8.0
  (25 October: privacy), and this is 0.9.0. Each release adds a patch here and in the changelog.
- **Found from** the landing page's footer and "Next on the folding table" card, and the account
  chit, which marks "new" until this browser has opened the latest patch (a per-device key under
  `eightfold:v1:`, so removing your folds from a browser clears it too).
- **The voice still follows the design rules:** sentence case, no exclamation marks outside
  katakana stickers, every number says what it counts, a miss is never a failure.

## D-033 Light, warm and dark papers
Accepted · 28 Oct 2026

- **Context:** people look at screens most of the day and late into the night. The owner asked for
  a dark mode and a warm mode alongside the light one, kept in Eightfold's paper look, and built so
  future components get them for free.
- **Decision:** three themes on `<html data-theme>`: **Light** (unchanged), **Warm** (sepia, every
  surface with clearly less blue, brown-black ink) and **Dark** (warm charcoal, never pure black,
  off-white ink, sheets one step lighter than the ground, papers dimmed). Plus **Auto**, the
  default, which follows the device's light or dark setting and changes with it.
- **What the research supports, and what it doesn't:** dark surfaces should be dark grey, not
  black (Material's #121212), with lighter surfaces for nearer things and softer accent tones.
  Sepia pages (Kindle uses roughly #FBF0D9 with #5F4B32 text) reduce glare. But the evidence that
  filtering blue light prevents eye strain is weak (a 2023 Cochrane review of 17 trials found no
  short-term benefit), and dark mode reads worse than light mode in bright rooms. So the themes are
  offered as comfort for different rooms and hours, and Eightfold makes no health claims.
- **Built as a system, not a skin:** components use role tokens (`--bg`, `--sheet`, `--ink`,
  `--inverse`, `--on-color`, `--paper-ink`, `--accent`, `--link` ...), each theme sets them all,
  and coloured papers re-point the ink roles for everything placed on them. The old material names
  (`--washi`, `--sumi`, `--white-paper`) were used for several jobs each (white paper was both the
  panel surface and the text on red buttons), so they were replaced rather than redefined.
- **No flash:** `public/theme.js`, a plain blocking script (the CSP still forbids inline ones), sets
  the theme before any stylesheet loads. `src/lib/theme.js` keeps it in step with the device and
  other tabs, and updates the browser bar colour.
- **Saved per device** (`eightfold:v1:theme`), like reminders: the right paper depends on the
  room, not the account. Only the four known values are accepted.
- **Kept honest by a check:** scripts/check-themes.mjs (in `npm run check`) tests contrast for
  every text pair in every theme, that Warm has less blue, that each theme sets every role, that
  every page loads theme.js before its stylesheets, and that no stylesheet hard-codes a colour.

## D-034 Work goes through preview before main
Accepted · 28 Oct 2026

- **Context:** until now every branch went straight into `main`, which Cloudflare serves to
  everyone. The owner wants a stage between work and the live site, and only themselves able to
  push to `main` directly.
- **Decision:** a long-lived **`preview`** branch. Work branches open pull requests into
  `preview`; `main` takes pull requests only from `preview`. Two GitHub rulesets enforce it:
  - **main: releases from preview** — no deletion, no force push, a pull request required, and the
    CI checks "Check, build and audit" and "Release source" must pass.
  - **preview: pull requests only** — no deletion, no force push, a pull request required, and
    "Check, build and audit" must pass.
  - Both let the **repository admin** (the owner, the only collaborator) bypass them, so a direct
    push is still possible when needed.
- **"Only from preview" is a CI check**, because rulesets can't name a pull request's source
  branch. The "Release source" job fails a PR into `main` unless its head is this repository's
  `preview` (a fork's branch called `preview` doesn't count). Branch names reach the script
  through environment variables, so a crafted name can't inject shell commands.
- **Pull requests need no approving review**: GitHub doesn't let you approve your own PR, and
  there is one maintainer. The owner's "yes" in conversation is the approval (CLAUDE.md).
- **Limit:** GitHub can't tell the owner from Claude, since `gh` is signed in as the owner, who can
  bypass. So the rule for Claude is written in CLAUDE.md: never push to `main` or `preview`,
  always a pull request.
- **A preview site for `preview`:** Cloudflare Worker Previews (Wrangler 4.135+). `wrangler.jsonc`
  has a `previews` block (empty: same static files, no bindings), and the dashboard's Preview
  command is `npm run deploy:preview` (`scripts/deploy-preview.mjs`), which makes a Preview named
  `preview` only when `WORKERS_CI_BRANCH` is `preview` and skips every other branch, so work
  branches don't use up the account's Previews (100 on the free plan). The address is stable:
  `https://preview-onemorefold.<account subdomain>.workers.dev` (`/app` for the tracker).
  Production still deploys only from `main` with `npx wrangler deploy`.
  - workers.dev Preview URLs are public and send `X-Robots-Tag: noindex`; Cloudflare Access can
    put them behind a sign-in if that's ever wanted.
  - **The preview uses the live Supabase project** (same build variables, D-035). Signing in there reads and
    writes real accounts, so try risky changes there with a throwaway account. A separate
    Supabase project for previews is the fix if that becomes a problem.
  - Sign-in returns to `location.origin + /app`, so the preview address must be on Supabase's
    redirect list, or Supabase sends people to the live site instead.
  - Earlier branch builds (before 24 Oct) failed under the old preview model, and branch builds
    were then switched off; the dashboard steps are in CLAUDE.md under "Hosting".

## D-035 No env file in git; build settings are variables
Accepted · 29 Oct 2026 · replaces the committed `.env` of D-019

- **Context:** since D-019, `.env` was committed. It held only public values: the Supabase URL
  and the publishable key, which ship in the site's JavaScript anyway. A check refused anything
  secret-looking. The owner objected, rightly: a tracked `.env` normalises the most common way
  secrets leak, and one check is a thin wall against a future mistake.
- **Decision:** no env file is ever tracked. `.env` and `.env.*` are ignored, except
  `.env.example`, which lists the names with placeholder values. The hosted builds get the values
  as variables: Cloudflare Workers Builds' build variables (production and the preview branch)
  and GitHub repository variables for CI. Locally, copy `.env.example` to `.env`. Vite's `loadEnv`
  reads the process environment as well as files, so the build code is unchanged.
- **Guards:**
  - `check-security.mjs` fails if `.env`, `.env.local`, `.env.production` or the push secret files
    are tracked.
  - It checks `.env.example` (and a local `.env`) for public names and secret-shaped values.
  - The build stops with a message naming the missing setting.
- **History:** the old commit still shows the two public values. They're public by design, so the
  history wasn't rewritten. No secret was ever committed: the whole history of every env file was
  searched for secret-shaped values on 29 Oct.

## D-036 Open source under MIT; the owner's log stays for the story only
Accepted · 29 Oct 2026

- **Licence:** MIT, chosen by the owner, who has no plans to make money from Eightfold. AGPL was
  considered: it would only force hosted copies to publish their source, which doesn't stop a copy
  with ads or trackers. MIT is simpler and friendlier to contributors. Contributions come in under
  the same licence.
- **Not licensed:** the name "Eightfold", onemorefold.com, the crane mark and wordmark, and the app
  icons. They're reserved so a copy can't pass as this one. "The design concept" isn't reserved:
  ideas and styles can't be, and the concrete design is the licensed code.
- **The owner's habit log stays, for the landing page only:** it tells the owner's own story there,
  which they're happy to share. It moved from `seed.js` to `src/data/story.js`, and it's excluded
  from the licence by name: it's personal data, not code to reuse. `check-story.mjs` still checks
  the transcription against the sheet.
- **The checks no longer use it:** tests shouldn't depend on anyone's personal data. They run on
  `src/data/sample.js`, an invented year with everyday habits. It was generated once from a seeded
  random walk and written out as plain data. The counts the checks rely on are pinned, so every
  check kept its meaning: September's walk at 13 of 30, October's 80 of 132 boxes, January's 270%
  goal, and a few perfect days.

## D-037 Two sets of docs: public in git, private on the owner's computer
Accepted · 29 Oct 2026

- **Context:** the repository is public (D-036). Some notes shouldn't be: open security weaknesses
  (a public list of what isn't fixed is a map for attackers) and the owner's personal notes.
- **Decision:** public docs stay in `docs/` and the repository root. Private ones go in `private/`
  at the root, which `.gitignore` excludes and `check-security.mjs` refuses to see tracked. The
  first file is `private/security-open.md`. A fixed weakness moves from there to the public audit
  log. CLAUDE.md tells Claude to keep private things there and never quote them anywhere public.
- **Cost:** the private folder lives on one computer, outside git, so it has no history or backup
  unless the owner keeps one (for example a copy in a private cloud folder).

## D-038 The product is called One More Fold
Accepted · 30 Oct 2026 · replaces D-015

- **Context:** "Eightfold" is shared by several large products, so searching for it buried the
  tracker, and the name didn't match its address, onemorefold.com. D-015 had kept Eightfold for its
  story; in use, being found mattered more.
- **Decision:** the product is **One More Fold** in text and **onemorefold** as the wordmark (lower
  case, like the old one, and the same as the domain). The story carries over: fall seven times,
  rise eight is always one more rise than fall, and every tick is one more fold.
- **Kept on purpose:**
  - **Storage keys** (`eightfold:v1` and everything under it, `eightfold:parting`). Renaming them
    would make every browser's saved folds look empty; a migration would be risk for no visible
    gain.
  - **The service worker's message type** (`eightfold-remind`) and notification tag, so an old
    service worker and a new page still understand each other.
  - **History:** older decisions, changelog entries, released patch notes, and SQL migrations that
    already ran keep the name they had.
  - **The GitHub repository** stays `ozesince02/eightfold` until the owner renames it (GitHub
    redirects the old address). **Update, 30 Oct:** renamed to `ozesince02/onemorefold`; the
    links in the current docs follow it.
- **Changed:** every page, title and description, the wordmark, the web app manifest, the backup
  file name (`onemorefold-backup-...`; old files still load, since the content is checked, not the
  name), the Privacy and Terms pages (which say it was called Eightfold until 30 October 2026), the
  crane story's last chapter, and the public docs.
- **Outside the code** (the owner's dashboards): the Google sign-in consent screen's app name, the
  Supabase sign-in email templates and sender name, the repository's name and description.

## D-039 Done and Later on reminders sent with the app closed
Accepted · 1 Nov 2026 · plan: [buddies-and-notifications.md](buddies-and-notifications.md), setup: [push-setup.md](push-setup.md)

- **Decision:** each reminder from `send-reminders` carries a one-time token. The service worker
  shows Done and Later only when the token and the address it goes to look right, and posts the
  token to a new Edge Function, `act-reminder`, which calls `act_on_reminder()` in the database.
  - **Done** ticks that habit for that day. An open tab ticks it locally at the same moment, so
    the screen updates without waiting for sync.
  - **Later** marks the reminder to be sent again on the next half-hourly run if it's still due
    and not ticked, as "Still to do", with a new token. At most three sends of one reminder.
- **The token is the whole permission:**
  - 32 random bytes, of which only the SHA-256 is stored;
  - it travels only inside the notification, which is encrypted for the person's devices;
  - it works once (it's marked used in the same statement that checks it), and expires after 36
    hours;
  - it can only tick or snooze that one habit on that one day.

  `act-reminder` runs without JWT checks because a service worker has no session.
- **Why not sign in instead:** the browser's push service delivers to a service worker that can't
  reach the session in the page's storage, and a long-lived credential in the notification would
  be worth stealing. A one-time token isn't.
- **Not on iPhone and iPad:** Safari doesn't show actions on web notifications; tapping opens the
  app as before.
- **Limits:**
  - **Other devices:** a Done made on the server reaches them on their next sync (when they open
    or every few minutes), not instantly. The server doesn't broadcast it.
  - **The 30-minute job:** Later waits for the next run, so it means "within half an hour".

## D-040 The noren (site notices) and link previews
Accepted · 1 Nov 2026

- **Context:** One More Fold is free, with no ads or tracking, but newcomers didn't learn that from
  the front page. The owner wanted a notice that sits apart from the page's story, can be changed
  or taken down later, and fits the paper style rather than a sale banner.
- **Decision: a noren.** A shop curtain hangs under the landing page's header. A noren out front
  means "we're open", and shops change it for seasons and occasions, which is what this is for.
  - **Settings:** everything lives in `src/data/bulletin.js`: on or off, an id, an optional last
    day, one to four short phrases (one per strip), and an optional link to one of the site's own
    pages (named, never an address).
  - **Closing:** the ✕ hides it on that device for that id only, so a new message (new id) hangs
    again. It's stored under `eightfold:v1:`, so "remove my folds" clears it too.
  - **Movement:** it sways once as the page opens; on phones the strips join into one.
  - **Safety:** the text is written in the code and escaped when shown.
  - First message: free for everyone, no ads, no tracking, built for the community.
- **Link previews:** `public/og.png` is a 1200×630 card (the crane under the red sun, the name,
  "Fall seven, rise eight", "Free · no ads · no tracking").
  - **How it's made:** drawn in `scripts/og-card.html` with the site's own fonts and rendered by
    `npm run og` (headless Edge or Chrome, with the dev server running).
  - **Tags:** every public page has Open Graph tags, `twitter:card` `summary_large_image` and a
    canonical address. `check-security.mjs` checks the card is named, on our own domain.
  - **Wording:** the homepage description now says "free" and "no ads, no tracking", since it's
    the text under the card.


## D-041 Today is due from the start of the day; Due shows what's left
Accepted · 2 Nov 2026 · changes part of D-006 and D-013

- **Context:** on 2 November the owner had six daily habits, five done on the 1st and two so far
  on the 2nd. This month said "7 of 8": today only joined the count once ticked (D-006), so the
  four still open today were left out and the figure looked better than the day was going. The
  month grid's Due column showed 1 for a habit with a goal of 20 done once, because it counted the
  days due so far; the owner read Due as what's still to do, which is the useful number.
- **Decision:**
  - **Days view:** a fixed due day counts from the start of that day, ticked or not. Six daily
    habits on the 2nd are 12 due. Days still to come stay out, unless one is ticked ahead.
  - **Runs don't change:** an unticked today still never breaks a run until the day is over.
  - **Weekly and monthly habits don't change:** the current week or month counts only what's done,
    since any day in it can still do it.
  - **Due column (Days view):** the goal minus what's done this month (completed units, as Left
    in the Goal view), never below 0.
- **Consequence:** early in the morning the Days figure drops, then climbs as habits are ticked.
  October in the example year reads 58% (80 of 138) on the 23rd instead of 61%.
- **Checks:** `scripts/check-stats.mjs` (including the owner's 2 November case).

## D-042 A daily summary and a weekly recap, with the app closed
Accepted · 3 Nov 2026 · plan: [buddies-and-notifications.md](buddies-and-notifications.md) §2, setup: [push-setup.md](push-setup.md)

- **What they say:** `src/lib/summaries.js` works it out from the same `monthStats` and
  `streakOf` the tracker shows, so a notification never disagrees with the app. The sender runs an
  exact copy (`npm run shared`).
  - **Daily:** today's "done of due" (the month grid's day: habits due today, plus flexible ones
    ticked today), the best day-run still going, and a line chosen by how the day went. A zero day
    gets "Fall seven, rise eight", never a list of misses. No summary on a day with nothing due.
  - **Weekly (Sundays):**
    - the last seven days' done of due, with the percentage saying what it counts;
    - the week before, for comparison;
    - perfect days, and the most-folded habit.
- **When:** on the run whose half hour holds the person's chosen time, in their own time zone (a
  late run still counts), once a day each, recorded in `push_log` as `daily` or `weekly`. Times are
  on the hour or half hour (17:00 to 23:30) because the sender runs at :00 and :30; the database
  refuses others.
- **Where:** to every device with closed-app reminders on. Both switches live in `push_settings`
  (off by default) and show in the Reminders panel once that device is on. A summary works even
  with habit reminders switched off; the sender now reads anyone with any of the three on.
- **Looking back:** the sender reads this month and the one before. A run that reaches back to the
  start of that window is "more than" its length, rather than a number that might be short.

## D-043 Reminders with the app closed are on by default, where they can be
Accepted · 4 Nov 2026 · changes D-028's "each device opts in"

- **Context:** existing users never discovered closed-app reminders. They were tucked inside the
  Reminders panel, behind a switch nobody went looking for.
- **The limit:** a browser sends a site's notifications only after the person on that device has
  allowed them, from a tap on the page. No site can switch that on by itself, so "on by default"
  can only mean as far as the browser allows.
- **Decision (src/lib/push-default.js):**
  - **Already allowed:** closed-app reminders switch on without a prompt when all of these hold:
    - the device is signed in;
    - this site's notifications are already allowed;
    - in-tab reminders are still on in this browser;
    - no other account had them switched on here first.

    Permission belongs to the browser, not the account, so the last rule (the browser's "owner")
    keeps the next person on a shared computer from being signed up silently. A note says so at
    that moment ("Turn them off any time under Habits, Reminders"). Turning them off is remembered
    per account in that browser. "Remove my folds" resets in-tab reminders too, so they can't come
    back on that way either. (From the review of 4 Nov.)
  - **Not asked yet:** where the browser hasn't been asked, a slip above the current month offers
    them in one tap, with "Remind me in 3 days" instead of "Not now". It needs a habit with a time.
    It never shows once notifications are blocked or after someone turned reminders off.
  - **Choices are per device,** under `eightfold:v1:`, so "remove my folds" clears them.
- **Not changed:** the daily summary and weekly recap stay off until chosen. A nightly message nobody
  asked for is how people end up blocking a site's notifications altogether.
- **Privacy:** the Privacy page says when they come on by themselves and how they stay off.
- **The noren** now holds several notices that take turns, every 9 seconds, with the lift-and-sway
  animation (none for reduced motion). It pauses while pointed at or focused, as anything that
  changes by itself must. A notice drops out after its last day. Closing it lasts one visit; the
  next visit hangs it again, so nothing is stored any more (the old "closed" key is cleared).


## D-044 Flock: where buddies and gangs live, and how they look
Accepted · 11 Nov 2026 · builds on D-029 and D-030

- **Context:** before building buddies and gangs, the owner wanted to see where they'd sit and how
  they'd look. Three directions each were sketched; the owner picked name cards for buddies and,
  for gangs, one shared crane plus a banner of stamps.
- **Decision:**
  - **A fourth tab, "Flock".** Cranes fly in flocks; it's one short word that reads at a glance
    beside Month, Year and Habits. "Together" was too generic, "Nakama" too hard to decode as a
    tab name, so ナカマ became the page's sticker instead.
  - **The hanko** (a round seal of your `TAG`) is the one mark for a person throughout Flock.
  - **Buddies are meishi;** adding one is handing over your card.
  - **A gang folds one crane together** and keeps a **stamp banner** day by day, which becomes a
    keepsake on the Year view when the challenge ends.
  - **The gang names who hasn't folded yet today.** Softer options (counts only) were offered; the
    owner wants members to see it, as with buddies noticing someone has gone quiet (D-029).
- **Not changed:** buddies still see totals and trends, never day grids; a gang member sees only
  that gang's habit; nothing in a shared link's preview identifies the sender.
- Details in [buddies-and-notifications.md](buddies-and-notifications.md), "The look: Flock".


## D-045 Buddies: what's stored, and who works out the figures
Accepted · 11 Nov 2026 · builds on D-029 and D-044

- **Context:** a buddy at "How I'm doing" or "My habits" sees totals ("18 of 24 due, last 7 days"),
  the trend and the longest run going. Working those out needs the schedule rules (rest days,
  times a week, today counting from the morning, D-041), which live in `stats.js`.
- **Decision: your own device works out your figures** with the tracker's maths
  (`figuresOf()` in `src/lib/buddies.js`) and keeps one row, `buddy_figures`, up to date when you
  use One More Fold. Only `my_buddies()` reads it, for your buddies, and only as far as each one's
  level allows. Rewriting the schedule rules in SQL would have made a second copy that could
  disagree with the tracker; an Edge Function would have needed the service role to read other
  people's habits.
  - **The cost:** figures stop moving while someone isn't using the app. Every card says "as of"
    its date when it isn't today, which is honest, and says on its own that a buddy has gone quiet.
    Later, the 30-minute job could refresh them.
  - **Only what's needed is stored:** nothing at all while nobody is shown any figures; habit names
    only for habits picked for some buddy at "My habits", never a private one. The database drops
    private habits again when it answers.
  - **Self-reported:** someone could publish untrue figures about themselves. That only misleads
    their own buddies about their own habits, as untrue ticks would.
- **The rest, as planned (D-029):**
  - **Tags:** `name#CODE` on `profiles`, unique ignoring capitals. The database refuses symbols,
    emoji, invisible and direction-changing characters, and names that pass as the team.
  - **Invites:** a one-time card. The secret (32 random bytes) travels after `#`; only its SHA-256
    is stored. It's good for 7 days, with at most 10 open.
  - **Pairs:** two rows per pair, one per direction, made only by `accept_invite()` and removed
    only by `remove_buddy()`. A pair counts only while both rows exist.
  - **Defaults:** the sender starts at "How I'm doing", and the person accepting picks their level
    on the card.
  - **Limits:** 50 buddies.
  - **Private habits:** a `private` column on `habits`, synced like the colour.
- **Release order:** the migration (`20261111120000_buddies.sql`) must be run before the site that
  uses it ships. Syncing writes the new `private` column, so the old database would refuse it.


## D-046 Gangs: a habit linked to the gang, ticks read live
Accepted · 12 Nov 2026 · builds on D-030 and D-044

- **Context:** a gang shows today's crane, who hasn't folded yet, a banner of daily stamps and each
  member's figures. Unlike a buddy's totals, that needs day-level ticks on one habit, as they
  happen.
- **Decision: your part of a gang is one of your habits,** linked to it (`habits.challenge_id`).
  - **Reading:** `my_gangs()` returns, for the gangs you're in, each member's ticks on their linked
    habit between the gang's dates. It returns nothing from any other habit, and nothing from a
    habit marked private. The app works out the crane, the stamps and the figures from those ticks
    with the tracker's own schedule maths (`src/lib/gangs.js`), so it never disagrees with
    anyone's grid.
  - **Linking:** you can link a habit only to a gang you're in, and only one per gang. Anything
    else is quietly unlinked by the database rather than refused, so a device that hasn't heard you
    left can still sync the rest of the tracker.
- **The gang's rules (D-030):**
  - **Size:** 2 to 10 members, at most 20 gangs a person.
  - **Dates:** a week to a year, starting between today and a month ahead.
  - **Schedule:** any of the tracker's schedules, fixed once started.
  - **Owner:** the person who starts it can rename it, make it last longer (never shorter) and
    remove people. When the owner leaves, whoever has been in longest takes over; when the last
    person leaves, the gang is gone.
  - **Joining:** with a gang card, the same one-time link as buddies (members needn't be buddies).
    Joining adds the habit to your tracker. Leaving unlinks it; the habit and its ticks stay yours.
- **Who hasn't folded:** named on the gang in Flock, as the owner asked (D-044). Only members with
  a linked habit count, and only on days the schedule asks for a fold. Flexible schedules count
  "this week" or "this month".
- **Cards hashed by the database:** the browser now sends the card's secret, and the database
  stores its SHA-256. A stored hash can no longer be used in place of the secret (review of
  11 Nov 2026).
- **Not in this step:**
  - the closing card when a gang ends, and its banner kept on the Year view;
  - gangs in the daily summary;
  - a push when the gang's crane is done.
- **Release order:** run `20261112120000_gangs.sql` before the site that uses it ships. Sync writes
  `habits.challenge_id`, and the card functions change their arguments.


## D-047 When a gang ends: a certificate, and a stamp book on the Year
Accepted · 13 Nov 2026 · builds on D-046

- **Context:** the gang plan (D-030) promised a closing card and the gang's banner kept as a
  keepsake. Three directions each were mocked; the owner chose A (the certificate) and 2 (the
  stamp book).
- **Gang cranes:** the days everyone in the gang folded, or the weeks or months for flexible
  schedules. Each person counts from the day they joined, and only with their habit linked. Every
  number says what it counts: "11 of 30 days everyone folded".
- **The certificate** (a shojo): when a gang's last day has passed, its card in Flock turns into a
  certificate with a double red frame. It shows シュウリョウ ("completed"), the gang, the days
  everyone folded, and each member's seal and figures, in the order they joined (never ranked).
  - "Keep it on my Year" saves the keepsake and leaves the gang.
  - "Fold it again" does the same, then opens the start form filled in with the same habit and
    schedule.
  - The habit stays in your tracker either way.
- **The stamp book** (a goshuin-cho, the book pilgrims fill with temple seals): a panel on the Year
  view with a page per gang that ended that year. Each page has the gang's name, its dates,
  everyone's seals and the days everyone folded, on kraft covers.
- **Keepsakes are your own copy** (`gang_keepsakes`). They stay after everyone has left and the
  gang is gone. Only you read yours.
  - **Shape:** checked by the database.
  - **Changes:** none. A keepsake is kept as it was; you can only put one away.
  - **Limit:** 100 a person.
  - **Like a group photo:** a keepsake keeps the other members' tags and figures from that gang,
    even after they leave or delete their account. The Privacy page says so (review of 13 Nov).
- **Not built:** gangs in the daily summary, and a push when a gang's crane is done. The open
  question (should a summary name who hasn't folded?) still stands.
- **Release order:** run `20261113120000_gang_keepsakes.sql` before the site that uses it ships.


## D-048 Flock as shelves of upright scrolls
Accepted · 13 Nov 2026 · changes how D-044 lays out Flock

- **Context:** the owner wanted Flock to feel like a place rather than a page of cards: gangs and
  buddies as big rolled scrolls standing upright on wooden shelves, like the big scrolls carried in
  Naruto. A first mockup drew flat hanging scrolls by mistake; the second, upright rolls, was the
  one.
- **Decision:**
  - **A shelf per panel** (Gangs, Buddies). Each gang and each buddy is a roll standing on its end
    at a slight, steady tilt (worked out from its id, so it doesn't jiggle on every redraw).
    - **On the roll:** a name label down the front (cut short when long); a cord in its paper
      colour; a seal at the foot (a buddy's code, or a gang's day: "2/3" folded, "rest", "soon",
      "done").
    - **At the end of each shelf:** a blank dashed roll ("New gang", "New buddy") that unrolls into
      the start form or the card to hand over.
  - **Unrolling:** the roll stays standing at the left, the paper comes out to the right (a
    transition on its width), and the rolls after it slide to the end of the shelf (GSAP Flip).
    Closing rolls it back.
    - **One scroll open at a time** across the page.
    - **More than fits:** more rolls than a shelf holds go on another shelf below.
  - **Pulled out:** when the open scroll can't fit on its shelf (most phones, a full shelf), it's
    pulled out and unrolls on its own in a dialog over the page. Escape, a tap outside or "Roll it
    up" puts it back.
  - **Wood:** the shelves and knobs use new tokens (`--wood`, `--wood-top`, `--wood-under`,
    `--wood-knob`), tuned for each paper and dimmer at night.
- **Not changed:** what a gang or buddy shows inside its scroll, and the "Your card" panel.
- **One height (13 Nov, from the owner):** a shelf and every scroll keep one height, open or rolled
  (270px). An open scroll's contents sit in sections side by side (`.sheet-cols`): a gang's today,
  stamps and settings; a buddy's figures, shared habits and sharing. The paper is as wide as its
  sections up to the room the shelf has, and scrolls sideways past that. A tall section, such as
  ten members' stamps, scrolls within its own column.
- **Accessibility:** each roll is a button (`aria-expanded`, `aria-controls`), and a rolled sheet
  is `inert`. The pulled-out scroll is a real modal dialog, and with reduced motion nothing slides
  or unrolls.


## D-049 Reordering habits: a calm list to drag
Accepted · 13 Nov 2026

- **Context:** moving a habit meant pressing up or down on its full editor row, one step at a time,
  among names, times, goals and schedules. The owner asked for a separate, consolidated view.
- **Decision:** "Reorder habits" above the list switches the Habits page to only the names, in
  order, each with its colour, a grip and up and down arrows. "Done" switches back.
  - **Dragging:** pointer events, so a mouse, a pen or a finger all work. A row is picked up, the
    others make room, and letting go saves the new order once (`store.reorderHabits`). With a
    mouse the whole row can be dragged; on touch only the grip, so the list still scrolls. Near the
    window's edge the page scrolls along.
  - **Keyboard:** the arrows move a habit one place, and focus stays on the arrow you pressed.
  - **The editor rows** lose their up and down buttons: reordering has its own place now.
- **Scope:** the order is per month, like everything on the Habits page.

