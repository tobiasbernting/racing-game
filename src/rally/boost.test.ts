// A boost must be a real boost: the car goes well past its normal top speed while it burns, and eases back after.
import { describe, expect, it } from 'vitest';
import { CAR_BODY_DEFS, type CarBody } from '../shared/rally.ts';
import { BASE_POWER, BOOST_MAX, Car, PAD_BOOST, boostSpeedK } from './car.ts';
import { Track } from './track.ts';
import { courseFor } from './variant.ts';

/** Speeds (m/s) once a second on a straight: flat out, with a boost of this strength from `at` for `len` seconds. */
function straight(body: CarBody, boost: number, at = 25, len = 2.2, secs = 44): { peak: number; before: number; after: number } {
  const track = new Track(courseFor('farm', null), 1);
  const car = new Car(track);
  const ground = { height: () => 0 };
  car.setBody(body);
  car.place(0, 0, ground);
  car.power = BASE_POWER * CAR_BODY_DEFS[body].power;
  car.grip = 1;
  car.assist = 0.75;
  let peak = 0;
  let before = 0;
  let after = 0;
  for (let i = 0; i < secs * 120; i++) {
    const t = i / 120;
    car.boost = t >= at && t < at + len ? boost : 1;
    car.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, ground, false);
    if (i % 20 === 0) {
      const v = car.speed;
      const g = car.gear;
      car.place(car.proj.s, 0, ground);
      car.gear = g;
      car.vx = Math.sin(car.heading) * v;
      car.vz = Math.cos(car.heading) * v;
    }
    if (t < at) before = Math.max(before, car.speed);
    else peak = Math.max(peak, car.speed);
    if (i === Math.round((secs - 0.5) * 120)) after = car.speed;
  }
  return { peak, before, after };
}

describe('a nitro is a real boost in the real physics', () => {
  it.each(['hatch', 'tractor', 'moped'] as CarBody[])('the %s goes at least 18 % past its normal top speed on a straight, and settles back afterwards', (b) => {
    const r = straight(b, 1.5);
    console.log(b, 'normal', (r.before * 3.6).toFixed(0), 'nitro peak', (r.peak * 3.6).toFixed(0), 'after', (r.after * 3.6).toFixed(0), 'km/h');
    expect(r.peak).toBeGreaterThan(r.before * 1.18);
    // no hidden clamp or brake: well back down to normal speed, and not below it
    const plain = straight(b, 1).after;
    expect(r.after).toBeLessThan(plain * 1.03);
    expect(r.after).toBeGreaterThan(plain * 0.97);
  });

  it('a stronger boost gives more speed: nitro above a mini-turbo above a plain run', () => {
    const plain = straight('hatch', 1).peak;
    const turbo = straight('hatch', 1.3).peak;
    const nitro = straight('hatch', 1.5).peak;
    expect(turbo).toBeGreaterThan(plain * 1.08);
    expect(nitro).toBeGreaterThan(turbo * 1.03);
  });

  it('the boost never brakes: the speed only falls gently when it ends', () => {
    const track = new Track(courseFor('farm', null), 1);
    const car = new Car(track);
    const ground = { height: () => 0 };
    car.place(0, 0, ground);
    car.power = BASE_POWER;
    car.assist = 0.75;
    let prev = 0;
    let worst = 0;
    for (let i = 0; i < 40 * 120; i++) {
      const t = i / 120;
      car.boost = t >= 20 && t < 22.2 ? 1.5 : 1;
      car.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, ground, false);
      if (i % 20 === 0) {
        const v = car.speed;
        const g = car.gear;
        car.place(car.proj.s, 0, ground);
        car.gear = g;
        car.vx = Math.sin(car.heading) * v;
        car.vz = Math.cos(car.heading) * v;
      }
      if (t > 22.4 && i % 12 === 0) worst = Math.min(worst, (car.speed - prev) / 0.1);
      if (i % 12 === 0) prev = car.speed;
    }
    // never faster than about 0.45 g of slowing (plain drag alone is 0.35 g at that speed)
    expect(worst).toBeGreaterThan(-4.5);
  });

  it('the strength turns into top speed in proportion, and is bounded', () => {
    expect(boostSpeedK(1)).toBe(1);
    expect(boostSpeedK(1.5)).toBeGreaterThan(1.3);
    expect(boostSpeedK(1.5)).toBeLessThan(1.4);
    expect(boostSpeedK(1.4)).toBeLessThan(boostSpeedK(1.5));
    expect(boostSpeedK(9)).toBe(boostSpeedK(BOOST_MAX));
    expect(PAD_BOOST.strength).toBeLessThan(1.5);
  });
});
