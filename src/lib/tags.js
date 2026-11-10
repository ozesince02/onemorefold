// User tags (D-029): name#TAG, like a gamer tag. The name is how buddies and gangs know you; the
// code tells two Rahuls apart. Nobody can search for a tag. The database repeats these checks
// (supabase/migrations/20261111120000_buddies.sql); this side is the stricter of the two.

export const NAME_MIN = 3;
export const NAME_MAX = 16;

// Letters and numbers in any language (with the marks some scripts need), single spaces between
// words. Then a second net for what \p{M} lets through that could hide or deceive.
const NAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*( [\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u;
const HIDDEN = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/u;
const TEAM = /^(eightfold|onemorefold|admin|administrator|support|moderator|official|system)/;
const CODE = /^[A-Z0-9]{3,5}$/;

// Why a name can't be used, in plain words, or '' when it's fine.
export function nameProblem(raw) {
  const name = typeof raw === 'string' ? raw.normalize('NFC') : '';
  const length = [...name].length;
  if (length < NAME_MIN) return `At least ${NAME_MIN} letters or numbers.`;
  if (length > NAME_MAX) return `At most ${NAME_MAX} characters.`;
  if (name !== name.trim() || name.includes('  ')) return 'Single spaces between words, none at the ends.';
  if (!NAME.test(name) || HIDDEN.test(name)) return 'Letters and numbers only, in any language. No symbols or emoji.';
  if (TEAM.test(name.toLowerCase().replaceAll(' ', ''))) return 'That one could pass as the One More Fold team. Pick another.';
  return '';
}

export const cleanCode = (raw) => (typeof raw === 'string' ? raw.trim().toUpperCase() : '');
export const codeProblem = (raw) => (CODE.test(cleanCode(raw)) ? '' : '3 to 5 letters or numbers.');

// A suggested code: four digits, as in oze#1000. Yours to change.
export function suggestCode(random = Math.random) {
  return String(Math.floor(random() * 9000) + 1000);
}

export const tagText = (name, code) => `${name}#${code}`;
