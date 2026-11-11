# Vision

Where One More Fold could go. These are ideas, not promises: add freely, date them, and move one into
[decisions.md](decisions.md) and the [CHANGELOG](../CHANGELOG.md) when it gets built.

## North star

A habit tracker for people who have started over many times. It should make showing up feel like
making something (folds, cranes, a year of paper) rather than filling a spreadsheet, and treat a
missed day as a fall to get up from, never a failure.

## Ideas

### A month you fold into an origami (23 Oct 2026, from the owner)
As you tick habits through the month, a 3D origami model assembles in the Month view: each tick a
fold, each week a stage, the full model at month end. How full it is shows how the month went.
- Let people pick their origami from a set (crane, frog, lotus, fox, boat, butterfly), or cycle
  through them so every month gets a different one.
- At year end, a shelf of twelve models: the year at a glance, in paper.
- A perfect month could earn a special paper (gold, patterned washi).
- Builds on the existing fold engine in `src/three/crane.js`, which already folds a model in
  stages from a flat crease pattern. Each new model is a new set of triangles and fold stages.

### Reminders that arrive with the app closed (planned 27 Oct 2026)
Web Push from a job that runs every 30 minutes, plus a daily summary and a weekly recap, each
switched on or off separately. Native notifications in the phone app later. Design:
[buddies-and-notifications.md](buddies-and-notifications.md).

### Phone apps (Android and iOS)
Wrap the web app with Capacitor: same code, native notifications, home-screen widget for today's
habits.

### Accounts and sync for family and friends
Sign in with an email link or Google; the same data on phone and laptop. Plan in
[data-storage.md](data-storage.md).

### Opt-in buddies and challenges (23 Oct 2026, from the owner; planned 27 Oct 2026)
Accounts start private. Add several buddies you know in real life, by invite link (no search, no
community, no chat), and choose for each how much they see: nothing, how consistent you are, or
chosen habits by name. A buddy who sees you struggling can reach out in person. Remove a buddy at
any time. **Challenges:** a habit two people, or a group of up to ten, take on together for a
week, a month or a year, each ticking their own. Design:
[buddies-and-notifications.md](buddies-and-notifications.md).
- Later still: a family circle with one shared thousand-crane wish.

### Nudges between buddies (27 Oct 2026, from the owner; not in the first version)
A buddy could send a nudge when a habit isn't ticked yet. Left out for now: the other person may
already be doing it and just hasn't ticked, and repeated nudges would irritate more than help.
Buddies know each other and can reach out directly.

