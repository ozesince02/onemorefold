// The noren (D-040): a shop curtain hanging under the landing page's header with a short notice.
// In Japan a noren out front means "we're open", and shops change it for seasons and occasions;
// this one carries whatever the site wants to say next, then comes down. Edit this file only.
//
// NOTICES is a queue: the first one that's switched on, not past its last day and not closed on
// this device is the one that hangs. Put news first and the standing message last, so the noren
// falls back to it by itself when the news ends. Each notice has:
//
//   show     false takes it down everywhere.
//   id       change it whenever the message changes: someone who closed the old one sees the new one.
//   until    optional last day it hangs (YYYY-MM-DD, inclusive), after which it hides itself.
//   panels   one to four short phrases, one per strip of cloth (about 24 characters each).
//   link     optional { text, href } at the end; href must be one of the site's own pages.
// Fixed text written here, escaped when shown; nothing comes from storage or the address bar.

export const NOTICES = [
  {
    show: true,
    id: 'reminders-app-closed',
    until: '2026-11-24',
    label: 'News from the folding table',
    panels: ['New: reminders', 'even with the app closed', 'Still free, no ads'],
    link: { text: 'Turn them on', href: 'app' },
  },
  {
    show: true,
    id: 'free-for-everyone',
    until: null,
    label: 'A note from the folding table',
    panels: ['Free, for everyone', 'No ads, no tracking', 'Built for the community'],
    link: { text: 'Start folding', href: 'app' },
  },
];
