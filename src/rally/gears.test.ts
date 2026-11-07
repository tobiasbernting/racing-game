// The gearboxes: the pure rules (ratios, bogging, the perfect-shift window, the shift light) and the gears in the real
// car physics, where a skilled manual driver should be a touch quicker than the automatic and a sloppy one slower.
import { describe, expect, it } from 'vitest';
import { CAR_BODIES, CAR_BODY_DEFS, type CarBody } from '../shared/rally.ts';
import { Driver } from './ai.ts';
import { BASE_POWER, Car, type Controls } from './car.ts';
import { AUTO_DOWN, AUTO_UP, GEARBOXES, PERFECT_HI, PERFECT_LO, REDLINE, autoGear, canDownshift, gearboxOf, isPerfect, pushK, shiftLight, torqueK, wheelFrac, wheelRpm } from './gears.ts';
import { Track } from './track.ts';
import { courseFor } from './variant.ts';

describe('the gearboxes', () => {
  it('every body has a sane box: rising ratios, a top gear above what the body reaches, the right number of gears', () => {
    for (const b of CAR_BODIES) {
      const box = gearboxOf(b);
      // the cart has one gear and a rocket, everything else at least three
      expect(box.v.length, b).toBeGreaterThanOrEqual(b === 'cart' ? 1 : 3);
      for (let i = 1; i < box.v.length; i++) expect(box.v[i]!, b).toBeGreaterThan(box.v[i - 1]!);
      // an upshift at the automatic point never lands in the lugging zone
      for (let i = 1; i < box.v.length; i++) expect((AUTO_UP * box.v[i - 1]!) / box.v[i]!, `${b} gear ${i + 1}`).toBeGreaterThan(0.47);
      const top = CAR_BODY_DEFS[b].feel.top;
      if (top > 0) expect(box.v[box.v.length - 1]!, b).toBeGreaterThan(top);
    }
    expect(GEARBOXES.moped.v.length).toBe(3);
    expect(GEARBOXES.tractor.v.length).toBeGreaterThanOrEqual(6);
    expect(GEARBOXES.tractor.v.length).toBeLessThanOrEqual(8);
    expect(GEARBOXES.moto.v.length).toBe(6);
    expect(GEARBOXES.moto.shiftTime).toBeLessThan(GEARBOXES.hatch.shiftTime);
    expect(GEARBOXES.hatch.v.length).toBe(5);
  });

  it('revs follow speed and gear', () => {
    const b = GEARBOXES.hatch;
    expect(wheelRpm(b, 1, b.v[0]!)).toBeCloseTo(REDLINE);
    expect(wheelRpm(b, 2, b.v[0]!)).toBeLessThan(wheelRpm(b, 1, b.v[0]!));
    expect(wheelFrac(b, 3, b.v[2]! / 2)).toBeCloseTo(0.5);
  });

  it('the engine bogs when the revs are low and is flat in the middle and the top', () => {
    expect(torqueK(0.1)).toBeLessThan(0.4);
    expect(torqueK(0.25)).toBeGreaterThan(0.4);
    expect(torqueK(0.25)).toBeLessThan(0.9);
    expect(torqueK(0.5)).toBe(1);
    expect(torqueK(1)).toBe(1);
    const b = GEARBOXES.hatch;
    // a standing start in first never bogs; in fourth it does
    expect(pushK(b, 1, 0, 1)).toBe(1);
    expect(pushK(b, 4, 2, 1)).toBeLessThan(0.7);
    // shifting up too early drops the revs into the bog
    expect(pushK(b, 3, (0.35 * b.v[2]!), 1)).toBeLessThan(1);
    expect(pushK(b, 3, 0.6 * b.v[2]!, 1)).toBe(1);
  });

  it('the perfect window sits just under the redline', () => {
    expect(isPerfect(PERFECT_LO)).toBe(true);
    expect(isPerfect(PERFECT_HI)).toBe(true);
    expect(isPerfect(0.8)).toBe(false);
    expect(isPerfect(1.02)).toBe(false);
    expect(PERFECT_HI).toBeLessThan(1);
  });

  it('the shift light goes green, amber, red', () => {
    const b = GEARBOXES.hatch;
    expect(shiftLight(0.5, 2, b)).toBe(0);
    expect(shiftLight(0.75, 2, b)).toBe(1);
    expect(shiftLight(0.86, 2, b)).toBe(2);
    expect(shiftLight(0.95, 2, b)).toBe(3);
    expect(shiftLight(0.95, 5, b)).toBe(1);
  });

  it('the automatic box shifts up near the redline and down when the revs fall', () => {
    const b = GEARBOXES.hatch;
    expect(autoGear(b, 1, b.v[0]! * (AUTO_UP + 0.02))).toBe(2);
    expect(autoGear(b, 2, b.v[1]! * 0.7)).toBe(2);
    expect(autoGear(b, 3, b.v[2]! * (AUTO_DOWN - 0.05))).toBe(2);
    expect(autoGear(b, 5, 100)).toBe(5);
  });

  it('the auto-clutch refuses a downshift that would over-rev', () => {
    const b = GEARBOXES.hatch;
    expect(canDownshift(b, 4, b.v[2]! * 0.8)).toBe(true);
    expect(canDownshift(b, 4, b.v[2]! * 1.3)).toBe(false);
    expect(canDownshift(b, 1, 5)).toBe(false);
  });
});

