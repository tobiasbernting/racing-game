// The word rules in one place: what the game never says. The language test scans every string in src/ with these,
// and the name field filters what a player types with them (a ten-year-old types, a grown-up reads over the shoulder).

/** Word-boundary-aware: "fan" the word, not "fanfar" or "fans". */
export const BANNED: RegExp[] = [/\bkuk/i, /\bskit/i, /\bfan\b/i, /\bjävl/i, /\bjavl/i, /\bhelvet/i, /\bsatan\b/i, /\bfitt/i, /\bröv\b/i, /\bknull/i, /\bhora\b/i, /\bpiss/i, /\bidiot/i];

/** What a name must not contain even in the middle of a word (the very worst, which no name has in it by accident). */
const WORSE: RegExp[] = [/knull/i, /nazi/i, /hitler/i, /neger/i, /jävl/i, /javl/i, /helvet/i, /satan/i, /fuck/i, /shit/i, /bitch/i, /porr/i, /\bbög/i, /\bhomo\b/i, /\bkuk/i, /\bhora\b/i, /\bpiss/i, /\bidiot/i, /\bskit/i, /\bfitt/i, /\bröv\b/i, /\bfan\b/i];

/** Letters people swap for digits to sneak a word past: 0 o, 1 i, 3 e, 4 a, 5 s, 7 t, @ a, $ s. */
const unleet = (t: string): string => t.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a').replace(/\$/g, 's');

/** Is this text clean? Checks the word list, the same text with digits turned back into letters, and the text with the spaces and dots taken out. */
export function isClean(text: string): boolean {
  const plain = text.toLowerCase();
  const variants = [plain, unleet(plain), unleet(plain).replace(/[\s._\-*]+/g, '')];
  for (const v of variants) {
    for (const re of BANNED) if (re.test(v)) return false;
    for (const re of WORSE) if (re.test(v)) return false;
  }
  return true;
}
