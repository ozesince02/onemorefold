# Buddies, challenges and notifications

Status: **agreed 28 October 2026, not built yet.** Written 27 October 2026 from the owner's ideas;
the open questions were settled on 28 October (D-028 to D-031 in [decisions.md](decisions.md)).
Builds on [data-storage.md](data-storage.md) (accounts, sync, the tables) and
[security.md](security.md).

## The idea, in short

One More Fold helps people build habits together, without becoming a social network.

- **Buddies:** add several people you already know. For each buddy, choose how much they see:
  nothing, how consistent you are, or chosen habits by name. Everyone appears by a **user tag**,
  like a gamer tag (`oze#1000`).
- **Challenges:** a habit two people (a **buddy challenge**) or a group of up to ten (a **gang
  challenge**) take on together ("run every day in November"), each ticking their own progress,
  everyone seeing everyone's progress on that one habit.
- **A note from the folding table:** each of these features carries a small crane. Tap it and a
  paper crane flies in and unfolds into a note from the person who made One More Fold, on why the
  feature exists (section 5).
- **Notifications with the app closed:** habit reminders, a daily summary and a weekly recap, each
  switched on or off separately.

**Not in this version:** finding people in the app, a community, chat, nudges between buddies,
blocking (removing is enough), end-to-end encryption (parked, see [vision.md](vision.md)).

The goal throughout: support, not monitoring. Nobody should feel watched, pressured, or flooded
with notifications.

## 1. Notifications with the app closed

### How they reach a closed app
- **Web Push.** When someone turns on "remind me even when One More Fold is closed", the browser gives
  us an address for that device (a push subscription). It's stored in their account, one row per
  device. Our server sends a message to that address; the browser's push service (Google, Apple
  or Mozilla, depending on the browser) delivers it, and our service worker (`public/sw.js`) shows
  it. The message is encrypted for that device on the way, so the push service can't read it.
- **The sender:** a Supabase Edge Function, started by Supabase Cron.
- **iPhone and iPad:** Web Push works only after One More Fold is added to the Home Screen (iOS 16.4
  and later). We'll need a web app manifest (there isn't one yet) and a short "add to Home Screen"
  guide shown on iPhones.

### Every 30 minutes, not every minute (the owner's call)
The job runs at :00 and :30. Each run sends reminders for habits due in the next 30 minutes, so a
reminder arrives up to 30 minutes early:

| Habit time | Reminded at | How early |
| --- | --- | --- |
| 07:00 | 06:30 | 30 min |
| 07:15 | 07:00 | 15 min |
| 07:30 | 07:00 | 30 min |

- The window is "after this run, up to and including the next half hour", so no time falls
  between two runs or into both.
- The notification names the time ("German at 7:00"), not "in 30 minutes", because how early it
  arrives varies.
- The existing "how early" setting (lead) doesn't fit 30-minute steps; the closed-app reminder
  replaces it. The in-tab reminder keeps working as today for anyone without push.
- If people want exact times later, the job can run more often; nothing else changes.

### Getting it right: no duplicates, nothing stale
At send time, the function re-reads the habit for that day and sends only if it is still:
- due today by its schedule (rest days, weekly and monthly goals already met: the same rules as
  [reminders-core.js](../src/lib/reminders-core.js), shared rather than rewritten);
- not ticked;
- not deleted or switched off, and with the same time (a habit moved from 7:00 to 9:00 is reminded
  at 9:00);
- not already sent: a `sent` log keyed by user, habit and day, so a retry or an overlapping run
  can't send twice.

Also:
- **One reminder per habit per day**, plus a cap per person per day (say 30) as a safety net.
- **No doubles with an open tab:** on a device with push on, the tab stops showing system
  notifications and only shows the paper note while it's in front.
- **Time zones:** each account stores its time zone (from the browser), updated when it changes.
  "Today" and "7:00" are always in the person's own time zone, daylight saving included.
- **Dead devices:** when the push service says an address no longer exists, its row is deleted.

### Done and "Later" from a closed app
**Built 1 November 2026 (D-039).** Tokens last 36 hours rather than to the end of the day, and a
reminder can be put off at most twice (three sends). The rest is as planned:

The buttons need to work without the app open or anyone signed in. Each notification carries a
single-use token that allows exactly one thing (tick this habit today, or snooze it once) and
expires at the end of the day. The tick is written on the server and reaches the app through
sync the next time it opens.

"In 10 minutes" with a 30-minute job: the snooze is honoured by the next run, so in practice it
becomes "later" (up to 30 minutes). Label it "Later" rather than promise 10 minutes.

