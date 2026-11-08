// How fast each of the twenty vehicles really goes (the actual car, the actual computer driver), set against the
// per-vehicle lap factors the balance simulation uses (BODY_LAP in shared/pace.ts). Owner rule: every vehicle is a real
// choice, so nobody is hopelessly slow round a lap (within 5 % of the plain rallybil on average) or on a straight
// (top speed within 15 % of the fastest).
import { describe, expect, it } from 'vitest';
import { BODY_LAP } from '../shared/pace.ts';
import { CAR_BODIES, type RallyCourse } from '../shared/rally.ts';
import { GEARBOXES } from './gears.ts';
import { bestLap, topSpeed } from './bodylap.ts';

const COURSES: RallyCourse[] = ['farm', 'desert', 'ice', 'city', 'meadow', 'mountain'];

describe('every vehicle against the lap factors of the balance simulation', { timeout: 120_000 }, () => {
  it('the factor of each vehicle is the real physics, on average over four courses, within a few percent', () => {
    const base = COURSES.map((c) => bestLap(c, 'hatch').lap);
    const out: string[] = [];
    for (const b of CAR_BODIES) {
      const ratios = COURSES.map((c, i) => bestLap(c, b).lap / base[i]!);
      const mean = ratios.reduce((a, x) => a + x, 0) / ratios.length;
      out.push(`${b}: ${ratios.map((r) => r.toFixed(3)).join(' ')} mean ${mean.toFixed(3)} model ${BODY_LAP[b]}`);
      expect(Math.abs(mean / BODY_LAP[b] - 1), b).toBeLessThan(0.02);
      // and nobody is more than 5 % off the plain car's lap on average: all twenty are viable
      expect(Math.abs(mean - 1), b).toBeLessThan(0.05);
    }
    console.log(out.join('\n'));
  });

  it('a computer driver gets every vehicle round four courses without losing its mind (a rival can drive any of them)', () => {
    for (const b of CAR_BODIES) for (const c of COURSES) expect(bestLap(c, b, [0.9]).lap, `${b} on ${c}`).toBeLessThan(160);
  });

  it('a computer rival (half the body power, plain tyres, no burst) in any vehicle laps within 6 % of a rival in the rallybil: the field is competitive whatever it drives', () => {
    const base = COURSES.map((c) => bestLap(c, 'hatch', [0.9], true).lap);
    const out: string[] = [];
    for (const b of CAR_BODIES) {
      const r = COURSES.map((c, i) => bestLap(c, b, [0.9], true).lap / base[i]!);
      const mean = r.reduce((a, x) => a + x, 0) / r.length;
      out.push(`${b} ${mean.toFixed(3)}`);
      expect(Math.abs(mean - 1), b).toBeLessThan(0.06);
    }
    console.log('rival laps vs a rival rallybil:', out.join(', '));
  });

  it('every vehicle reaches a top speed within 15 % of the fastest one on a straight (in 15 s and flat out), and its gearbox has the gears for it', () => {
    const tops = Object.fromEntries(CAR_BODIES.map((b) => [b, topSpeed(b, 15)])) as Record<(typeof CAR_BODIES)[number], number>;
    const flat = Object.fromEntries(CAR_BODIES.map((b) => [b, topSpeed(b, 40)])) as Record<(typeof CAR_BODIES)[number], number>;
    console.log(CAR_BODIES.map((b) => `${b} ${(tops[b] * 3.6).toFixed(0)}/${(flat[b] * 3.6).toFixed(0)} km/h`).join(', '));
    const fastest = Math.max(...Object.values(tops));
    const fastestFlat = Math.max(...Object.values(flat));
    for (const b of CAR_BODIES) {
      expect(tops[b], b).toBeGreaterThanOrEqual(0.85 * fastest);
      expect(flat[b], b).toBeGreaterThanOrEqual(0.85 * fastestFlat);
      // the top gear reaches (about) the speed the vehicle really gets to
      const gears = GEARBOXES[b].v;
      if (b !== 'cart') expect(gears[gears.length - 1]!, b).toBeGreaterThanOrEqual(tops[b] * 0.95);
    }
  });
});
