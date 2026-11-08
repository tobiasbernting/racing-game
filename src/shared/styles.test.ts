import { describe, expect, it } from 'vitest';
import { CAR_BODIES, CAR_DECALS, CAR_EXTRAS, CAR_LIVERIES, CAR_SPOILERS, PLATE_MAX, defaultStyle } from './rally.ts';
import { cleanPlate, cleanStyle, fitOf, fitStyle, isHex, plateProblem, randomStyle, sameStyle, tidyPlate } from './styles.ts';
import { DECAL_NAMES, EXTRA_NAMES, HORN_NAMES, LIVERY_NAMES, SMOKE_NAMES, SPOILER_NAMES, WHEEL_NAMES } from './stylenames.ts';
import { CAR_HORNS, CAR_SMOKES, CAR_WHEELS } from './rally.ts';
import { lockKeys, lockedBy } from '../run/stylelocks.ts';

/** A small seeded generator, so a failure can be repeated. */
const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

describe('the number plate', () => {
  it('is cut to the plate length, in capitals, with only letters, digits, space and dash', () => {
    expect(tidyPlate('kalle 7')).toBe('KALLE 7');
    expect(tidyPlate('abcdefghijkl')).toHaveLength(PLATE_MAX);
    expect(tidyPlate('åäö-12!?😀')).toBe('ÅÄÖ-12');
    expect(tidyPlate('   a   b ')).toBe('A B');
    expect(tidyPlate(42)).toBe('');
  });

  it('is filtered by the language rules like names and chat', () => {
    for (const bad of ['KUKEN', 'SKIT', 'FAN', 'S K I T', 'HELVETE', 'PISS', 'KNULL', 'F1TT', 'RÖV', 'IDIOT']) {
      expect(cleanPlate(bad), bad).toBe('');
      expect(plateProblem(bad), bad).not.toBe('');
    }
    for (const fine of ['KALLE', 'GRUS 7', 'FANFAR', 'LILLA-1', 'TURBO', 'ÅKE']) {
      expect(cleanPlate(fine), fine).toBe(fine);
      expect(plateProblem(fine), fine).toBe('');
    }
  });

  it('is cleaned out of a stored style too', () => {
    expect(cleanStyle({ plate: 'SKIT' }).plate).toBe('');
    expect(cleanStyle({ plate: 'ok 1' }).plate).toBe('OK 1');
    expect(cleanStyle({}).plate).toBe('');
  });
});