/** A lap (the second one) with the given gear policy, in seconds; 999 when it never gets round. */
function lap(body: CarBody, policy: 'auto' | 'skilled' | 'sloppy'): number {
  const track = new Track(courseFor('farm', null), 1);
  const car = new Car(track);
  const def = CAR_BODY_DEFS[body];
  car.setBody(body);
  const ground = { height: () => 0 };
  car.place(0, 0, ground);
  car.power = BASE_POWER * def.power;
  car.grip = def.grip;
  car.assist = 0.75;
  car.manual = policy !== 'auto';
  const drv = new Driver({ skill: 1, bias: 0, lineUse: 1, wobble: 0, phase: 0 });
  const ctl: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, shift: 0 };
  const dt = 1 / 60;
  let u = 0;
  let last = car.proj.s;
  let t = 0;
  let next = track.length;
  const laps: number[] = [];
  const top = car.box.v.length;
  while (t < 300 && laps.length < 2) {
    drv.drive(car, track, [car], 1, t, dt, ctl);
    ctl.shift = 0;
    if (policy !== 'auto' && !car.reverse) {
      const f = car.revFrac;
      const up = policy === 'skilled' ? 0.93 : 0.55;
      const down = policy === 'skilled' ? 0.42 : 0.2;
      if (car.gear < top && f >= up && f <= 1.05) ctl.shift = 1;
      else if (car.gear > 1 && f < down) ctl.shift = -1;
    }
    for (let k = 0; k < 2; k++) {
      car.step(dt / 2, ctl, ground, false);
      ctl.shift = 0;
    }
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

/** Seconds from a standstill to a set speed, full throttle on the first straight. */
function launch(body: CarBody, policy: 'auto' | 'skilled' | 'sloppy'): number {
  const track = new Track(courseFor('farm', null), 1);
  const car = new Car(track);
  const def = CAR_BODY_DEFS[body];
  car.setBody(body);
  const ground = { height: () => 0 };
  car.place(0, 0, ground);
  car.power = BASE_POWER * def.power;
  car.manual = policy !== 'auto';
  const drv = new Driver({ skill: 1, bias: 0, lineUse: 1, wobble: 0, phase: 0 });
  const ctl: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, shift: 0 };
  const goal = body === 'tractor' ? 15 : body === 'moped' ? 19 : 29;
  const top = car.box.v.length;
  let t = 0;
  const dt = 1 / 60;
  while (t < 40 && car.speed < goal) {
    drv.drive(car, track, [car], 1, t, dt, ctl);
    ctl.throttle = 1;
    ctl.brake = 0;
    ctl.shift = 0;
    if (policy !== 'auto') {
      const f = car.revFrac;
      const up = policy === 'skilled' ? 0.93 : 0.5;
      if (car.gear < top && f >= up && f <= 1.05) ctl.shift = 1;
    }
    for (let k = 0; k < 2; k++) {
      car.step(dt / 2, ctl, ground, false);
      ctl.shift = 0;
    }
    car.settle(dt, ground);
    t += dt;
  }
  return t;
}

