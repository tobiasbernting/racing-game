// The lap-time model the balance simulation stands on (shared/pace.ts) against the real physics: the actual car and
// the actual computer driver, round real courses. The scaled rivals really do get faster through a run, by about
// as much as the model says.
import { describe, expect, it } from 'vitest';
import { buildField, type RivalSpec } from '../shared/field.ts';
import { rivalLap } from '../shared/pace.ts';
import type { RallyCourse } from '../shared/rally.ts';
import { Driver } from './ai.ts';
import { BASE_POWER, Car } from './car.ts';
import { Track } from './track.ts';
import { courseFor } from './variant.ts';

/** The second lap of a computer driver with this kit, in seconds (999 when it never gets round). */
function physicsLap(course: RallyCourse, r: RivalSpec, sharp: number): number {
  const track = new Track(courseFor(course, null), 1);
  const car = new Car(track);
  const ground = { height: () => 0 };
  car.place(0, 0, ground);
  car.power = BASE_POWER * r.power;
  car.grip = r.grip;
  car.assist = 0.75;
  car.brakeMul = r.brakes;
  const drv = new Driver({ skill: r.skill, bias: 0, lineUse: r.lineUse, wobble: 0.5 * (1 - 0.6 * sharp), phase: 0, late: r.late });
  const ctl = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  const dt = 1 / 60;
  let u = 0;
  let last = car.proj.s;
  let t = 0;
  let next = track.length;
  const laps: number[] = [];
  while (t < 300 && laps.length < 2) {
    drv.drive(car, track, [car], 1, t, dt, ctl);
    for (let k = 0; k < 2; k++) car.step(dt / 2, ctl, ground, false);
    car.settle(dt, ground);
    car.wallHit = 0;
    car.landed = 0;
    u += track.wrapDist(car.proj.s - last);
    last = car.proj.s;
    t += dt;
    if (u >= next) {
      laps.push(t);
      next += track.length;
    }
  }
  return laps.length === 2 ? laps[1]! - laps[0]! : 999;
}

describe('the pace model against the real physics', () => {
  const courses: RallyCourse[] = ['desert', 'ice', 'city', 'moon'];
  const early = buildField({ seed: 21, kind: 'mixed', act: 0, row: 0, role: 'rival', calm: false, ai: 5 });
  const late = buildField({ seed: 21, kind: 'mixed', act: 2, row: 3, role: 'rival', calm: false, ai: 5 });
  // the middle of the pack, so no slot extremes
  const a = early.rivals[2]!;
  const b = late.rivals[2]!;

  it('an act-3 rival laps faster than an act-1 rival in the real physics, by about what the model says', () => {
    const real: number[] = [];
    const model: number[] = [];
    for (const c of courses) {
      const ra = physicsLap(c, a, early.sharp);
      const rb = physicsLap(c, b, late.sharp);
      expect(ra, `${c} early`).toBeLessThan(200);
      expect(rb, `${c} late`).toBeLessThan(200);
      real.push(rb / ra);
      model.push(rivalLap(c, { skill: b.skill, grip: b.grip, power: b.power, sharp: late.sharp, nitro: b.nitroEvery ? b.nitro : 0 }) / rivalLap(c, { skill: a.skill, grip: a.grip, power: a.power, sharp: early.sharp }));
    }
    const mean = (x: number[]): number => x.reduce((p, q) => p + q, 0) / x.length;
    console.log('late/early lap, real', real.map((x) => x.toFixed(3)).join(' '), 'model', model.map((x) => x.toFixed(3)).join(' '));
    expect(mean(real)).toBeLessThan(0.97);
    expect(Math.abs(mean(real) - mean(model))).toBeLessThan(0.035);
  });

  it('the model puts the same rival within a few percent of the real lap on each course (it is a fitted model, not a measurement)', () => {
    for (const c of courses) {
      const real = physicsLap(c, b, late.sharp);
      const model = rivalLap(c, { skill: b.skill, grip: b.grip, power: b.power, sharp: late.sharp, nitro: b.nitroEvery ? b.nitro : 0 });
      expect(Math.abs(real / model - 1), c).toBeLessThan(0.12);
    }
  });
});
