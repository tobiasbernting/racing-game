// The look of each vehicle, kept in localStorage: every one of the twenty bodies has its own saved style (paint, livery, stickers,
// wheels, extras, helmet, plate…). Versioned and wrapped in try/catch like the other saves. The first time (no styles saved yet)
// the paint and helmet the old saves had (the meta's single paint, the quick race's paint) are carried over, so nobody loses their colour.
import { CAR_BODIES, CAR_PAINTS, defaultStyle, isCarBody, type CarBody, type CarStyle } from '../shared/rally.ts';
import { cleanStyle, fitStyle } from '../shared/styles.ts';

export const STYLES_KEY = 'galna-rallyt:styles:v1';
const META_KEY = 'galna-rallyt:meta:v1';
const PREFS_KEY = 'galna-rallyt:prefs:v1';

export type StyleBook = Record<CarBody, CarStyle>;

/** The start look of a body: its own colour from the palette (the first body keeps the rally red). */
export const startStyle = (body: CarBody): CarStyle => fitStyle(body, defaultStyle(CAR_PAINTS[CAR_BODIES.indexOf(body) % 12]));

export const defaultBook = (): StyleBook => Object.fromEntries(CAR_BODIES.map((b) => [b, startStyle(b)])) as StyleBook;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Anything stored (or junk) becomes a complete book: every body has a valid style that fits it. */
export function cleanBook(raw: unknown): StyleBook {
  const book = defaultBook();
  const src = isObj(raw) && isObj(raw.styles) ? raw.styles : {};
  for (const b of CAR_BODIES) if (b in src) book[b] = fitStyle(b, cleanStyle(src[b], startStyle(b)));
  return book;
}

/** The old single paint and helmet become each body's style: the helmet for all, the paint for the vehicle it was picked on. */
export function migrateBook(meta: unknown, prefs?: unknown): StyleBook {
  const book = defaultBook();
  const m = isObj(meta) ? meta : {};
  const p = isObj(prefs) ? prefs : {};
  const helm = { helmet: m.helmet, helmetColor: m.helmetColor };
  for (const b of CAR_BODIES) book[b] = fitStyle(b, cleanStyle(helm, startStyle(b)));
  // the quick race remembered its own body and paint; the run's pick screen (the meta) wins when both name the same body
  if (isCarBody(p.body)) book[p.body] = fitStyle(p.body, cleanStyle({ ...book[p.body], paint: p.paint }, book[p.body]));
  if (isCarBody(m.body)) book[m.body] = fitStyle(m.body, cleanStyle({ ...book[m.body], paint: m.paint }, book[m.body]));
  return book;
}

function read(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function saveBook(book: StyleBook): void {
  try {
    localStorage.setItem(STYLES_KEY, JSON.stringify({ v: 1, styles: book }));
  } catch {
    // private mode or full: the looks last for this visit
  }
}

/** The saved looks; with none saved yet, the old paint and helmet are carried over (and saved). */
export function loadBook(): StyleBook {
  const raw = read(STYLES_KEY);
  if (isObj(raw)) return cleanBook(raw);
  const book = migrateBook(read(META_KEY), read(PREFS_KEY));
  saveBook(book);
  return book;
}

/** A copy of a body's style that is safe to hand to a race (the book itself is never shared with a model or a run). */
export const styleOf = (book: StyleBook, body: CarBody): CarStyle => structuredClone(book[body]);