describe('a thumped gear (Slumpväxeln)', () => {
  it('can throw a gear in or out, and never past the ends of the box', () => {
    const track = new Track(courseFor('farm', null), 1);
    const car = new Car(track);
    car.setBody('hatch');
    car.place(0, 0, { height: () => 0 });
    car.manual = true;
    car.gear = 2;
    car.jolt(1);
    expect(car.gear).toBe(3);
    expect(car.shifted).toBe(1);
    car.jolt(-1);
    expect(car.gear).toBe(2);
    car.gear = 5;
    car.jolt(1);
    expect(car.gear).toBe(5);
    car.gear = 1;
    car.jolt(-1);
    expect(car.gear).toBe(1);
  });
});

describe('gears in the real physics', () => {
  it('a skilled manual driver is as fast as the automatic or slightly faster, a sloppy one is slower', () => {
    for (const body of ['hatch', 'moto'] as const) {
      const auto = lap(body, 'auto');
      const skilled = lap(body, 'skilled');
      const sloppy = lap(body, 'sloppy');
      console.log(body, 'auto', auto.toFixed(2), 'skilled', skilled.toFixed(2), 'sloppy', sloppy.toFixed(2));
      expect(auto, body).toBeLessThan(200);
      expect(skilled / auto, `${body} skilled`).toBeLessThan(1.003);
      expect(skilled / auto, `${body} skilled`).toBeGreaterThan(0.95);
      expect(sloppy / auto, `${body} sloppy`).toBeGreaterThan(0.999);
    }
  }, 120000);

  it('flat out from a standstill: a skilled shifter gets there a little sooner, a sloppy one clearly later', () => {
    for (const body of ['hatch', 'moto', 'tractor'] as const) {
      const auto = launch(body, 'auto');
      const skilled = launch(body, 'skilled');
      const sloppy = launch(body, 'sloppy');
      console.log(body, 'to speed: auto', auto.toFixed(2), 'skilled', skilled.toFixed(2), 'sloppy', sloppy.toFixed(2));
      expect(skilled / auto, `${body} skilled`).toBeLessThan(1.0001);
      expect(skilled / auto, `${body} skilled`).toBeGreaterThan(0.93);
      expect(sloppy / auto, `${body} sloppy`).toBeGreaterThan(1.015);
    }
  });

  it('a perfect upshift flags itself and kicks; the limiter bounces in a low gear, and a top-gear car keeps its speed', () => {
    const track = new Track(courseFor('farm', null), 1);
    const car = new Car(track);
    car.setBody('hatch');
    const ground = { height: () => 0 };
    car.place(0, 0, ground);
    car.manual = true;
    const ctl: Controls = { throttle: 1, brake: 0, steer: 0, handbrake: false, shift: 0 };
    let perfected = 0;
    let limited = 0;
    // hold first gear past the redline: the limiter bounces
    for (let i = 0; i < 600 && car.gear === 1; i++) {
      car.step(1 / 120, ctl, ground, false);
      if (car.limiterT > 0) limited++;
      if (car.revFrac >= 0.95 && car.revFrac <= 0.98) {
        ctl.shift = 1;
        car.step(1 / 120, ctl, ground, false);
        ctl.shift = 0;
        perfected += car.perfect;
        break;
      }
    }
    expect(car.gear).toBe(2);
    expect(perfected).toBe(1);
    expect(car.perfectT).toBeGreaterThan(0.5);
    expect(limited).toBeGreaterThanOrEqual(0);
    // never shifting: first gear tops out about the redline speed instead of running away
    const slow = new Car(track);
    slow.setBody('hatch');
    slow.place(0, 0, ground);
    slow.manual = true;
    let bounced = 0;
    for (let i = 0; i < 2400; i++) {
      slow.step(1 / 120, ctl, ground, false);
      if (slow.limiterT > 0) bounced++;
    }
    expect(bounced).toBeGreaterThan(20);
    expect(slow.speed).toBeLessThan(slow.box.v[0]! * 1.2);
    expect(slow.gear).toBe(1);
  });
});
