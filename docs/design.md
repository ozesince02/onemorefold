# One More Fold design system

The reference for keeping the look, the words and the behaviour consistent. Read it before
changing any screen. When a rule here changes, change it here first and note it in
[decisions.md](decisions.md).

## The idea in one paragraph

Fall seven times, rise eight. Every habit ticked is a **fold**; a day with every habit done folds
a **crane**; a thousand cranes grant a **wish** (senbazuru). The look is a **paper-cut collage**:
sheets of washi paper with torn edges, tape and cast shadows, cut-out woodblock prints, with
**anime** touches (katakana sound effects, speed lines, a flat red sun) and **origami** at the
centre. Cute but sophisticated: never girly-pop, never childish.

## Voice

- Plain, warm, first person on the landing page ("I started habits and dropped them").
  Second person in the app ("Next up: German at 07:00").
- Paper words instead of app words: fold, crane, sheet, crease. "45 folds", not "45 completions".
- A miss is a fall, not a failure. Never scold. ("There's still time today.")
- Every number says what it counts: "13 of 30 days", "13 of 20 goal days", never a bare "65%".
- Sentence case everywhere. No exclamation marks except inside katakana stickers.
- Headlines two lines or fewer at every width.

## Colour and themes (D-033)

Three papers to read on, chosen in the account chit under **Paper** (Auto follows the device):

| Theme | The idea | Ground / sheet / ink |
| --- | --- | --- |
| **Light** | Washi in daylight (the original look) | `#E6E5E1` / `#FAF9F6` / `#1E1B18` |
| **Warm** | The same sheet under a lamp: sepia, less blue in every surface, brown-black ink | `#E7DAC1` / `#F5ECDA` / `#34281C` |
| **Dark** | Black washi (kuro-washi) by lamplight: warm charcoal, never pure black; sheets one step lighter; off-white ink, never pure white | `#171513` / `#221F1B` / `#E8E3D9` |

All values live in [src/styles/tokens.css](../src/styles/tokens.css). **Components use role tokens
only**: never a hex, and never a paper's name for text or a surface.

| Role | Use |
| --- | --- |
| `--bg` `--bg-2` `--bg-3` | The table: page ground; quiet surfaces (tracks, empty squares, quiet buttons); hover and hairlines in data |
| `--sheet` | A sheet lying on it: panels, cards, chits, letters |
| `--ink` `--ink-2` `--ink-3` | Text; secondary text; muted text |
| `--inverse` / `--on-inverse` | A strong ink fill (selected chip, toast, `.btn--ink`, "Latest" pill) and its text |
| `--on-color` | Text on the accent or a deep paper (red button, ai sheet): always light |
| `--accent` / `--accent-hover` / `--accent-ink` | **The one action colour** (shu): fills; a pressed fill; red text |
| `--link` | Links and focus rings |
| `--good` | A number that went the right way |
| `--paper-ink` `--paper-ink-2` `--paper-link` `--paper-red` | Ink on a coloured paper: always dark |
| `--paper-back` | The white back of a paper, where a corner folds over (dog-ears, envelope flaps, snow caps) |
| `--line` `--scrim` `--tape` `--media` `--lift` `--lift-high` | Hairlines, dialog backdrops, masking tape, photo treatment, cast shadows |

Papers keep their names (`--sora` `--matcha` `--yamabuki` `--kraft` `--sakura` `--ai` `--shu`):
they are the collage drawer. Each theme tunes them (a little warmer under the lamp, dimmer at night
so a yellow sheet never glares).

- **Coloured papers stay paper.** Anything painted in a paper colour joins the list in tokens.css
  (or gets `.on-paper`), which re-points `--ink`, `--link` and friends to the paper inks, so text,
  links and buttons placed on it read correctly in every theme with no extra rules.
- **Fixed objects** look the same in every theme: the fake Google Sheets scrap and the wooden story
  scroll. Their lines are marked `theme-fixed` (a whole file: `/* theme-fixed file`).
- **Things drawn outside CSS** (the 3D crane, canvases) read a token with `token('sheet')` from
  `src/lib/theme.js`, and can redraw on `onThemeChange()`.
- Each habit owns one paper colour (`store.color(id)`); it marks that habit everywhere. Text on a
  habit colour uses `inkOn(hex)` from `src/ui/paper.js`.
- No gradients, no glows, no violet. Halftone dots are an SVG pattern, not a gradient.
- `npm run check` (scripts/check-themes.mjs) checks every text pair in every theme for WCAG AA
  contrast (4.5:1 text, 3:1 shapes), keeps body text below 17.5:1 (no harsh pure black on white),
  checks Warm really has less blue, and fails on any colour written outside tokens.css.

