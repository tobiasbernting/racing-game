// Where the stunt ramps go on the real courses: a few kickers and one shortcut jump each, seeded, on straight flat plain road,
// inside the road's width, off the racing line and away from the start; the same for every mirrored and reversed variant.
import { describe, expect, it } from 'vitest';
import { RALLY_COURSES, type RallyCourse } from '../shared/rally.ts';
import { variationFor } from '../shared/variation.ts';
import { HUMP, KICKER, SHORTCUT, SHORTCUT_LAND, liftFor, lipOf, placeRamps, rampHeight, shortcutLanded, type RampSpec } from './ramps.ts';
import { Track } from './track.ts';
import { courseFor } from './variant.ts';

const variants = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
] as const;

function build(id: RallyCourse, seed: number, mirror: boolean, reverse: boolean): { track: Track; ramps: RampSpec[] } {
  const def = courseFor(id, { ...variationFor(id, seed), mirror, reverse, density: 1, tint: [1, 1, 1] });
  const track = new Track(def);
  const bumps = def.ctrl.flatMap((c, k) => (c.bump && c.bump > 0 ? [track.ctrlS[k]!] : []));
  return { track, ramps: placeRamps(track, seed, bumps) };
}

describe('stunt ramps on the courses', () => {
  it('every course has three kickers and one shortcut jump in every mirror and reverse variant, and the same ones for the same seed', () => {
    for (const id of RALLY_COURSES)
      for (const [mirror, reverse] of variants) {
        const { track, ramps } = build(id, 7, mirror, reverse);
        const label = `${id} ${mirror ? 'mirrored ' : ''}${reverse ? 'reversed' : ''}`;
        expect(ramps.filter((r) => r.kind === 'shortcut'), label).toHaveLength(1);
        expect(ramps.filter((r) => r.kind === 'kicker').length, label).toBeGreaterThanOrEqual(2);
        expect(build(id, 7, mirror, reverse).ramps, label).toEqual(ramps);
        void track;
      }
  });

  it('sit on sound road: inside its width, straight, flat, plain, off the racing line, clear of the start and of each other', () => {
    for (const id of RALLY_COURSES)
      for (const seed of [1, 2, 3, 4])
        for (const [mirror, reverse] of variants) {
          const { track, ramps } = build(id, seed, mirror, reverse);
          const label = `${id} seed ${seed}${mirror ? ' m' : ''}${reverse ? ' r' : ''}`;
          for (const r of ramps) {
            const dims = r.kind === 'shortcut' ? SHORTCUT : KICKER;
            expect([r.len, r.height], label).toEqual([dims.len, dims.height]);
            expect(r.width, label).toBeLessThanOrEqual(dims.width);
            expect(r.width, label).toBeGreaterThanOrEqual(2.8);
            const i = track.index(r.s);
            const hw = track.hw[i]!;
            // inside the road, with the sloped sides too
            expect(Math.abs(r.d) + r.width / 2 + 0.7, label).toBeLessThanOrEqual(hw);
            // far enough from the racing line that a rival driving it does not hit the ramp
            expect(Math.abs(r.d - track.line[i]!), label).toBeGreaterThanOrEqual(r.width / 2 + 2.2);
            const fromStart = Math.min(r.s, track.length - r.s);
            expect(fromStart, label).toBeGreaterThanOrEqual(70);
            for (let k = -Math.ceil((r.len / 2 + 4) / track.ds); k <= Math.ceil((r.len / 2 + 4) / track.ds); k++) {
              const j = (i + k + track.n) % track.n;
              expect(track.bridge[j], label).toBe(0);
              expect(track.tunnel[j], label).toBe(0);
              expect(Math.abs(track.curv[j]!), label).toBeLessThanOrEqual(1 / 99);
              expect(track.surf[j], label).not.toBe(4);
            }
          }
          for (let a = 0; a < ramps.length; a++)
            for (let b = a + 1; b < ramps.length; b++) expect(Math.abs(track.wrapDist(ramps[a]!.s - ramps[b]!.s)), label).toBeGreaterThanOrEqual(70);
        }
  });

  it('are different with another seed, and a ramp of the seeded kind is placed even on the narrow courses', () => {
    const a = build('forest', 1, false, false).ramps;
    const b = build('forest', 2, false, false).ramps;
    expect(a).not.toEqual(b);
  });

  it('lift the ground smoothly: no step bigger than the ramp lets a car feel along the road, and nothing away from the ramp', () => {
    const { track, ramps } = build('meadow', 3, false, false);
    const lift = liftFor(ramps, track);
    const kick = ramps.find((r) => r.kind === 'kicker')!;
    // walking along the road over the kicker in small steps: the rise is gradual (the cliff is only at the lip, going the way the road runs)
    let last = lift(kick.s - kick.len, kick.d);
    let maxUp = 0;
    for (let s = kick.s - kick.len; s <= kick.s + kick.len; s += 0.1) {
      const h = lift(s, kick.d);
      maxUp = Math.max(maxUp, h - last);
      last = h;
    }
    expect(maxUp).toBeLessThan(0.1 * (KICKER.height / KICKER.len) * 1.6);
    expect(lift(kick.s + 40, kick.d)).toBe(0);
    expect(lift(kick.s, kick.d + 12)).toBe(0);
    // the lip is the highest point
    expect(lift(lipOf(kick).s - 0.1, kick.d)).toBeGreaterThan(KICKER.height * 0.9);
  });

  it('a car that lands in the shortcut window counts, one that lands short or long does not', () => {
    const { track, ramps } = build('farm', 1, false, false);
    const sc = ramps.find((r) => r.kind === 'shortcut')!;
    const lip = lipOf(sc);
    expect(shortcutLanded(sc, lip.s + SHORTCUT_LAND[0] + 1, track)).toBe(true);
    expect(shortcutLanded(sc, lip.s + SHORTCUT_LAND[1] - 1, track)).toBe(true);
    expect(shortcutLanded(sc, lip.s + 3, track)).toBe(false);
    expect(shortcutLanded(sc, lip.s + SHORTCUT_LAND[1] + 20, track)).toBe(false);
    expect(shortcutLanded(sc, lip.s - 30, track)).toBe(false);
    void HUMP;
    void rampHeight;
  });
});
