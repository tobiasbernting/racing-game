// The styling garage's rules, pure: cleaning whatever is stored into a valid CarStyle, which options a body can wear,
// the plate text filter and the random "Slumpa" combo. No I/O and no three.js, so tests run it anywhere.
import {
  CAR_DECALS,
  CAR_EXTRAS,
  CAR_FINISHES,
  CAR_HORNS,
  CAR_LIVERIES,
  CAR_PAINTS,
  CAR_SMOKES,
  CAR_SPOILERS,
  CAR_WHEELS,
  DECAL_SLOTS,
  HELMET_DESIGNS,
  PLATE_MAX,
  defaultStyle,
  isHelmetDesign,
  type CarBody,
  type CarDecal,
  type CarExtra,
  type CarSpoiler,
  type CarStyle,
  type CarWheels,
} from './rally.ts';
import { isClean } from './words.ts';

const isIn = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** A #rrggbb colour (the custom colour picker gives these). */
export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const hex = (v: unknown, def: string): string => (isHex(v) ? v.toLowerCase() : def);

// ---- the plate ----

/** What a plate can hold: letters (å ä ö too), digits, a space and a dash, in capitals. */
export function tidyPlate(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return Array.from(
    raw
      .normalize('NFC')
      .toUpperCase()
      .replace(/[^\p{L}\p{N} \-]/gu, '')
      .replace(/\s+/g, ' ')
      .trimStart(),
  )
    .slice(0, PLATE_MAX)
    .join('')
    .trimEnd();
}

/** The plate text as it will be kept: tidied, or '' when the language rules refuse it. */
export const cleanPlate = (raw: unknown): string => {
  const t = tidyPlate(raw);
  return t && isClean(t) ? t : '';
};

/** Why the text typed so far cannot go on a plate (empty when it is fine). */
export const plateProblem = (raw: string): string => (isClean(tidyPlate(raw)) ? '' : 'Det där får inte stå på en skylt. Prova något annat!');

// ---- what a body can wear ----

const TWO_WHEELS: readonly CarBody[] = ['moto', 'moped'];
/** Bodies with no wheel arches to hang skirts or a snorkel on. */
const NO_ARCH: readonly CarBody[] = ['moto', 'moped', 'snowmobile', 'kart', 'mower', 'cart', 'sofa'];
/** Bodies with big knobbly tyres of their own: the rim colour shows, the rim shape does not change. */
const OWN_TYRES: readonly CarBody[] = ['atv', 'tractor'];

export interface Fit {
  spoilers: readonly CarSpoiler[];
  extras: readonly CarExtra[];
  wheels: readonly CarWheels[];
  /** What is left out for this body, as a line for the garage ("" = nothing). */
  note: string;
}

/** The options that sit sensibly on this body. Everything else is hidden in the garage and quietly dropped from the look. */
export function fitOf(body: CarBody): Fit {
  const bike = TWO_WHEELS.includes(body);
  const spoilers: readonly CarSpoiler[] = bike || body === 'cart' || body === 'mower' ? ['none', 'small'] : body === 'snowmobile' || body === 'kart' ? ['none', 'small', 'big'] : CAR_SPOILERS;
  const extras = CAR_EXTRAS.filter((e) => !(NO_ARCH.includes(body) && (e === 'sideskirts' || e === 'snorkel')));
  const wheels: readonly CarWheels[] = OWN_TYRES.includes(body) ? ['offroad'] : CAR_WHEELS;
  const notes: string[] = [];
  if (spoilers.length < CAR_SPOILERS.length) notes.push('de stora spoilrarna');
  if (extras.length < CAR_EXTRAS.length) notes.push('sidokjolar och snorkel');
  if (wheels.length < CAR_WHEELS.length) notes.push('andra fälgar (däcken är terrängdäck)');
  return { spoilers, extras, wheels, note: notes.length ? `Passar inte här: ${notes.join(', ')}.` : '' };
}

/** The style with whatever does not fit this body taken out (the stored look is kept; this is for drawing and for saving per body). */
export function fitStyle(body: CarBody, style: CarStyle): CarStyle {
  const f = fitOf(body);
  return {
    ...style,
    spoiler: f.spoilers.includes(style.spoiler) ? style.spoiler : 'small',
    extras: style.extras.filter((e) => f.extras.includes(e)),
    wheels: f.wheels.includes(style.wheels) ? style.wheels : f.wheels[0]!,
  };
}

// ---- cleaning ----

