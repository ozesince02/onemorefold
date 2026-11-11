// Crane notes (D-031): short letters from the person who made One More Fold, on why a feature exists.
// Opened by the little crane beside a feature (src/ui/note-trigger.js). Fixed text, escaped when
// shown; nothing here comes from storage or the address bar.

export const NOTE_SIGN = 'oze, who made One More Fold';

export const NOTES = {
  buddies: {
    title: 'Why buddies?',
    body: [
      "I built One More Fold for my eighth try, and the tries that lasted were never the ones I made alone. A friend who notices you've gone quiet and asks \"everything okay?\" is worth more than any streak.",
      "So buddies aren't followers, and this isn't a feed. Add the people you'd text anyway. Share as much or as little as you like, and keep any habit private.",
      "If you see a friend's folds slowing down, don't nudge them here: call them.",
    ],
  },
  gangs: {
    title: 'Why gangs?',
    body: [
      'Some habits are easier with company. Five friends in five cities can still run together if they all fold the same habit.',
      "A gang keeps everyone's own progress and puts it side by side. Not to rank anyone: the crane only finishes when everyone has folded, so nobody runs alone.",
      "And yes, it says who hasn't folded yet today. Not to shame anyone: so the rest of you know who could use a message.",
    ],
  },
  'patch-notes': {
    title: 'Why patch notes?',
    body: [
      "One More Fold is made by one person, one fold at a time, and it changes often. You shouldn't have to guess what moved.",
      "So every update gets a sheet here, written for you rather than for developers: what's new, when it arrived, and the occasional bad joke to make up for the bugs.",
      'If something you liked changes, or something you need is missing, write to me. The address is at the bottom of the home page, and the folding table always has room.',
    ],
  },
};
