// Patch notes (D-032): what's new in each version, for people using One More Fold. User-facing only,
// Older patches say Eightfold, the name at the time (D-038).
// newest first; the technical record stays in CHANGELOG.md. Fixed text written here, rendered with
// esc(). The first patch is the newest, and the account chit marks it until it's been read.
// Voice: warm and a little silly, but the design rules still hold (sentence case, no exclamation
// marks outside katakana stickers, every number says what it counts).

export const PATCHES = [
  {
    version: '0.13',
    date: '2026-11-01',
    title: 'Done, from the notification',
    sticker: 'ポチッ',
    notes: [
      ['Done, without opening anything.', 'A reminder that arrives with the app closed now has a Done button. Tap it and the habit is folded, straight from the notification. Your thumb will thank you.'],
      ['Later, for when it really is later.', "Tap Later and the reminder comes back on the next round, up to three times, unless you've done it by then. It won't nag past that; it has manners."],
      ['iPhone and iPad', "don't show buttons on web notifications yet, so there a tap still opens the app. We're as disappointed as you are."],
    ],
  },
  {
    version: '0.12',
    date: '2026-10-30',
    title: 'One more fold',
    sticker: 'カイメイ',
    notes: [
      ['A new name.', 'Eightfold is now One More Fold. Same paper, same cranes, same folds. Search for "Eightfold" and you got a lot of very serious companies; search for us and you should now get us.'],
      ['Why this one.', 'Fall seven times, rise eight: always one more rise than fall. Every tick is one more fold, so the name was hiding in plain sight, at onemorefold.com, all along.'],
      ['Nothing to do.', "Your folds, account, reminders and backups carry on exactly as they were. Old backup files still load."],
    ],
  },
  {
    version: '0.11',
    date: '2026-10-28',
    title: 'Reminders that find you',
    sticker: 'ピンポン',
    notes: [
      ['Reminders with Eightfold closed.', 'Turn them on under Habits, Reminders, and a nudge arrives up to half an hour before each habit, even with no tab open. Your laptop no longer has to babysit a browser tab.'],
      ['Device by device.', "Each phone or laptop opts in on its own. Sign out and that device goes quiet straight away, so a shared computer won't start reminding your flatmate about your German."],
      ['iPhone and iPad too,', 'once Eightfold is on your Home Screen: Share, then Add to Home Screen. Apple insists, and we have learnt not to argue with Apple.'],
    ],
  },
  {
    version: '0.10',
    date: '2026-10-28',
    title: 'Three papers to read on',
    sticker: 'ヨル',
    notes: [
      ['Light, Warm and Dark.', 'Open the account chit in the corner and pick your paper under "Paper". Auto, the default, follows your device.'],
      ['Warm', 'is the same sheet under a desk lamp: sepia, softer, with less blue. For evenings, and for people who find white a bit much.'],
      ['Dark', 'is black washi by lamplight. Warm charcoal rather than pitch black, so it\'s gentler at night and still looks like paper. The coloured papers dim a little so nothing glares at midnight.'],
      ['It remembers.', 'Each device keeps its own choice, because your phone in bed and your laptop at noon want different things.'],
    ],
  },
  {
    version: '0.9',
    date: '2026-10-28',
    title: 'Patch notes, with notes',
    sticker: 'メモ',
    notes: [
      ['Patch notes.', "You're reading them. Every update gets one from now on: what's new, in plain words, with the occasional bad joke."],
      ['Notes that arrive by crane.', 'Tap the little crane next to "Why patch notes?" and a paper crane flies in and unfolds into a note. Close it and it folds itself back up and leaves. Very dramatic, for a sheet of paper.'],
      ['A peek at the folding table.', "The next few patches are planned: see the end of this page. No dates, because we've met ourselves."],
    ],
  },
  {
    version: '0.8',
    date: '2026-10-25',
    title: 'Privacy, folded in',
    sticker: 'ヒミツ',
    notes: [
      ['Sign out and remove my folds from this browser.', 'For shared computers, office laptops and siblings who read over your shoulder. Your folds stay safe in your account.'],
      ['Delete my account.', 'Gone means gone: your account and everything in it. There\'s a "Save a backup first" button, because we\'re not monsters.'],
      ['Privacy and Terms pages.', 'In plain words, each with a short version up top for people who, reasonably, have habits to do.'],
      ['Our own fonts.', 'The letters now come from Eightfold itself, so no other company hears about your visits.'],
    ],
  },
  {
    version: '0.7',
    date: '2026-10-24',
    title: 'Your folds, everywhere',
    sticker: 'ドコデモ',
    notes: [
      ['Sign in and sync.', 'Sign in with Google or an email link and your folds follow you from laptop to phone and back. Entirely optional: signed out, nothing leaves your device.'],
      ['The paper ball in the corner.', "That crumpled ball is your account. Tap it. Signed in, it smooths itself flat and shows whether your folds are saved."],
      ['Why a thousand cranes?', 'The story behind the name, on a paper scroll that unrolls: a 1797 folding book, a girl called Sadako, and why you get up eight times.'],
      ['Fold the year.', 'In December and January, look back at your year, choose which habits come with you, and make a wish for the next one.'],
      ['A wish for every year.', 'Crane 1,000 of each year can wish for something new.'],
      ['A fresh start for newcomers.', 'New trackers now open empty, instead of with oze\'s habits. oze was getting self-conscious.'],
      ['A proper lost page.', 'Wrong address? You now get a lost page made of paper instead of a sad grey error.'],
    ],
  },
  {
    version: '0.6',
    date: '2026-10-24',
    title: 'Habits on your schedule',
    sticker: 'ヤスミ',
    notes: [
      ['Schedules.', 'A habit can repeat every day, on chosen days, a few times a week, once a week or once a month.'],
      ['Rest days are rest.', 'Gym on Mondays and Wednesdays no longer "fails" on a Tuesday. Tuesdays everywhere are relieved.'],
      ['This week and this month.', 'Today now shows what\'s due today, then the longer goals with progress like "1 of 3 this week".'],
      ['Arrow keys skip rest days', 'in the month grid, for the keyboard people. We see you.'],
    ],
  },
  {
    version: '0.5',
    date: '2026-10-24',
    title: 'Hold on tight',
    sticker: 'ダイジ',
    notes: [
      ['Folds that stay put.', 'Eightfold asks your browser to keep your folds for good, and the Backup panel tells you whether they\'re protected.'],
      ['A weekly backup nudge.', 'A friendly slip every 7 days without a backup, with "Remind me tomorrow" for the busy weeks.'],
      ['Backups get checked at the door.', 'A damaged or odd backup file is turned away politely before it can touch your folds.'],
    ],
  },
  {
    version: '0.4',
    date: '2026-10-23',
    title: 'Numbers that explain themselves',
    sticker: 'ナルホド',
    notes: [
      ['Days, Goal or Both.', 'Choose whether percentages count against the days so far, against your goal, or show both.'],
      ['No more mystery percentages.', 'Every number now says what it\'s out of, like "13 of 20 goal days". A lonely 65% will never confuse you again.'],
    ],
  },
  {
    version: '0.3',
    date: '2026-10-23',
    title: 'A name with a story',
    sticker: 'ナナコロビ',
    notes: [
      ['Hello, Eightfold.', 'Fall seven times, rise eight. The app was called Orizuru for about a day; it has since grown up.'],
      ['Your folds moved house too,', 'automatically, without a single box to carry.'],
    ],
  },
  {
    version: '0.2',
    date: '2026-10-23',
    title: 'A tap on the shoulder',
    sticker: 'ピコン',
    notes: [
      ['Reminders.', 'Give a habit a time and Eightfold reminds you, with Done and "In 10 minutes" right on the notification. The tracker needs to be open in a tab for now; we\'re working on it.'],
      ['Paper notes.', 'When the tab is in front, the reminder arrives as a little taped note instead.'],
      ['Fixed:', 'ticking a square no longer flings the month grid back to the 1st. Sorry, the 1st.'],
    ],
  },
  {
    version: '0.1',
    date: '2026-10-23',
    title: 'The first fold',
    sticker: 'ハジメ',
    notes: [
      ['The tracker.', 'A month grid, today\'s list, goals, streaks, scores and the whole year, folded out of a Google Sheet held together with formulas and hope.'],
      ['A crane a day.', 'Tick a day\'s habits and a paper crane folds itself, in 3D. We may have got carried away.'],
      ['A thousand cranes, one wish.', 'Every tick folds a crane. Write your wish on the Habits page and start folding.'],
      ['Backups.', 'Save everything to a file whenever you like, for peace of mind.'],
    ],
  },
];

// What's being folded next (see docs/buddies-and-notifications.md). Promises, not dates.
export const NEXT = [
  'A daily summary and a weekly recap',
  'Buddies, with user tags like oze#1000',
  'Buddy and gang challenges: one habit, up to ten people',
];

export const LATEST = PATCHES[0].version;
