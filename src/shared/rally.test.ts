import { describe, expect, it } from 'vitest';
import { CAR_BODIES, CAR_BODY_DEFS, CAR_PAINTS, PART_MAX_LEVEL, RALLY_COURSES, RALLY_COURSE_DEFS, RACE_DNF_PRIZE, carStars, carValue, cleanRules, defaultRules, newCar, racePrize, raceMedal } from './rally.ts';
import { CAR_BODY_NAMES, RALLY_COURSE_NAMES } from './names.ts';
import { cleanPrefs, defaultPrefs } from '../prefs.ts';
import { rallyOptions } from '../rally/options.ts';

describe('cars', () => {
  it('starts with a free, undamaged car in the given paint', () => {
    const car = newCar(1, 'hatch', 'Rallypyret', '#2f6fe0');
    expect(car.body).toBe('hatch');
    expect(car.style.paint).toBe('#2f6fe0');
    expect(car.damage).toBe(0);
    expect(Object.values(car.parts).every((l) => l === 0)).toBe(true);
    expect(carValue(car)).toBe(CAR_BODY_DEFS.hatch.price);
    expect(CAR_BODY_DEFS.hatch.price).toBe(0);
  });

  it('values parts level by level and rates them in 1..5 stars', () => {
    const car = newCar(1, 'monster', 'Bamse');
    const base = carValue(car);
    car.parts.engine = PART_MAX_LEVEL;
    expect(carValue(car)).toBeGreaterThan(base);
    for (const v of Object.values(carStars(car))) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('has a Swedish name for every body and course', () => {
    for (const b of CAR_BODIES) expect(CAR_BODY_NAMES[b]).toBeTruthy();
    for (const c of RALLY_COURSES) expect(RALLY_COURSE_NAMES[c]).toBeTruthy();
  });
});

describe('rules', () => {
  it('cleans junk into valid rules', () => {
    expect(cleanRules(null)).toEqual(defaultRules());
    expect(cleanRules('fast')).toEqual(defaultRules());
    const r = cleanRules({ course: 'narnia', laps: 99, ai: -3, damage: 'yes', difficulty: 'insane', time: 'night', weather: 'snow', nitro: 0, sameCars: 1, pickups: false, extra: 1 });
    expect(r).toEqual({ ...defaultRules(), laps: 5, ai: 0, time: 'night', pickups: false });
    expect(cleanRules({ laps: Number.POSITIVE_INFINITY }).laps).toBe(defaultRules().laps);
    expect(Object.keys(r).sort()).toEqual(Object.keys(defaultRules()).sort());
  });
});

describe('prizes and medals', () => {
  it('pays more for a better place and for harder rules', () => {
    const rules = defaultRules();
    const first = racePrize(rules, 1, 6);
    const last = racePrize(rules, 6, 6);
    expect(first).toBeGreaterThan(last);
    expect(last).toBeGreaterThan(RACE_DNF_PRIZE);
    expect(racePrize({ ...rules, difficulty: 'hard' }, 1, 6)).toBeGreaterThan(first);
    expect(racePrize({ ...rules, difficulty: 'easy' }, 1, 6)).toBeLessThan(first);
    expect(racePrize({ ...rules, damage: true }, 1, 6)).toBeGreaterThan(first);
  });

  it('pays a lone practice run a small fixed amount, whatever the place', () => {
    const rules = defaultRules();
    expect(racePrize(rules, 1, 1)).toBe(racePrize(rules, 5, 1));
    expect(racePrize(rules, 1, 1)).toBeLessThan(racePrize(rules, 1, 6));
  });

  it('gives gold, silver and bronze by time, nothing when slow', () => {
    const gold = RALLY_COURSE_DEFS.forest.gold * 1000 + 3000;
    expect(raceMedal('forest', 1, gold)).toBe('gold');
    expect(raceMedal('forest', 1, gold * 1.1)).toBe('silver');
    expect(raceMedal('forest', 1, gold * 1.3)).toBe('bronze');
    expect(raceMedal('forest', 1, gold * 2)).toBeNull();
    expect(raceMedal('forest', 3, gold * 3)).not.toBeNull();
  });
});

describe('picks', () => {
  it('cleans stored prefs into valid ones', () => {
    expect(cleanPrefs(null)).toEqual(defaultPrefs());
    expect(cleanPrefs({ course: 'narnia', body: 'tank', paint: 'red' })).toEqual(defaultPrefs());
    expect(cleanPrefs({ course: 'ice', body: 'buggy', paint: CAR_PAINTS[3] })).toEqual({ course: 'ice', body: 'buggy', paint: CAR_PAINTS[3], controls: defaultPrefs().controls });
  });

  it('reads race options only when they carry rules and a car', () => {
    expect(rallyOptions(undefined)).toBeNull();
    expect(rallyOptions({ rules: defaultRules() })).toBeNull();
    const o = { rules: defaultRules(), car: newCar(1, 'hatch', 'x') };
    expect(rallyOptions(o)).toBe(o);
  });
});
