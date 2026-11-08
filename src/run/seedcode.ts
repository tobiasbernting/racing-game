// Seed codes a kid can read out loud: a word and four digits, like KOSSA-4821. The code is the whole seed (the
// number the run is generated from), so the same code and the same difficulty give exactly the same run for
// everybody: map, courses, variants, offers and events. Pure functions, nothing is stored anywhere.
//
//   seed = (word index) * 10000 + digits + 1      (1 .. WORDS.length * 10000)
//
// A seed outside that range (a run saved before codes existed) has no code and is shown the old way.

/** Swedish farm, rally and silly words: A-Z only, so they are easy to type on any keyboard. */
export const SEED_WORDS: readonly string[] = [
  'KOSSA', 'TRAKTOR', 'HOBALJ', 'PANNKAKA', 'STUDS', 'SLADD', 'MACKEN', 'GRUS', 'LERA', 'DAMM',
  'SILO', 'LADA', 'HAGEN', 'KORV', 'MOPPE', 'TURBO', 'NITRO', 'DRIFT', 'BOXER', 'VAXT',
  'SKOGEN', 'MYREN', 'BRON', 'TUNNEL', 'RAMP', 'HOPP', 'SMALL', 'BULLER', 'KRASCH', 'SVAMP',
  'ALGEN', 'HJORT', 'HAREN', 'UGGLA', 'GASPEDAL', 'SOLROS', 'HALM', 'STRA', 'BLOMMA', 'GURKA',
  'BULLE', 'TOKIG', 'GALEN', 'KAOS', 'FEST', 'DISCO', 'KONFETTI', 'BALLONG', 'GLASS', 'LAKRITS',
  'PIRAT', 'ROBOT', 'DRAKEN', 'TROLLET', 'GNOMEN', 'GUMMI', 'DUNDER', 'ASKAN', 'BLIXT', 'MOLNET',
  'VINDEN', 'REGNET', 'FROSTEN', 'VINTER', 'SOMMAR', 'HOSTEN', 'FLAXA', 'KLISTER', 'TOFFLA', 'KASTRULL',
  'BANAN', 'PANDA', 'GRIS', 'GAS', 'FJADER', 'KAKTUS', 'BISON', 'ZEBRA', 'PAPEGOJA', 'PINGVIN',
  'LAMPAN', 'RATTEN', 'SKYLTEN', 'KLAXON', 'DEKAL', 'VIMPEL', 'HJULET', 'FELGEN', 'VEVEN', 'KOLVEN',
  'BAGGEN', 'DIKET', 'KURVAN', 'BACKEN', 'MARKEN', 'SLINGAN', 'FARTEN', 'MALET', 'KNALL', 'POFF',
];

/** Digits after the word. */
const DIGITS = 10000;

/** How many different runs a code can name. */
export const SEED_COUNT = SEED_WORDS.length * DIGITS;

/** The code of a seed (`KOSSA-4821`), or null for a seed no code stands for. */
export function seedCode(seed: number): string | null {
  if (!Number.isInteger(seed) || seed < 1 || seed > SEED_COUNT) return null;
  const i = seed - 1;
  return `${SEED_WORDS[Math.floor(i / DIGITS)]}-${String(i % DIGITS).padStart(4, '0')}`;
}

/** The seed for a word index and four digits (a random one when picking a new run). */
export const seedFromParts = (word: number, digits: number): number => word * DIGITS + digits + 1;

/** A fresh seed from a random 0..1 number (for new runs). */
export const randomSeed = (r: number = Math.random()): number => 1 + Math.min(SEED_COUNT - 1, Math.floor(r * SEED_COUNT));

export type SeedParse = { ok: true; seed: number; code: string } | { ok: false; message: string };

/**
 * Reads what somebody typed. Forgiving about case and about the separator (a hyphen, a dash, a space or nothing);
 * strict about the four digits. Anything else comes back as a friendly Swedish message instead of a run.
 */
export function parseSeedCode(input: string): SeedParse {
  const text = input.normalize('NFKC').trim().toUpperCase();
  if (!text) return { ok: false, message: 'Skriv en frökod, till exempel KOSSA-4821.' };
  const m = /^([A-ZÅÄÖ]+)[\s\-–—_.]*(\d+)$/.exec(text);
  if (!m) return { ok: false, message: 'Koden ska se ut som KOSSA-4821: ett ord, ett streck och fyra siffror.' };
  const word = SEED_WORDS.indexOf(m[1]!);
  const digits = m[2]!;
  if (digits.length !== 4) return { ok: false, message: 'Det ska vara exakt fyra siffror efter ordet, som KOSSA-4821.' };
  if (word < 0) return { ok: false, message: `Jag känner inte igen ordet ${m[1]}. Prova ett som KOSSA eller TRAKTOR.` };
  const seed = seedFromParts(word, Number(digits));
  return { ok: true, seed, code: seedCode(seed)! };
}

/** The code, or for an old seed without one the short base-36 label it used to have. */
export const seedLabelOf = (seed: number): string => seedCode(seed) ?? (seed >>> 0).toString(36).toUpperCase();
