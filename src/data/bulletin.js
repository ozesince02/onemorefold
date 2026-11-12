// The noren (D-040): a shop curtain hanging under the landing page's header with a short notice.
// In Japan a noren out front means "we're open", and shops change it for seasons and occasions;
// this one carries whatever the site wants to say next, then comes down. Edit this file only.
//
// NOTICES take turns: every one that's switched on and not past its last day hangs for a few
// seconds, then the next, in this order. Closing the noren lasts one visit. When a notice's last
// day passes it simply drops out of the turns. Each notice has:
//
//   show     false takes it down everywhere.
//   id       a simple name for the notice (letters, numbers, hyphens).
//   until    optional last day it hangs (YYYY-MM-DD, inclusive), after which it hides itself.
//   panels   one to four short phrases, one per strip of cloth (about 24 characters each).
//   link     optional { text, href } at the end; href must be one of the site's own pages.
// Fixed text written here, escaped when shown; nothing comes from storage or the address bar.

export const NOTICES = [
  {
    show: true,
    id: 'flock',
    until: null,
    label: 'News from the folding table',
    panels: ['New: Flock', 'Buddies and gangs', 'Fold habits together'],
    link: { text: 'Find your flock', href: 'flock' },
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
