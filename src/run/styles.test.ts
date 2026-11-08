// The garage's saves: every vehicle keeps its own look, the old single paint and helmet are carried over once, and junk never breaks it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CAR_BODIES, CAR_EXTRAS, CAR_PAINTS, defaultStyle } from '../shared/rally.ts';
import { STYLES_KEY, cleanBook, defaultBook, loadBook, migrateBook, saveBook, startStyle, styleOf } from './styles.ts';
import { META_KEY, parseRun, saveRun } from './save.ts';
import { newRun } from './state.ts';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}
let store: MemoryStorage;
beforeEach(() => {
  store = new MemoryStorage();
  (globalThis as unknown as { localStorage: unknown }).localStorage = store;
});
afterEach(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

describe('a look for each vehicle', () => {
  it('starts every one of the twenty with a style of its own, the first one rally red', () => {
    const book = defaultBook();
    expect(Object.keys(book)).toHaveLength(CAR_BODIES.length);
    expect(book.hatch.paint).toBe(CAR_PAINTS[0]);
    expect(new Set(CAR_BODIES.slice(0, 12).map((b) => book[b].paint)).size).toBe(12);
  });

  it('saves and loads each vehicle separately', () => {
    const book = loadBook();
    book.moto = { ...book.moto, paint: '#123456', livery: 'hazard', extras: ['cone', 'duck'], plate: 'VROOM', decals: { roof: 'crown' } };
    book.tractor = { ...book.tractor, wheels: 'offroad', helmet: 'bolt', helmetColor: '#d63aa5', smoke: 'gold' };
    saveBook(book);
    const again = loadBook();
    expect(again.moto.paint).toBe('#123456');
    expect(again.moto.livery).toBe('hazard');
    expect(again.moto.extras).toEqual(['cone', 'duck']);
    expect(again.moto.plate).toBe('VROOM');
    expect(again.moto.decals).toEqual({ roof: 'crown' });
    expect(again.tractor.helmet).toBe('bolt');
    expect(again.tractor.helmetColor).toBe('#d63aa5');
    // the others are untouched
    expect(again.hatch).toEqual(defaultBook().hatch);
    expect(again.moped.livery).toBe('none');
    expect(JSON.parse(store.data.get(STYLES_KEY)!).v).toBe(1);
  });

  it('hands out copies: changing one never changes the saved book or another run', () => {
    const book = defaultBook();
    const a = styleOf(book, 'hatch');
    a.extras.push('korv');
    a.decals.roof = 'star';
    expect(book.hatch.extras).toEqual([]);
    expect(book.hatch.decals.roof).toBeUndefined();
  });

  it('carries over the old paint and helmet once (no styles saved yet)', () => {
    store.setItem(META_KEY, JSON.stringify({ v: 1, body: 'moped', paint: '#2f6fe0', helmet: 'flame', helmetColor: '#ffd700' }));
    store.setItem('galna-rallyt:prefs:v1', JSON.stringify({ body: 'sofa', paint: '#8a4fd8' }));
    const book = loadBook();
    expect(book.moped.paint).toBe('#2f6fe0');
    expect(book.sofa.paint).toBe('#8a4fd8');
    // the helmet was one for everybody
    for (const b of CAR_BODIES) {
      expect(book[b].helmet).toBe('flame');
      expect(book[b].helmetColor).toBe('#ffd700');
    }
    // a vehicle neither save knew gets its own start colour
    expect(book.hatch.paint).toBe(startStyle('hatch').paint);
    // and it was saved: the next load reads the book, not the old saves
    store.setItem(META_KEY, JSON.stringify({ v: 1, body: 'moped', paint: '#ff0000' }));
    expect(loadBook().moped.paint).toBe('#2f6fe0');
  });

  it('migrates when the quick race and the run named the same vehicle: the run wins', () => {
    const book = migrateBook({ body: 'hatch', paint: '#2fa84f' }, { body: 'hatch', paint: '#f4c20d' });
    expect(book.hatch.paint).toBe('#2fa84f');
  });

  it('migrates from nothing, and from junk', () => {
    expect(migrateBook(null, undefined)).toEqual(defaultBook());
    expect(migrateBook('x', 7).hatch.paint).toBe(CAR_PAINTS[0]);
    expect(migrateBook({ body: 'nope', paint: 5, helmet: 'ears' }).hatch.helmet).toBe('stripe');
  });

  it('survives junk in storage', () => {
    store.setItem(STYLES_KEY, '{not json');
    expect(loadBook().hatch.paint).toBe(CAR_PAINTS[0]);
    expect(cleanBook({ styles: { moto: { paint: 'red', livery: 'banana', extras: ['cone', 'x', 'cone'], decals: { hood: 'nope', roof: 'star' }, number: 500, plate: 'ok' } } }).moto).toMatchObject({
      paint: startStyle('moto').paint,
      livery: 'none',
      extras: ['cone'],
      decals: { roof: 'star' },
      number: 99,
      plate: 'OK',
    });
    expect(cleanBook(null)).toEqual(defaultBook());
  });

  it('drops what does not fit the body when loading, and keeps every other option', () => {
    const book = cleanBook({ styles: { moto: { spoiler: 'wing', extras: [...CAR_EXTRAS], wheels: 'gold' }, tractor: { wheels: 'star' } } });
    expect(book.moto.spoiler).toBe('small');
    expect(book.moto.extras).not.toContain('sideskirts');
    expect(book.moto.extras).not.toContain('snorkel');
    expect(book.moto.extras).toContain('korv');
    expect(book.moto.wheels).toBe('gold');
    expect(book.tractor.wheels).toBe('offroad');
  });

  it('a run starts with the vehicle\'s whole look, and keeps it through a save', () => {
    const style = { ...defaultStyle('#abcdef'), livery: 'rust' as const, extras: ['duck' as const], plate: 'KALLE', glow: '#19e3ff', helmet: 'wing' as const };
    const run = newRun({ seed: 5, body: 'moto', paint: style.paint, style });
    expect(run.car.style).toEqual(style);
    saveRun(run);
    const back = parseRun(JSON.parse(store.data.get('galna-rallyt:run:v1')!));
    expect(back?.car.style).toMatchObject({ paint: '#abcdef', livery: 'rust', extras: ['duck'], plate: 'KALLE', glow: '#19e3ff', helmet: 'wing' });
  });

  it('an old run save (only paint and a few fields) still loads with the rest at default', () => {
    const run = newRun({ seed: 9, body: 'hatch', paint: '#2f6fe0' });
    const raw = JSON.parse(JSON.stringify(run)) as { car: { style: Record<string, unknown> } };
    raw.car.style = { paint: '#2f6fe0', paint2: '#f2f2f2', helmet: 'ears', driver: 'cow' };
    const back = parseRun(raw);
    expect(back?.car.style.paint).toBe('#2f6fe0');
    expect(back?.car.style.driver).toBe('human');
    expect(back?.car.style.helmet).toBe('stripe');
    expect(back?.car.style.wheels).toBe('steel');
  });
});