describe('cleaning a style', () => {
  it('fills in everything, and replaces what is wrong', () => {
    const s = cleanStyle({ paint: 'blue', paint2: '#ABCDEF', finish: 'shiny', livery: 'hazard', decals: { hood: 'cow', sky: 'star', roof: 'nope' }, number: 12.7, wheels: 'x', extras: 'cone', glow: 'nope', helmet: 'ears', helmetColor: '#00ff00', smoke: 'gold' });
    expect(s.paint).toBe(defaultStyle().paint);
    expect(s.paint2).toBe('#abcdef');
    expect(s.finish).toBe('gloss');
    expect(s.livery).toBe('hazard');
    expect(s.decals).toEqual({ hood: 'cow' });
    expect(s.number).toBe(12);
    expect(s.wheels).toBe('steel');
    expect(s.extras).toEqual([]);
    expect(s.glow).toBeNull();
    expect(s.helmet).toBe('stripe');
    expect(s.helmetColor).toBe('#00ff00');
    expect(s.smoke).toBe('gold');
    expect(s.driver).toBe('human');
  });

  it('keeps any colour the colour picker gives, and an empty decal list', () => {
    expect(cleanStyle({ paint: '#0a0B0c' }).paint).toBe('#0a0b0c');
    expect(cleanStyle({ decals: {} }).decals).toEqual({});
    expect(cleanStyle({ glow: null }).glow).toBeNull();
    expect(cleanStyle({ glow: '#19e3ff' }).glow).toBe('#19e3ff');
    expect(isHex('#12345')).toBe(false);
    expect(isHex('red')).toBe(false);
  });

  it('is stable: cleaning a clean style changes nothing', () => {
    const s = cleanStyle({ ...defaultStyle(), livery: 'splat', extras: ['korv', 'cone'], plate: 'ABC 12', glow: '#ff00aa' });
    expect(cleanStyle(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(sameStyle(s, cleanStyle(s))).toBe(true);
    expect(sameStyle(s, { ...s, extras: ['cone', 'korv'] })).toBe(true);
    expect(sameStyle(s, { ...s, livery: 'rust' })).toBe(false);
  });

  it('has a Swedish name for every option', () => {
    for (const l of CAR_LIVERIES) expect(LIVERY_NAMES[l]).toBeTruthy();
    for (const d of CAR_DECALS) expect(DECAL_NAMES[d]).toBeTruthy();
    for (const e of CAR_EXTRAS) expect(EXTRA_NAMES[e]).toBeTruthy();
    for (const w of CAR_WHEELS) expect(WHEEL_NAMES[w]).toBeTruthy();
    for (const s of CAR_SPOILERS) expect(SPOILER_NAMES[s]).toBeTruthy();
    for (const h of CAR_HORNS) expect(HORN_NAMES[h]).toBeTruthy();
    for (const s of CAR_SMOKES) expect(SMOKE_NAMES[s]).toBeTruthy();
  });
});

describe('what each body can wear', () => {
  it('every body offers at least no spoiler and a small one, some extras, and a wheel', () => {
    for (const b of CAR_BODIES) {
      const f = fitOf(b);
      expect(f.spoilers).toContain('none');
      expect(f.spoilers).toContain('small');
      expect(f.extras.length).toBeGreaterThanOrEqual(CAR_EXTRAS.length - 2);
      expect(f.wheels.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('the bikes lose the big spoilers, skirts and snorkel; the tractor and ATV keep their own tyres; a hatchback loses nothing', () => {
    for (const b of ['moto', 'moped'] as const) {
      expect(fitOf(b).spoilers).toEqual(['none', 'small']);
      expect(fitOf(b).extras).not.toContain('sideskirts');
      expect(fitOf(b).extras).not.toContain('snorkel');
      expect(fitOf(b).extras).toContain('cone');
    }
    expect(fitOf('tractor').wheels).toEqual(['offroad']);
    expect(fitOf('atv').wheels).toEqual(['offroad']);
    expect(fitOf('hatch').note).toBe('');
    expect(fitOf('moto').note).not.toBe('');
  });

  it('fitStyle only removes what does not fit', () => {
    const all = { ...defaultStyle(), spoiler: 'wing' as const, extras: [...CAR_EXTRAS], wheels: 'star' as const, livery: 'hazard' as const };
    expect(fitStyle('hatch', all)).toEqual(all);
    const moto = fitStyle('moto', all);
    expect(moto.spoiler).toBe('small');
    expect(moto.extras).toHaveLength(CAR_EXTRAS.length - 2);
    expect(moto.wheels).toBe('star');
    expect(moto.livery).toBe('hazard');
    expect(fitStyle('tractor', all).wheels).toBe('offroad');
  });
});

describe('Slumpa', () => {
  it('always gives a valid look that fits the body, with the plate, number and horn kept', () => {
    const rnd = lcg(7);
    const keep = { ...defaultStyle(), plate: 'MIN BIL', number: 42, horn: 'cow' as const };
    for (const b of CAR_BODIES)
      for (let i = 0; i < 25; i++) {
        const s = randomStyle(b, rnd, keep);
        expect(cleanStyle(s)).toEqual(s);
        expect(fitStyle(b, s)).toEqual(s);
        expect(s.plate).toBe('MIN BIL');
        expect(s.number).toBe(42);
        expect(s.horn).toBe('cow');
        expect(s.paint2).not.toBe(s.paint);
      }
  });

  it('is different each time, and never uses a prize that is still locked', () => {
    const rnd = lcg(99);
    const seen = new Set<string>();
    const locked = new Set(lockKeys());
    for (let i = 0; i < 200; i++) {
      const s = randomStyle('hatch', rnd, defaultStyle(), (k) => !locked.has(k));
      seen.add(JSON.stringify(s));
      expect(s.livery).not.toBe('flames');
      expect(s.wheels).not.toBe('gold');
      expect(s.smoke).not.toBe('gold');
      expect(Object.values(s.decals)).not.toContain('crown');
    }
    expect(seen.size).toBeGreaterThan(190);
  });
});

describe('the prizes', () => {
  it('stay locked until their medal is earned, and say which one', () => {
    const m = lockedBy({}, 'wheels:gold');
    expect(m?.name).toBeTruthy();
    expect(lockedBy({ win: 1 }, 'wheels:gold')).toBeNull();
    expect(lockedBy({}, 'wheels:steel')).toBeNull();
    expect(lockKeys().length).toBeGreaterThan(0);
  });
});
