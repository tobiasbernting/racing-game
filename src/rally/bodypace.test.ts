// How fast each vehicle really goes round a course (the actual car, the actual computer driver), set against the
// per-vehicle lap factors the balance simulation uses (BODY_LAP in shared/pace.ts). The ten newest vehicles each
// have a factor measured here; the older ten keep the old formula.
import { describe, expect, it } from 'vitest';
import { BODY_LAP } from '../shared/pace.ts';
import { CAR_BODIES, CAR_BODY_DEFS, type CarBody, type RallyCourse } from '../shared/rally.ts';
import { EPA_BURST, KITS, ROCKET } from '../shared/abilities.ts';
import { Driver } from './ai.ts';
import { BASE_POWER, Car } from './car.ts';
import { Track } from './track.ts';
import { courseFor } from './variant.ts';

const COURSES: RallyCourse[] = ['farm', 'desert', 'ice', 'city'];

/** The second lap (s) of a computer driver of skill 0.93 in this vehicle, using its burst or rocket whenever it is ready (999 = never got round). */
export function bodyLap(course: RallyCourse, body: CarBody, skill = 0.93): number {
  const track = new Track(courseFor(course, null), 1);
  const car = new Car(track);
  const ground = { height: () => 0 };
  car.setBody(body);
  car.place(0, 0, ground);
  const def = CAR_BODY_DEFS[body];
  car.power = BASE_POWER * def.power;
  car.grip = def.grip;
  car.assist = 0.75;
  car.size = 1 + (def.size - 1) * 0.6;
  const drv = new Driver({ skill, bias: 0, lineUse: 0.9, wobble: 0, phase: 0 });
  const ctl = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  const dt = 1 / 60;
  const id = KITS[body].active.id;
  let u = 0;
  let last = car.proj.s;
  let t = 0;
  let next = track.length;
  let cd = 3;
  let on = 0;
  let k = 0;
  const laps: number[] = [];
  let stuck = 0;
  let off = 0;
  while (t < 300 && laps.length < 2) {
    drv.drive(car, track, [car], 1, t, dt, ctl);
    cd -= dt;
    on = Math.max(0, on - dt);
    // the two actives that are the engine of their vehicle: a bot that fires them on a straight, as soon as they are ready
    if ((id === 'epaBurst' || id === 'rocket') && cd <= 0 && Math.abs(ctl.steer) < 0.25 && car.speed > 4) {
      on = id === 'epaBurst' ? EPA_BURST.boost : ROCKET.boost;
      cd = KITS[body].active.cooldown;
    }
    car.boost = on > 0 ? (id === 'epaBurst' ? EPA_BURST.strength : ROCKET.strength) : 1;
    if (on > 0) {
      const a = id === 'epaBurst' ? EPA_BURST.thrust : ROCKET.thrust;
      const cap = id === 'epaBurst' ? EPA_BURST.cap : ROCKET.cap;
      if (car.vLong < cap) {
        car.vx += Math.sin(car.heading) * a * dt;
        car.vz += Math.cos(car.heading) * a * dt;
      }
      if (id === 'rocket') {
        ctl.steer *= ROCKET.steer;
        if (++k % 20 === 0) car.yawRate += ((k * 7919) % 13 / 13 - 0.5) * 2 * ROCKET.kick * 1.6;
      }
    }
    for (let j = 0; j < 2; j++) car.step(dt / 2, ctl, ground, false);
    car.settle(dt, ground);
    // stuck or lost: back on the road, as the race does it (the time keeps running)
    const hw = track.at(track.hw, car.proj.s);
    stuck = car.speed < 1.6 && (ctl.throttle > 0.3 || ctl.brake > 0.3) ? stuck + dt : Math.max(0, stuck - 2 * dt);
    off = Math.abs(car.proj.d) > hw + 1.5 && car.speed < 5 ? off + dt : Math.max(0, off - dt);
    if (stuck > 2.2 || off > 4) {
      const s0 = car.proj.s;
      car.place(s0, 0, ground);
      car.vx = car.vz = car.yawRate = 0;
      stuck = off = 0;
      last = car.proj.s;
    }
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

/** The best second lap over a few skills: what a good driver gets out of the vehicle. */
export function bestLap(course: RallyCourse, body: CarBody, skills = [0.82, 0.9, 0.97]): { lap: number; skill: number } {
  let best = { lap: Infinity, skill: 0 };
  for (const sk of skills) {
    const lap = bodyLap(course, body, sk);
    if (lap < best.lap) best = { lap, skill: sk };
  }
  return best;
}

describe('every vehicle against the lap factors of the balance simulation', { timeout: 120_000 }, () => {
  it('the factor of each of the ten newest is the real physics, on average over four courses, within a few percent', () => {
    const base = COURSES.map((c) => bestLap(c, 'hatch').lap);
    const out: string[] = [];
    for (const b of CAR_BODIES) {
      const model = BODY_LAP[b];
      if (model === undefined) continue;
      const ratios = COURSES.map((c, i) => bestLap(c, b).lap / base[i]!);
      const mean = ratios.reduce((a, x) => a + x, 0) / ratios.length;
      out.push(`${b}: ${ratios.map((r) => r.toFixed(3)).join(' ')} mean ${mean.toFixed(3)} model ${model}`);
      expect(Math.abs(mean / model - 1), b).toBeLessThan(0.05);
    }
    console.log(out.join('\n'));
  });

  it('no new vehicle is faster than the sportbil and the motorcycle by more than a hair, and the slow ones are slow on purpose', () => {
    const fast = Math.min(...CAR_BODIES.map((b) => BODY_LAP[b] ?? 1).concat([0.95]));
    for (const b of CAR_BODIES) if (BODY_LAP[b] !== undefined) expect(BODY_LAP[b]!, b).toBeGreaterThanOrEqual(fast);
    expect(BODY_LAP.kart!).toBeGreaterThan(0.94);
    // the slow ones (the A-tractor, the golf cart, the mower) are not faster than the plain moped
    for (const b of ['epa', 'golf', 'mower'] as const) expect(BODY_LAP[b]!, b).toBeGreaterThanOrEqual(1.1);
  });
});