### Adding a component
1. Pick roles, not colours: `background: var(--sheet); color: var(--ink);`.
2. Painted in a paper colour? Add its selector to the paper list in tokens.css, or add `.on-paper`.
3. Look at it in all three themes (the account chit's Paper switch), then run `npm run check`.

## Type

- **Display:** Dela Gothic One. Headlines, big figures, katakana stickers. Tracking −0.01 to −0.03em.
- **Text:** Zen Maru Gothic 500/700. Everything else.
- Two families only. Tabular figures (`font-variant-numeric: tabular-nums`) wherever numbers line up.
- Scale: `--step-0` body 16–18px, `--step-1` lead 19–24px, `--step-2` section heads 26–44px,
  `--step-3` big statements 40–96px. App titles stay 28–40px.
- Nothing meant to be read under 13px.

## Paper primitives

From [src/styles/paper.css](../src/styles/paper.css) and [src/ui/paper.js](../src/ui/paper.js).

| Primitive | Use | Notes |
| --- | --- | --- |
| `.sheet-wrap` > `.sheet` | Any piece of paper | The wrapper casts the shadow (`--lift`), because clip-path also clips shadows |
| `data-tear="trbl"` | Torn edges | `tearAll()` builds a clip-path that follows the size. `data-amp`, `data-seed` |
| `.tape` | Masking tape on a corner | Put it **outside** any clipped element or it gets cut |
| `.halftone` | Printed-dot texture | Collage sheets only, not data |
| `.cutout` | A printed photo with a white border | For the woodblock prints and photos |
| `.boil` | Stop-motion jitter at 8 fps | Small decorative pieces only, never text blocks |
| `.sfx` + `sfxPop()` | Katakana stickers: パタ (flap), ピコン (ping), パーフェクト! | Decorative, `aria-hidden` |
| `confetti()` | Paper squares | Perfect days only |
| `.nudge` | Reminder note | Taped slip, bottom right, max three |
| `.fold-note` | Envelope-folded note with a 千 seal | Opens flap by flap; one per page, for the cranes story (D-023) |
| `.story` | Hanging scroll (`<dialog>`) | Aged paper between two rods; unrolls down, rolls up to close (D-023) |
| `.note-crane` | The way into a crane note | A washi pill with the crane mark and a label ("Why buddies?"); the crane hops every 7s in stop-motion. `noteTrigger(id, label)` |
| `.cnote` | Crane note (`<dialog>`), the info popup | A 3D crane flies in from the trigger, unfolds into a square, turns over, and the square opens into a white letter with faint creases; closing folds it back and it flies off (D-031) |

Shadows are allowed **only** on paper lying on paper. Buttons and controls are flat.

## Layout

- **Landing:** one frame, 16–40px outer gutters (`--gutter`), max 1440px, sections 64–128px apart
  (`--section-gap`, a margin: never padding on a section that gets pinned).
  Every section mixes a collage piece with its text; neighbouring sections never share a layout.
- **Tracker:** 12-column board, 24px gaps (16px on phones). Panels are `.panel` sheets with a
  20px-ish heading and a one-line note at the right of the head (`.panel-head p`).
- Phones get their own composition: panels stack in reading order, the grid scrolls sideways with
  the habit names pinned.

## Components (tracker)

- **Buttons:** fully round, flat. `.btn` red for the one main action, `.btn--ink` sumi,
  `.btn--quiet` washi. `.icon-btn` for round navigation. Min height 44px (40px inside notes).
- **Hanko** (`.hanko`): a person's tag code in a round seal, red ring and red text, tilted. The one
  mark for a person in Flock (D-044); `.hanko--big` on your own card.
- **Name card** (`.meishi`): a buddy, as a card on the Flock board with a paper band along the
  top (sora, sakura, matcha, yamabuki, kraft in turn). It shows only figures, each saying what it
  counts, never a day grid. `.meishi--new` is the dashed "Hand over your card" slot.
- **Gang** (`.gang`): a gang's sheet in Flock, built like a name card: an ai band along the top,
  a cast shadow.
  - **Today:** our crane mark (`.gang-crane`), plain paper coloured in from the bottom as members
    fold.
  - **Stamps:** a nobori banner (ガンバレ, on ai) beside a table of stamps. `.stamp--on` is filled
    shu, `.stamp` a dashed ring, `.stamp--rest` a dot. Names only; the stamps are the marks.
  - **Layout:** today sits beside the banner when the sheet is wide (a container query), and above
    it when it's narrow.
  - **Who hasn't folded** is named in words, never in red.
- **Flock panels:** both follow the same pattern.
  - **Head:** the heading, then the count and the crane note on the right, centred on one line.
  - **Body:** the cards, sized to what they hold, then a dashed `--new` tile ("Hand over your
    card", "Start a gang") that opens into its form.
- **Gang mark** (`.gang-mark`): a light outlined pill reading "gang", in the text's own colour,
  beside a gang habit's name. "gang" has descenders and no ascenders, so its label sits 2px higher
  than the box would put it.
- **Segmented switch** (`.seg`): Days / Goal / Both. Selected is sumi on washi.
  "Make default" appears only when the view differs from the saved default.
- **Tags** (`.tag`): today's habits. Square box, time, name, run. Ticked box takes the habit colour
  with a white dog-ear fold. The next habit is a sakura row.
- **Cells** (`.cell`): grid squares. Ticked = habit colour + dog-ear. Future = outline. Before a
  habit started = hatched. Today = 2px sumi outline. Rest day of a chosen-days habit = no box,
  a 4px washi-3 dot (`.cell.rest`), never a miss. Any-day habits (times a week, weekly, monthly) =
  pale washi box with a dashed outline (`.cell.flex`).
- **Today strips:** below today's due list, "This week" and "This month" headings (`.strip-h`,
  14px text face, not display) with the same tags; the right side shows progress instead of a run.
- **Schedule editor:** a "Repeats" select under each habit; chosen days are seven 40×44px chips
  (M T W Th F Sa Su) filled with the habit's colour when on.
- **Ranked bars:** name on its own line, bar below, figure right. In Both, two labelled bars.
- **Forms:** labels above inputs, 44px fields, washi fill, ai focus ring.
- **Sync dot** (`.sync-dot`) after the crane count in the top bar while signed in: matcha in step,
  yamabuki saving or offline, shu when the account can't be reached; its label says which.
- **"Two sets of folds" slip:** the backup slip's shape above the month, only on a first sign-in
  where browser and account both have folds. "Keep both" (sumi) and a text link for the account's.
- **Paper switch** (`.acct-seg`, in the account chit, D-033): Auto, Light, Warm, Dark as four
  40px chips on a `--bg-2` track; the chosen one in `--inverse`. Saved per device.
- **Account paper** (header, both pages, D-022): a 40px crumpled ball (three paper tones, sumi-3
  creases, a slow 3px float) when signed out; a shu square on its corner with the white initial and
  the sync dot when signed in. Opens a 330px chit (white paper, tape at the top, torn bottom,
  `--lift-high`); full width under the header on phones.
- **Toasts:** sumi slip, bottom centre, 2.4s.
- **Fold slip** (`.backup-bar.fold-bar`): the backup slip's shape in sakura, above it on the
  current month, from 1 December to 31 January until the year is folded. One sumi button.
- **Year slip** (`.year-slip`): a white panel under the year's title with its wish, cranes out of
  1,000 and whether it's folded; a button to fold or look back once the year can be folded.
- **Fold page** (`#/fold/2026`): a look-back panel (the wish line in the display face, mini
  mountains, five figures) beside a form (habits for January as colour-chip checkboxes, next year's
  wish, one red button). Ends of the month arrows are disabled buttons, not hidden.
- **Backup slip** (`.backup-bar`): a yamabuki strip with notched ends above the month board, only
  when a backup is due and data is local. One primary (sumi) button and a text link to snooze.

## The noren (D-040)

- **What it is:** an indigo (`--ai`) cloth in up to four strips under the landing header, hanging
  from a kraft rod. The centre strip is a little longer; text in the display face on `--on-color`.
- **Words:** one short phrase per strip, about 24 characters. It's for notices, never for content
  that belongs in the page.
- **Motion:** one sway as the page opens, and it lifts away when closed. None with reduced motion.
- **Phones:** below 600px the strips join into one, with phrases separated by middots.
- Edit `src/data/bulletin.js` to change or take it down. `NOTICES` take turns every 9 seconds,
  pausing on hover or focus; give news an end date and it drops out by itself. ✕ hides it for one
  visit.
- **The invitation slip** (D-043) uses the backup slip's shape above the current month: "Turn on"
  (sumi) and "Remind me in 3 days" (text link).

## Crane notes (D-031)

- **When:** a feature that deserves a word from the maker (why it exists, what it's for) gets a
  `.note-crane` beside its heading. One per feature, never inside a list.
- **Words:** a letter from oze in the first person, three short paragraphs at most, signed. The
  kicker always reads "A note from the folding table". Text lives in `src/data/notes.js`.
- **Motion:** fly in about 0.85s, unfold 0.8s, turn over 0.4s, then the letter opens downwards from
  the fold. Closing: fold the letter up, turn over, fold into a crane, fly off top right.
- Without WebGL or with reduced motion, the letter just fades in and closes at once.

## Patch notes page (D-032)

- One torn white sheet per version, newest first, tilted a little in turn, tape at the top.
- **Hanko stamp:** an 84px slightly off-round shu seal with "Patch" and the number in the display
  face, pressed a few degrees crooked. 66px on phones, above the text.
- A katakana sticker per patch at the sheet's top-right corner, outside the torn sheet (its
  clip-path would cut it). "Latest" is a sumi pill beside the newest date.
- Lines start with a bold lead ("Delete my account.") and carry on in plain words. Witty, never
  technical; the voice rules above still apply.
- Ends with a sakura "Next on the folding table" slip: promises, not dates.

## Charts

- Charts are cut paper, not chart-library defaults: hills for the daily score, mountains for the
  year, a ring for a month total, bars for weeks and habits. Code: [src/ui/charts.js](../src/ui/charts.js).
- One hue per chart, from the paper set. Red only for "perfect" and the current-month flag.
- Every chart's head says what it measures, including which percentage view.
- Months not started are dashed outlines, not zeros.

## Percentages (see D-006)

- **Days:** done ÷ due so far (today counts once ticked). The default. Units follow the schedule
  (D-013): days, weeks or the month; columns read "Due" and "% due".
- **Goal:** ticks ÷ the habit's monthly goal. Can pass 100% for one habit; month totals cap each habit at its goal.
- **Both:** days first, goal second, always labelled.
- Use `figure(h, 'days' | 'goal')` in app.js for the number and its words; never format a percentage
  without saying what it is of.

## Motion

- GSAP for timelines, scroll-triggered entrances and the folding; CSS for hovers.
- **Stop-motion feel:** the crane's idle pose updates 12 times a second; collage pieces `.boil` at 8.
  Real interactions (folding, page entrances) stay smooth.
- Entrances: heading, then text, then picture, 60–90ms apart, rising 16–32px. Once per section.
- Feedback on every control: press scale, hover lift, a fold flip on ticking.
- Things that open unfold the way paper would: the account chit flips down, the folded note opens
  flap by flap, the story scroll unrolls downwards. Closing reverses it, quicker (about 300ms).
  The crane note is the one longer piece (about 2s each way), because the flight is the point.
- `prefers-reduced-motion`: no travel, no boil, no confetti, crane renders static. Content never
  depends on an animation finishing.

## The crane (Three.js)

- [src/three/crane.js](../src/three/crane.js): 20 triangles in six parts (body, tail, neck, head,
  two wings). Progress 0 is a flat square with the crane's creases printed on it; progress 1 is the
  finished crane, flapping. Each part folds in during its sixth of progress.
- Coloured side out, white side in, sumi crease lines like the 1797 folding book.
- [src/three/stage.js](../src/three/stage.js): transparent canvas, soft sun from the upper left,
  contact shadow, pointer tilt, click to hop. Pauses rendering when off screen.

## Accessibility

- Visible focus everywhere (`:focus-visible` ai ring). Grid cells are buttons with labels
  ("German, 23 Oct") and arrow-key navigation.
- Contrast 4.5:1 for text. White on `--shu` passes; check any new paper colour with `inkOn`.
- Katakana stickers, clouds and decorative SVGs are `aria-hidden`.

## Don't

- Gradients, glass blur, glows, emoji, icon-in-a-tinted-square cards, rows of identical cards.
- Monospace (except the fake spreadsheet scrap, which imitates Google Sheets on purpose).
- Small uppercase letter-spaced labels, "eyebrows" above headings, 01/02/03 numbering.
- Bare percentages. A third typeface. Orange-vermilion with cream.
- Class names that clash across pages: `.today` was once both a hero card and a grid cell.
  Prefix state classes with `is-`.

## How to check a change

```bash
node scripts/check-stats.mjs && node scripts/check-reminders.mjs && node scripts/check-story.mjs
npm run build
```

Then look at the page at 1440, 768 and 390px wide. The design-taste skill's inspector
(`inspect.mjs`, add `--app` for the tracker) measures the rules above.