/** Anything stored (or junk) becomes a complete, valid style. Fields that are missing keep the default look. */
export function cleanStyle(raw: unknown, base: CarStyle = defaultStyle()): CarStyle {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = base;
  let decals: CarStyle['decals'] = d.decals;
  if (o.decals && typeof o.decals === 'object' && !Array.isArray(o.decals)) {
    const src = o.decals as Record<string, unknown>;
    decals = {};
    for (const slot of DECAL_SLOTS) if (isIn(CAR_DECALS, src[slot])) decals[slot] = src[slot];
  }
  const num = typeof o.number === 'number' && Number.isFinite(o.number) ? Math.max(1, Math.min(99, Math.floor(o.number))) : d.number;
  return {
    paint: hex(o.paint, d.paint),
    paint2: hex(o.paint2, d.paint2),
    finish: isIn(CAR_FINISHES, o.finish) ? o.finish : d.finish,
    livery: isIn(CAR_LIVERIES, o.livery) ? o.livery : d.livery,
    decals: { ...decals },
    number: num,
    wheels: isIn(CAR_WHEELS, o.wheels) ? o.wheels : d.wheels,
    rimColor: hex(o.rimColor, d.rimColor),
    spoiler: isIn(CAR_SPOILERS, o.spoiler) ? o.spoiler : d.spoiler,
    extras: Array.isArray(o.extras) ? [...new Set(o.extras.filter((e): e is CarExtra => isIn(CAR_EXTRAS, e)))] : [...d.extras],
    horn: isIn(CAR_HORNS, o.horn) ? o.horn : d.horn,
    glow: o.glow === null ? null : isHex(o.glow) ? o.glow.toLowerCase() : d.glow,
    // every driver is a person in a helmet; the helmet pattern 'ears' belonged to a boss only
    driver: 'human',
    helmet: isHelmetDesign(o.helmet) ? o.helmet : d.helmet === ('ears' as string) ? 'stripe' : d.helmet,
    helmetColor: o.helmetColor === '' ? '' : hex(o.helmetColor, d.helmetColor),
    smoke: isIn(CAR_SMOKES, o.smoke) ? o.smoke : d.smoke,
    plate: 'plate' in o ? cleanPlate(o.plate) : d.plate,
  };
}

/** The same look? (the garage compares to know whether "Återställ" has anything to do). */
export const sameStyle = (a: CarStyle, b: CarStyle): boolean => JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
function normalise(s: CarStyle): unknown {
  return { ...s, extras: [...s.extras].sort(), decals: DECAL_SLOTS.map((k) => s.decals[k] ?? null) };
}

// ---- Slumpa: a random combination that still looks like somebody meant it ----

const luma = (h: string): number => {
  const n = parseInt(h.slice(1), 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
};

/** A random look for a body, drawn from `rnd` (0..1). The plate, the horn and the number are kept from `keep`. */
export function randomStyle(body: CarBody, rnd: () => number, keep: CarStyle = defaultStyle(), open: (key: string) => boolean = () => true): CarStyle {
  const pick = <T>(l: readonly T[]): T => l[Math.min(l.length - 1, Math.floor(rnd() * l.length))]!;
  /** Draws from the items that are open to this player (medal prizes they have not earned are left out). */
  const pickOpen = <T extends string>(kind: string, l: readonly T[]): T => pick(l.filter((v) => open(`${kind}:${v}`)));
  const f = fitOf(body);
  const paint = pick(CAR_PAINTS);
  // the second colour must be easy to tell from the first
  let paint2 = pick(CAR_PAINTS);
  for (let i = 0; i < 12 && Math.abs(luma(paint2) - luma(paint)) < 0.3; i++) paint2 = pick(CAR_PAINTS);
  if (Math.abs(luma(paint2) - luma(paint)) < 0.3) paint2 = luma(paint) > 0.5 ? '#16161a' : '#f2f2f2';
  const decals: CarStyle['decals'] = {};
  for (const slot of DECAL_SLOTS) if (rnd() < 0.75) decals[slot] = pickOpen('decal', CAR_DECALS);
  const extras: CarExtra[] = [];
  for (let i = Math.floor(rnd() * 4); i > 0; i--) {
    const e = pick(f.extras);
    if (!extras.includes(e)) extras.push(e);
  }
  const hDesign = pick(HELMET_DESIGNS);
  const style: CarStyle = {
    ...keep,
    paint,
    paint2,
    finish: pick(CAR_FINISHES),
    livery: rnd() < 0.2 ? 'none' : pickOpen('livery', CAR_LIVERIES),
    decals,
    wheels: pickOpen('wheels', f.wheels),
    rimColor: pick(CAR_PAINTS),
    spoiler: pick(f.spoilers),
    extras,
    glow: rnd() < 0.3 ? pick(CAR_PAINTS) : null,
    smoke: pickOpen('smoke', CAR_SMOKES),
    helmet: hDesign,
    helmetColor: rnd() < 0.6 ? pick(CAR_PAINTS) : '',
  };
  return fitStyle(body, style);
}