### Reminder settings move to the account
Today, reminder settings live on each device ([data-storage.md](data-storage.md), "Not in the
cloud"). The server needs to know which habits to remind, so the settings move into the account:
on or off overall, per habit, and for the summaries. Which devices receive them stays per device
(each device subscribes or not).

## 2. Daily summary and weekly recap

A reminder says what to do; a summary says how it went.

- **Daily summary**, at a time each person picks (default 21:30): today's due habits done, for
  example "4 of 6 done today", the run that's still going, and a short line of encouragement that
  fits the day. Never shaming: a hard day gets "fall seven, rise eight", not a list of failures.
- **Weekly recap**, on Sunday at the same time: planned sessions done ("24 of 30 this week"), the
  rate against last week, habits that improved, milestones (a new longest run, a perfect week,
  crane 500). Tapping it opens the weekly recap card from [vision.md](vision.md).
- **Separate switches:** reminders, daily summary and weekly recap can each be on or off. All off
  by default; turning any on asks for notification permission.
- **Every number says what it counts** (D-006): "4 of 6 due today", never a bare 67%.
- **The numbers come from [stats.js](../src/lib/stats.js)**, run by the Edge Function, so a summary
  always matches what the app shows.
- **Later:** the same summaries can include challenges ("Run club: 4 of 5 ran today") and buddies,
  within what each person shares.

## 3. Buddies

### Adding a buddy
There's no search: you can only add someone by sending them a link.
- **Invite link:** "Add a buddy" makes a one-time link to send however you like (WhatsApp, in
  person). It expires after 7 days or once used. The secret part sits after `#` in the address,
  so it never reaches server logs; only a hash of it is stored.
- **Both sides agree:** opening the link and signing in shows who invited you; you accept or
  decline. Accepting makes you each other's buddy.
- **Limits:** up to 50 buddies and 10 unused invites at a time.

### What a buddy sees
Each person chooses, for each buddy, one of three levels. The two sides choose separately: I can
share my habits with you while you share only your consistency with me.

| Level | Your buddy sees |
| --- | --- |
| **Just buddies** | That you're buddies, and your name. Nothing about your habits. |
| **How I'm doing** | Your consistency: due habits done over the last 7 and 30 days ("18 of 24 due, last 7 days"), whether it's rising or falling, and your longest current run. No habit names. |
| **My habits** | The above, plus the habits you pick for that buddy, each with its name and progress this month ("German: 12 of 18 due"). |

- **Private habits:** any habit can be marked private, and is then never shown to any buddy at any
  level, nor counted by name.
- **Default for a new buddy:** "How I'm doing". You can change it at any time, for each buddy.
- **Tags, not emails:** buddies see your user tag (below). Your email is never shown to them.
- **Figures, not grids:** buddies see totals and trends, never day-by-day grids, times or wishes.
  This changes an earlier rule ("misses are never shown to buddies", [data-storage.md](data-storage.md)):
  the owner wants a buddy to notice when someone is struggling, so consistency is shown, but only as
  a total over days, never as a list of the days that were missed.

### User tags
Inspired by gamer tags (Valorant's Riot ID): a name and a short tag, joined by `#`.

- **Shape:** `name#TAG`, for example `oze#1000` or `Asha Rao#RUN`.
  - **Name:** 3 to 16 characters: letters (any language), numbers and single spaces, not starting
    or ending with a space.
  - **Tag:** 3 to 5 letters or numbers, shown in capitals. Suggested at random (four digits), yours
    to change.
- **Unique:** no two people share the same name and tag (ignoring capitals), so two Rahuls in one
  gang can be told apart.
- **Chosen when you first need it:** the first time you open Buddies or join a challenge. Nobody is
  given a tag made from their email or Google name.
- **Change it any time,** from the account chit. Buddies and gangs see the new one straight away.
- **Not searchable.** Adding someone still takes an invite link; nobody can look you up by tag.
  Picking a tag can show that a tag is taken, which says nothing else about anyone.
- **Not allowed:** invisible or direction-changing characters, emoji, and names that pass as the
  team: `eightfold`, `onemorefold`, `admin`, `support`. Checked in the browser and again by the
  database.
- **In the database:** two columns on `profiles`, with a unique index and the same checks as
  constraints. Only you can read your own profile; buddies and gang members get your tag through the
  functions below, never the table.

### Stopping
- **Stop sharing:** set a buddy to "Just buddies".
- **Remove a buddy:** either side, at any time. It takes effect at once, for both: neither sees
  anything about the other from then on. They aren't told, and can only be added again with a new
  invite.

### How it stays safe in the database
- Buddies never read the habit tables directly. A buddy's view comes from one database function
  that checks the relationship and the sharing level on every call, and returns only the totals
  that level allows. The table rules for habits and ticks stay "your own rows only".
- New tables: `buddies` (two people, when they connected) and `buddy_sharing` (for each person and
  each buddy: the level and the chosen habits), plus `invites`. Each with row-level security and
  database checks, as for the existing tables.
- Tested on the PGlite stand-in like the rest: a stranger sees nothing; a removed buddy sees
  nothing; "How I'm doing" never returns a habit name; a private habit never appears.

## 4. Buddy and gang challenges

One idea covers both: a buddy challenge is a challenge with two members, a group (gang) challenge
has more.

### What a challenge is
- **A shared habit:** a name, a schedule (every day, chosen days, N times a week, weekly, monthly,
  as for any habit) and dates: a week, a month, a year, or a custom start and end.
- **Each member ticks their own.** The challenge appears in every member's tracker as a normal
  habit (in Today, the month grid, reminders and stats), linked to the challenge. Ticking it is
  ticking your own habit.
- **Everyone in it sees everyone's progress on that challenge** (done this week, rate so far,
  current run), and nothing else about each other. Joining a challenge means sharing that one
  habit with its members; personal habits stay private.
- **Up to 10 members.** You don't need to be buddies with all of them: anyone in the challenge can
  invite with a link (as for buddies).
- **Who runs it:** the person who made it can rename it, extend the end date and remove members.
  The schedule is fixed once it starts, so nobody's progress gets rewritten. If they leave, the
  longest-standing member takes over; when the last person leaves, the challenge is deleted.
- **Leaving:** anyone, any time. Your ticks stay in your own tracker as your habit; the others
  stop seeing them.
- **When it ends:** a closing card with each member's result, and the habit carries on for anyone
  who wants to keep going, as their own.

### In the database
- New tables: `challenges` (name, schedule, dates, owner) and `challenge_members`; personal habits
  get an optional link to a challenge.
- As for buddies, members read each other's progress only through a function that checks
  membership and returns only that challenge's figures.

## 5. A note from the folding table: the crane note

The app's standard way of explaining itself (D-031). Buddies and gangs get one each, written as a
note from oze on why the feature exists; any later feature can carry one too.

- **The way in:** a small paper crane (the One More Fold mark, in shu) beside a feature's heading, with
  a short label such as "Why buddies?". It hops now and then, so it's noticed without shouting.
  Like the folded note on the landing page, it says there's a story here if you want it.
- **Opening:** a paper crane flies in from the little crane, across the page, to the middle. It
  unfolds in the air back into a square sheet, the sheet turns over to its white side, and the
  square opens downwards into the note.
- **Reading:** a white paper letter showing the crane's creases faintly, a heading, a few short
  paragraphs, signed "oze, who made One More Fold". One button ("Fold it back") and an ✕.
- **Closing:** the reverse: the letter folds up into the square, turns over, folds into a crane, and
  the crane flies off the page.
- **Built from the same fold engine** as today's crane ([crane.js](../src/three/crane.js)), so the
  folds are the real ones.
- **With reduced motion, or without WebGL:** no flight; the note simply appears and disappears.
- **Never in the way:** Escape, ✕, the button or a tap outside close it at any point, even
  mid-flight; focus goes back to the little crane; the text is there for screen readers from the
  start.
- **Notes are written in the code,** never taken from stored data.

**Draft for buddies** (for oze to rewrite in his own words):
> I built One More Fold for my eighth try, and the tries that lasted were never the ones I made alone.
> A friend who notices you've gone quiet and asks "everything okay?" is worth more than any streak.
> So buddies aren't followers and this isn't a feed. Add the people you'd text anyway. Share as
> much or as little as you like. If you see a friend's folds slowing down, don't nudge them here:
> call them.

**Draft for gangs:**
> Some habits are easier with company. Five friends in five cities can still run together if they
> all fold the same habit. A gang challenge keeps everyone's own progress and puts it side by
> side, not to rank anyone, just so nobody runs alone.

## 6. Privacy and terms

When this ships, the Privacy page needs to say:
- buddies and challenge members see what you choose to share, and your user tag;
- push notifications go through the browser's push service (Google, Apple or Mozilla);
- we store your time zone and your devices' push addresses.

Encryption stays parked, so the owner can still technically read the data, as the Privacy page
already says.

## 7. Order of work

Each step is its own PR (or a few), tested and merged before the next.

Each step brings only what it uses, so nothing waits on groundwork it doesn't need.

1. **The crane note** (D-031): the component, first used on the patch notes page.
2. **Closed-app reminders:** time zone and reminder settings in the account, push subscriptions,
   the Edge Function and the 30-minute job, the sent log, Done and Later from the notification, no
   doubles with an open tab, a web app manifest and the iPhone guide, Privacy page update.
3. **Daily summary and weekly recap.**
4. **Buddies:** user tags, private habits, invites, the three levels, a buddy's view, remove, and
   its crane note.
5. **Buddy and gang challenges:** two to ten members, invites, the shared view, ending a
   challenge, and its crane note.
6. **Challenges and buddies in the summaries.**

**Later, not now:** nudges between buddies (noted in [vision.md](vision.md): a nudge sent while
someone is already doing the habit would irritate more than help), a family circle with one shared
wish, exact-time reminders, end-to-end encryption.

## 8. Settled on 28 October 2026

The owner agreed to all seven recommendations:

1. Reminders arrive up to 30 minutes early and name the time ("German at 7:00").
2. "Later" instead of "In 10 minutes" on closed-app reminders.
3. "How I'm doing" shows 7- and 30-day totals, the trend and the longest current run, with no
   day-by-day grid.
4. A new buddy starts at "How I'm doing", shown clearly when accepting.
5. Challenge members don't have to be buddies.
6. Limits to start with: 50 buddies, 10 people per challenge, 30 notifications a day.
7. One summary time for both, chosen by each person, default 21:30; the weekly recap on Sunday.

Also on 28 October: user tags instead of display names (section 3), and the crane note as the app's
info popup (section 5).