### Weekly and monthly goals, and habits on chosen days (23 Oct 2026, from the owner) — built 24 Oct 2026, D-013
Daily habits are short-term goals; weekly and monthly ones are the long-term goals. And some habits
only belong on certain days.
- **Habit cadence:**
  - **Daily** (today's kind).
  - **On chosen weekdays:** for example only Monday and Wednesday. The month grid shows boxes
    only on those days; other days are blank, not misses.
  - **N times a week**, any days: for example gym 3 times a week. One box per day, and the week
    counts as done at 3.
  - **Weekly task:** one thing to finish once in a week ("plan the week", "long run").
    Shown as one box per week.
  - **Monthly task:** one thing to finish once in a month ("read one book", "review finances").
    One box for the month.
- **In the UI:** a short-term / long-term split. Today's checklist shows only what's due today;
  a "This week" and "This month" strip holds the longer goals. The grid only draws boxes where a
  habit is due, so a Monday-and-Wednesday habit never looks like it failed on a Tuesday.
- **In the numbers:** "days so far" becomes "due days so far" (D-006 already counts only tracked
  days, so this extends it). Streaks count consecutive *due* days, or consecutive weeks for weekly
  goals. The goal view's default goal becomes the number of due days in the month.
- **In the data:** each habit-month gets a `cadence` and a schedule; ticks stay one row per day,
  with weekly and monthly tasks ticked on the day they're done. See
  [data-storage.md](data-storage.md), data model.
- Reminders follow the schedule: no nudge on a day the habit isn't due.

### Private names: end-to-end encryption (25 Oct 2026, from the owner) — parked 26 Oct 2026
Habit names, wishes and times encrypted in the browser before they sync, so nobody with database
access, the owner included, can read them. Until then the Privacy page says plainly that the owner
can technically reach the data and looks only on request.
- **How:** the browser's own AES-256-GCM (WebCrypto), with a key made on the device that never
  reaches the server. Encoding (Base64) or encrypting on the server with a key we hold were ruled
  out: neither stops the person who runs the service.
- **Why parked:** people use One More Fold on several devices at once, and every device needs the same
  key without the server ever having it (a recovery code, scanning a QR code from a signed-in
  device, or later passkeys). That's too much for now.
- **Costs to settle when it comes back:** a lost key and lost devices mean lost names (ticks
  survive); closed-app reminders can't name the habit unless the device decrypts them; buddies
  would need a shared key; existing names must be encrypted in place; dates of ticks stay visible.
- **Design before buddies and closed-app reminders**, since both change once names are encrypted.

### Kintsugi days
A missed day inside a long run is mended with a gold seam instead of breaking the streak, at most
once a week. Fall seven times, rise eight, as a mechanic.

### Weekly recap
A paper card every Sunday: folds made, best habit, the week's crane, ready to save or share.
Announced by the weekly recap notification ([buddies-and-notifications.md](buddies-and-notifications.md)).

### Year in folds: a recap, and years side by side (24 Oct 2026, from the owner)
A year-end recap in the spirit of Spotify Wrapped, made of paper: a short sequence of cards to tap
through in December, ending on the wish. Ideas for cards: total cranes and what that is in paper
(a stack as tall as...), the habit you folded most, the longest run and when it happened, the best
month and the hardest one you came back from, your most consistent hour, perfect days, the day of
the week you never missed. Saved as images to share, with habit names optional (privacy first).
Plus **comparisons between years**: 2027 against 2026 per habit, month by month, as two mountain
ranges laid over each other. "Fold the year" (D-017) is the first step and already shows a short
look back; the data is ready for this (habit ids stay the same across years).

### Wish at 1,000
When crane 1,000 is folded, the wish written on the Habits page is revealed on a big paper scroll.

### A quote for the day (27 Oct 2026, from the owner)
A motivating quote, phrase or statement on the tracker, each with a small picture of what it
stands for, in paper art or pixel art.
- **A finite, hand-picked list.** The words already in D-015 are a natural start: "thoughts become
  things", "one bite at a time", "to lose patience is to lose the battle", *Make Your Bed*,
  *Ikigai*, "fall seven, rise eight".
- **Your own words too:** people can add quotes they believe in, the ones that work for them.
- **To decide later:** a new quote each visit, or one per day (a quote of the day); where it sits
  on the page; paper art or pixel art, or both.

### Tick styles: more than boxes (11 Nov 2026, from the owner)
A person looked at the month grid and asked "what is this, so many boxes? I want to get rid of
them." So: a choice of how a tick looks and feels, with two or three styles besides the box, picked
in the account chit next to Paper.
- **Kyudo (the owner's idea):** each empty day is a small black-and-white target (a mato, from
  Japanese archery). Over a target the pointer becomes an arrow; a click looses it, the arrow flies
  in and lands, and the target fills with the habit's colour.
- **Hanko:** an empty day is a faint dotted circle; a tick stamps a seal in the habit's colour,
  tilted a little differently each time, like a real stamp. It pairs with the hanko of Flock (D-044).
- **Daruma:** each empty day is a daruma's blank eye; a tick paints it in. The daruma is the doll of
  "fall seven times, rise eight", so this one carries the whole idea of One More Fold.
- **Fold:** a flat square of washi; a tick folds its corner over (or into a tiny crane), the most
  literal "every tick is a fold".

The complaint is partly about how many there are, not only their shape, so pair the styles with a
**quiet grid** option: days to come drawn as faint dots rather than boxes, or hidden; rest days
blank; only the days so far fully drawn. That halves what's on screen early in a month, whatever
the style.

To keep in mind when building:
- the box stays the default, and the style is per device, like Paper;
- every style works with a keyboard and a screen reader exactly as the box does (a button with
  aria-pressed); the arrow cursor is decoration, and on touch, where there's no pointer, the arrow
  flies in from the edge;
- with reduced motion, nothing flies: the target, seal or eye simply fills;
- empty states still need 3:1 contrast in Light, Warm and Dark;
- animate only the tapped cell, so a month of 30 habits stays smooth;
- a custom cursor as an SVG data URI is allowed by the current CSP (`img-src data:`).

### Habit templates
Start a new month or a new person from a template: "morning routine", "DSA prep", "language".
