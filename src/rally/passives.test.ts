// The passives that live in the driving feel (shared/rally.ts), checked against the real physics: the sportbil's top
// speed, the sandbuggy on the rough, and the heavy bodies' mass.
import { describe, expect, it } from 'vitest';
import { CAR_BODY_DEFS, type CarBody, type Feel } from '../shared/rally.ts';
import { COURSES } from './courses.ts';
import { Car } from './car.ts';
import { Track } from './track.ts';

const track = new Track(COURSES.farm);
const ground = { height: () => 0 };

/** Full throttle for `secs` s along the road, `offset` metres out from the edge (null: on the centre line). Returns the speed reached. */
function drive(body: CarBody, feel: Feel, secs: number, off: number | null): number {
  const c = new Car(track);
  c.setBody(body, feel);
  c.power *= CAR_BODY_DEFS[body].power;
  c.place(0, 0, ground);
  const d0 = off === null ? 0 : track.at(track.hw, 0) + off;
  c.place(0, d0, ground);
  let top = 0;
  for (let i = 0; i < secs * 120; i++) {
    c.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, ground);
    track.project(c.x, c.z, c.proj.i, c.proj);
    if (i % 12 === 0) {
      const want = off === null ? 0 : track.at(track.hw, c.proj.s) + off;
      if (Math.abs(c.proj.d - want) > 3) {
        const v = c.speed;
        c.place(c.proj.s, want, ground);
        c.vx = Math.sin(c.heading) * v;
        c.vz = Math.cos(c.heading) * v;
      }
    }
    top = Math.max(top, c.speed);
  }
  return top;
}

describe('vehicle passives in the physics', () => {
  it('the sportbil pulls harder at speed (its passive: a higher top speed), by a clear but not silly margin', () => {
    // from 40 m/s on the straight, full throttle for half a second: how much speed it gains
    const gain = (drag: number): number => {
      const c = new Car(track);
      c.setBody('coupe', { ...CAR_BODY_DEFS.coupe.feel, drag });
      c.power *= CAR_BODY_DEFS.coupe.power;
      c.place(0, 0, ground);
      c.gear = 4;
      c.vx = Math.sin(c.heading) * 40;
      c.vz = Math.cos(c.heading) * 40;
      for (let i = 0; i < 60; i++) c.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, ground);
      return c.speed - 40;
    };
    const mine = gain(CAR_BODY_DEFS.coupe.feel.drag);
    const plain = gain(1);
    console.log('coupe gains', mine.toFixed(2), 'm/s in half a second at 40 m/s, a plain body', plain.toFixed(2));
    expect(mine).toBeGreaterThan(plain * 1.04);
    expect(mine).toBeLessThan(plain * 1.5);
    expect(CAR_BODY_DEFS.coupe.feel.drag).toBeLessThan(CAR_BODY_DEFS.hatch.feel.drag);
  });

  it('the sandbuggy keeps its speed on grass where other cars slow down (its passive)', () => {
    const f = CAR_BODY_DEFS.buggy.feel;
    const buggy = drive('buggy', f, 12, 5);
    const plain = drive('buggy', { ...f, roll: 1, rough: 1 }, 12, 5);
    const road = drive('buggy', f, 12, null);
    console.log('buggy on grass', buggy.toFixed(1), 'plain car on grass', plain.toFixed(1), 'on the road', road.toFixed(1));
    expect(buggy).toBeGreaterThan(plain * 1.25);
    expect(buggy).toBeGreaterThan(road * 0.7);
  });

  it('the monster, the pickup and the tractor are heavier than the plain car, in that order of ambition', () => {
    const m = (b: CarBody): number => CAR_BODY_DEFS[b].feel.mass;
    expect(m('monster')).toBeGreaterThan(m('pickup'));
    expect(m('pickup')).toBeGreaterThan(m('hatch'));
    expect(m('tractor')).toBeGreaterThan(m('monster'));
  });

  it('the moped slips on hazards half as much', () => {
    expect(CAR_BODY_DEFS.moped.feel.slip).toBeLessThanOrEqual(0.5);
  });
});
