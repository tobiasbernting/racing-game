// The real physics lap of a vehicle: the actual car and the actual computer driver round a real course (used by
// bodypace.test.ts to check the lap factors in shared/pace.ts, and by throwaway measuring scripts).
import { CAR_BODY_DEFS, type CarBody, type RallyCourse } from '../shared/rally.ts';
import { EPA_BURST, KITS, ROCKET } from '../shared/abilities.ts';
import { Driver } from './ai.ts';
import { BASE_POWER, Car } from './car.ts';
import { capGrip, capPower } from './mods.ts';
import { Track } from './track.ts';
import { courseFor } from './variant.ts';

/** Is the road ahead clear for a burst that lasts `secs`: no corner that needs less than 42 m/s inside the distance it covers at 60 m/s? */
function straightAhead(track: Track, s: number, secs: number): boolean {
  const reach = 60 * secs;
  for (let k = 0; k <= reach; k += 12) if (track.at(track.vmax, s + k) < 42) return false;
  return true;
}

/** The second lap (s) of a computer driver of skill 0.93 in this vehicle, using its burst or rocket whenever it is ready (999 = never got round). */
export function bodyLap(course: RallyCourse, body: CarBody, skill = 0.93, rival = false): number {
  const track = new Track(courseFor(course, null), 1);
  const car = new Car(track);
  const ground = { height: () => 0 };
  car.setBody(body);
  car.place(0, 0, ground);
  const def = CAR_BODY_DEFS[body];
  // as in the race: the body's numbers go through the soft caps of the build
  car.power = BASE_POWER * (rival ? 1 + (def.power - 1) * 0.5 : capPower(def.power));
  car.grip = rival ? 1 : capGrip(def.grip);
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
    if (!rival && (id === 'epaBurst' || id === 'rocket') && cd <= 0 && Math.abs(ctl.steer) < 0.25 && car.speed > 4 && straightAhead(track, car.proj.s, id === 'epaBurst' ? EPA_BURST.boost : ROCKET.boost)) {
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
export function bestLap(course: RallyCourse, body: CarBody, skills = [0.82, 0.9, 0.97], rival = false): { lap: number; skill: number } {
  let best = { lap: Infinity, skill: 0 };
  for (const sk of skills) {
    const lap = bodyLap(course, body, sk, rival);
    if (lap < best.lap) best = { lap, skill: sk };
  }
  return best;
}


/** The speed (m/s) a vehicle reaches flat out on a straight bit of tarmac, after `secs` seconds (the nitro and the actives are not used). */
export function topSpeed(body: CarBody, secs = 40): number {
  const track = new Track(courseFor('farm', null), 1);
  const car = new Car(track);
  const ground = { height: () => 0 };
  car.setBody(body);
  car.place(0, 0, ground);
  const def = CAR_BODY_DEFS[body];
  car.power = BASE_POWER * capPower(def.power);
  car.grip = capGrip(def.grip);
  car.assist = 0.75;
  let top = 0;
  const n = Math.round(secs * 120);
  for (let i = 0; i < n; i++) {
    car.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, ground, false);
    // the road bends: put it back in the middle, keeping the speed
    if (i % 20 === 0) {
      const v = car.speed;
      const g = car.gear;
      car.place(car.proj.s, 0, ground);
      car.gear = g;
      car.vx = Math.sin(car.heading) * v;
      car.vz = Math.cos(car.heading) * v;
    }
    top = Math.max(top, car.speed);
  }
  return top;
}
