// The player's name and the rally name made from it. The game asks "Vad heter du?" once; if it can make a decent rally
// name out of the answer ("Turbo-Tobbe", "Lukas Lättfot", "Grus-Greta", "Sladd-Sam") it suggests one, and the player
// picks it or keeps their own name. Everything here is deterministic per name, so a name always gets the same first
// suggestion, and "Nytt förslag" walks through the same list in the same order.
import { isClean } from './words.ts';

export const NAME_MAX = 16;

/** The text of a name field made safe: trimmed, one space between words, no odd characters, at most NAME_MAX long. */
export function tidyName(raw: string): string {
  const t = raw
    .normalize('NFC')
    // letters (any language), digits, space, dot, dash and apostrophe; everything else (emoji, tags, symbols) goes
    .replace(/[^\p{L}\p{N} .'\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(t).slice(0, NAME_MAX).join('').trim();
}

/** A name the game accepts: something left after tidying, and nothing the word rules refuse. */
export const nameOk = (raw: string): boolean => {
  const t = tidyName(raw);
  return t.length > 0 && isClean(t);
};

/** The name as it will be kept: tidied, or '' when it is empty or not allowed. */
export const cleanPlayerName = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  const t = tidyName(raw);
  return t && isClean(t) ? t : '';
};

/** Why a name is refused, as a friendly line (empty when it is fine). */
export function nameProblem(raw: string): string {
  if (!tidyName(raw)) return 'Skriv ett namn först.';
  if (!isClean(tidyName(raw))) return 'Det där namnet funkar inte här. Prova ett annat!';
  return '';
}

// ---- the generator ----

/** Ordinary first names and the nickname a rally crowd would shout. */
const NICK: Record<string, string> = {
  tobias: 'Tobbe', johan: 'Jocke', fredrik: 'Fredde', mattias: 'Matte', matthias: 'Matte', kristoffer: 'Stoffe', christoffer: 'Stoffe', daniel: 'Danne', henrik: 'Henke', jonas: 'Jonte', stefan: 'Steffe', marcus: 'Marre', mikael: 'Mikke', peter: 'Pelle', lars: 'Lasse', karl: 'Kalle', carl: 'Kalle', gustav: 'Gurra', magnus: 'Maggan', alexander: 'Alex', andreas: 'Anders', fredrika: 'Fredde', elisabeth: 'Lisa', sebastian: 'Basse', niklas: 'Nicke', patrik: 'Pata', robert: 'Robban', thomas: 'Tommy', joakim: 'Jocke', ola: 'Olle', oskar: 'Oskar',
};

/** Words that go in front of a name with a dash, by the letter they start with ("Grus-Greta"). */
const PREFIX: Record<string, string[]> = {
  a: ['Asfalt', 'Allgas'],
  b: ['Bensin', 'Blixt', 'Broms'],
  d: ['Dubb', 'Dunder'],
  e: ['Eld', 'Extra'],
  f: ['Fart', 'Flygande'],
  g: ['Grus', 'Gas'],
  h: ['Hjul', 'Hopp'],
  i: ['Is'],
  j: ['Jätte'],
  k: ['Kurva', 'Kamma'],
  l: ['Lack', 'Luft'],
  m: ['Motor', 'Mud'],
  n: ['Nitro'],
  o: ['Olje'],
  p: ['Pedal', 'Pang'],
  r: ['Rall', 'Rök'],
  s: ['Sladd', 'Smäll', 'Spik'],
  t: ['Turbo', 'Tvär'],
  v: ['Vroom', 'Vräk'],
  z: ['Zoom'],
};
/** Words with no letter to match, for names that start on a letter nobody has a word for. */
const ANY_PREFIX = ['Turbo', 'Sladd', 'Grus', 'Nitro', 'Fart', 'Gas'];

/** Words that go after a first name with a space, by the letter they start with ("Lukas Lättfot"). */
const SUFFIX: Record<string, string[]> = {
  a: ['Asfaltsson', 'Allgas'],
  b: ['Bromsfri', 'Bensinsson'],
  d: ['Dubbsson', 'Dunderfart'],
  e: ['Eldfärd'],
  f: ['Fartkvick', 'Fullgas'],
  g: ['Gaspedal', 'Grusgrabben'],
  h: ['Hoppsan', 'Hojtsson'],
  j: ['Jätteskuttet'],
  k: ['Kurvkung', 'Kamratfart'],
  l: ['Lättfot', 'Lacksson'],
  m: ['Motorsson', 'Mudderkung'],
  n: ['Nitrosson'],
  p: ['Pedalsson', 'Pangpang'],
  r: ['Rallysson', 'Rökmaskin'],
  s: ['Sladdsson', 'Slirmästare'],
  t: ['Turbosson', 'Tvärgas'],
  v: ['Vroomsson'],
  z: ['Zoomsson'],
};
const ANY_SUFFIX = ['Turbosson', 'Sladdsson', 'Gaspedal', 'Fullgas'];

/** A number from a text, the same every time (a small string hash). */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const initial = (w: string): string => w.charAt(0).toLowerCase();

/** The first word of a name, as a name with a capital: "tobias nilsson" becomes "Tobias". */
function firstWord(name: string): string {
  const w = name.split(' ')[0]!.replace(/[^\p{L}\-]/gu, '').split('-')[0]!;
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : '';
}

/**
 * Every rally name this name can make, the neatest first: a word that starts on the same letter before the name
 * ("Grus-Greta"), the same word after it ("Lukas Lättfot"), then the ones that do not rhyme in letters. Empty when
 * the name is too short, too long or odd to make a decent one from. Never longer than NAME_MAX, never a rude word.
 */
export function rallyNames(rawName: string): string[] {
  const name = tidyName(rawName);
  const first = firstWord(name);
  if (first.length < 2 || first.length > 11 || !/^[\p{L}]+$/u.test(first) || !isClean(name)) return [];
  const forms = [...new Set([NICK[first.toLowerCase()], first].filter((x): x is string => !!x))];
  const ini = (f: string): string => initial(f).normalize('NFD').replace(/[^a-z]/g, '').charAt(0);
  const dash: string[] = [];
  const space: string[] = [];
  const other: string[] = [];
  for (const f of forms) {
    const key = ini(f);
    for (const p of PREFIX[key] ?? []) dash.push(`${p}-${f}`);
    for (const s of SUFFIX[key] ?? []) space.push(`${f} ${s}`);
    // no word starting on the same letter: any of the stock ones (fewer, and after the neat ones)
    const h = hash(f.toLowerCase());
    for (let k = 0; k < 2; k++) other.push(`${ANY_PREFIX[(h + k) % ANY_PREFIX.length]!}-${f}`);
    other.push(`${f} ${ANY_SUFFIX[h % ANY_SUFFIX.length]!}`);
  }
  // the dashed ones first ("Turbo-Tobbe"), then "Lukas Lättfot", then the stock ones
  const same = [...dash, ...space];
  const out: string[] = [];
  for (const c of [...same, ...other]) if (c.length <= NAME_MAX && c.length >= 5 && isClean(c) && !out.includes(c) && c.toLowerCase() !== name.toLowerCase()) out.push(c);
  return out;
}

/**
 * The n-th suggestion for a name (0 is the first; "Nytt förslag" asks for the next), or null when there is no decent
 * one. The same name always starts on the same suggestion, and going round the list ends where it began.
 */
export function suggestRallyName(rawName: string, n = 0): string | null {
  const list = rallyNames(rawName);
  if (!list.length) return null;
  // the neatest first, then on through the list and round again
  return list[n % list.length]!;
}

/** What the game calls the player: the rally name when one was chosen, else the name, else "Du". */
export const displayName = (m: { name: string; alias: string }): string => m.alias || m.name || 'Du';
