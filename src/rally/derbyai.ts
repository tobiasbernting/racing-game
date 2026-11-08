// The computer drivers of the derby. There is no racing line in an arena: a driver either hunts (picks a car, drives at
// where it is going and rams it) or roams (cruises round the floor looking for the next one). Everybody fights: the
// rammers hunt all the time, the racers and the in-betweens most of it, and they come in at a flank or the tail, not
// nose to nose. Only a badly hurt driver steers away from a car coming at it. Everybody keeps off the tyre wall and
// the island and backs out when stuck. Plain maths on the Car and Track, no Three.js, so a test can run a derby.
import type { Car, Controls } from './car.ts';
import type { Track } from './track.ts';
import { clamp, wrapAngle } from './util.ts';

export interface DerbyPersona {
  /** 0..1: how much of the time it hunts (the rest it roams). */
  aggro: number;
  /** About 0.7 .. 1.06: courage and aim. */
  skill: number;
  /** Spreads the drivers' roaming apart. */
  phase: number;
}

/** What the brain needs to know about another car. */
export interface DerbyFoe {
  car: Car;
  /** Still running (not wrecked, not out). */
  alive: boolean;
  /** Health 0..1. */
  hp: number;
  /** The player's car (rivals like it a little more, and like it most when it is weak). */
  player: boolean;
}

/** Steering (−1..1, left positive) that points the car at a spot in the world. */
export function steerAtPoint(car: Car, x: number, z: number): number {
  const dx = x - car.x;
  const dz = z - car.z;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const fwd = dx * sinH + dz * cosH;
  const lat = dx * cosH - dz * sinH;
  const reverse = car.vLong < -0.5;
  const alpha = Math.atan2(lat, Math.max(fwd, 0.5));
  const delta = Math.atan2(2 * 2.5 * Math.sin(alpha), Math.max(4, Math.hypot(dx, dz)));
  const maxSteer = 0.62 / (1 + Math.abs(car.vLong) / 11);
  return clamp((delta / maxSteer) * (reverse ? -1 : 1), -1, 1);
}

/**
 * Where to put a car back on the floor: of a dozen random spots the one furthest from every other car (and from the
 * fences), so a rescued car does not land in the very scrum it was stuck in. Returns road coordinates.
 */
export function freeSpot(track: Track, others: readonly Car[], rand: () => number = Math.random): { s: number; d: number } {
  let best = { s: 0, d: 0 };
  let bestGap = -1;
  for (let k = 0; k < 14; k++) {
    const s = rand() * track.length;
    const hw = track.at(track.hw, s);
    const d = (rand() * 2 - 1) * hw * 0.6;
    const p = track.point(s, d);
    let gap = Infinity;
    for (const o of others) gap = Math.min(gap, Math.hypot(o.x - p.x, o.z - p.z));
    if (gap > bestGap) {
      bestGap = gap;
      best = { s, d };
    }
  }
  return best;
}

const proj = { i: 0, u: 0, s: 0, d: 0 };
const probe = { i: 0, u: 0, s: 0, d: 0 };

export class DerbyBrain {
  target: DerbyFoe | null = null;
  private retarget = 0;
  private reverseT = 0;
  private kickT = 0;
  /** When it got stuck, newest last (the third time within twelve seconds it gives up and asks to be put back on the floor). */
  private stuckAt: number[] = [];
  /** Set when the driver has been stuck again and again: the race puts it back on the floor (and clears this). */
  gaveUp = false;
  private stuckT = 0;
  private refT = 0;
  private refX = 0;
  private refZ = 0;
  /** Seconds spent crawling (under 3.5 m/s): the race puts a driver that crawls for five seconds back on the floor. */
  private slowT = 0;
  private wanderSide = 1;
  /** The car it was locked together with when it last got stuck: not its target for a few seconds. */
  private shun: Car | null = null;
  private shunT = 0;
  /** FEGIS: nothing dealt for ten seconds, so it hunts without a pause. */
  desperate = false;
  /** Badly hurt: only then does it steer away from a car coming at it. */
  hurt = false;

  constructor(
    public p: DerbyPersona,
    private rand: () => number = Math.random,
  ) {}

  /** Pick who to go for. Called now and then (about twice a second). */
  think(car: Car, foes: readonly DerbyFoe[], dt: number, warmup = false): void {
    this.retarget -= dt;
    this.shunT -= dt;
    if (this.retarget > 0) return;
    this.retarget = 0.5 + this.rand() * 0.4;
    this.target = null;
    // the first seconds everybody circles and looks: the charge into the middle is not the whole derby
    if (warmup) return;
    // nobody cruises around: even a racer hunts most of the time, a car marked FEGIS all of it
    if (!this.desperate && this.rand() > 0.6 + this.p.aggro * 0.4) return;
    let best = Infinity;
    for (const f of foes) {
      if (!f.alive || f.car === car || f.car.ghost > 0) continue;
      if (f.car === this.shun && this.shunT > 0) continue;
      const dist = Math.hypot(f.car.x - car.x, f.car.z - car.z);
      // the weak ones look tasty, the player a bit more so, the ones far away hardly at all
      const sc = dist * (0.55 + 0.45 * f.hp) * (f.player ? 0.93 : 1);
      if (sc < best) {
        best = sc;
        this.target = f;
      }
    }
  }

  drive(car: Car, track: Track, foes: readonly DerbyFoe[], time: number, dt: number, out: Controls): Controls {
    const v = Math.max(0, car.vLong);
    track.project(car.x, car.z, car.proj.i, proj);
    const hw = track.at(track.hw, proj.s);
    // getting out of a corner or off a car: reverse for a moment, steering the other way
    // the way the wall is: positive when the car points at the nearest fence
    const side = Math.sign(proj.d) || 1;
    const toward = Math.sin(car.heading) * side * track.at(track.tz, proj.s) + Math.cos(car.heading) * side * -track.at(track.tx, proj.s);
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      out.throttle = 0;
      out.brake = 1;
      out.steer = -this.wanderSide;
      out.handbrake = false;
      return out;
    }
    if (this.kickT > 0) {
      // stuck with the tail against the fence: drive away from it, towards the middle of the floor
      this.kickT -= dt;
      const q = track.point(proj.s, proj.d * 0.2);
      out.steer = steerAtPoint(car, q.x, q.z);
      out.throttle = 1;
      out.brake = 0;
      out.handbrake = false;
      return out;
    }
    if (car.speed < 3.5) this.slowT += dt;
    else this.slowT = Math.max(0, this.slowT - dt * 2);
    if (this.slowT > 5) {
      this.slowT = 0;
      this.gaveUp = true;
    }
    // stuck = it has hardly moved in the last 0.8 s while trying (a car pulling away from a standstill is not stuck)
    this.refT += dt;
    let stuckNow = false;
    if (this.refT >= 0.8) {
      stuckNow = Math.hypot(car.x - this.refX, car.z - this.refZ) < 0.9;
      this.refT = 0;
      this.refX = car.x;
      this.refZ = car.z;
    }
    if (stuckNow) {
      this.stuckT = 0;
      // locked together with somebody: leave them for a while and find another to hit
      if (this.target) {
        this.shun = this.target.car;
        this.shunT = 4;
        this.target = null;
        this.retarget = 1.2;
      }
      this.stuckAt.push(time);
      this.stuckAt = this.stuckAt.filter((t) => time - t < 12);
      if (this.stuckAt.length >= 3) {
        this.gaveUp = true;
        this.stuckAt = [];
      }
      this.wanderSide = this.rand() < 0.5 ? 1 : -1;
      // nose against the fence: back out; tail against it (or a car): drive off
      if (toward > 0.1 || Math.abs(proj.d) < hw - 4) this.reverseT = 1.1;
      else this.kickT = 1.4;
    }
    const tgt = this.target && this.target.alive ? this.target.car : null;
    let ax: number;
    let az: number;
    let speed: number;
    if (tgt) {
      // drive at where it will be a moment from now; close in fast, then hit it at a decent speed
      const dist = Math.hypot(tgt.x - car.x, tgt.z - car.z);
      const lead = clamp(dist / Math.max(10, v + 8), 0, 1.1) * 0.8;
      ax = tgt.x + tgt.vx * lead;
      az = tgt.z + tgt.vz * lead;
      // come in at a flank or the tail (they take the bulk of a hit, the nose of the rammer takes little): aim at the
      // corner of the target nearest to us until close, then straight in
      if (dist > 9) {
        const sx = Math.sin(tgt.heading);
        const cz = Math.cos(tgt.heading);
        let bx = 0;
        let bz = 0;
        let bd = Infinity;
        for (const [fx, fz] of [[-sx, -cz], [cz, -sx], [-cz, sx]] as const) {
          const px = ax + fx * 3.4;
          const pz = az + fz * 3.4;
          const dd = Math.hypot(px - car.x, pz - car.z);
          if (dd < bd) {
            bd = dd;
            bx = px;
            bz = pz;
          }
        }
        const k = clamp((dist - 9) / 10, 0, 1);
        ax += (bx - ax) * k;
        az += (bz - az) * k;
      }
      speed = dist > 24 ? 40 : Math.max(16, tgt.vLong + 14);
      // nose to nose and going nowhere: slide round to its flank instead of pushing straight on
      if (dist < 10 && car.speed < 4.5 && dist > 0.1) {
        ax += (-(tgt.z - car.z) / dist) * 5.5 * this.wanderSide;
        az += ((tgt.x - car.x) / dist) * 5.5 * this.wanderSide;
      }
      // the island in the way (it is a solid wall): go round the ring the short way instead of straight at it
      let blocked = false;
      for (let k = 1; k <= 4 && !blocked; k++) {
        track.project(car.x + ((ax - car.x) * k) / 5, car.z + ((az - car.z) * k) / 5, proj.i, probe);
        if (Math.abs(probe.d) > hw - 1.5) blocked = true;
      }
      if (blocked) {
        const way = Math.sign(track.wrapDist(tgt.proj.s - proj.s)) || 1;
        const p = track.point(proj.s + way * (14 + v * 0.5), clamp(proj.d * 0.6, -hw * 0.5, hw * 0.5));
        ax = p.x;
        az = p.z;
        speed = Math.min(speed, 26);
      }
    } else {
      // roam: round the floor in the direction already going, off the walls, swerving away from anyone close
      const t = Math.sign(car.vx * track.at(track.tx, proj.s) + car.vz * track.at(track.tz, proj.s)) || 1;
      const d = clamp(proj.d * 0.5, -hw * 0.6, hw * 0.6);
      const p = track.point(proj.s + t * (14 + v * 0.5), d);
      ax = p.x;
      az = p.z;
      speed = (13 + 9 * this.p.skill) * (0.85 + 0.15 * Math.sin(time * 0.4 + this.p.phase));
      for (const f of foes) {
        if (!f.alive || f.car === car) continue;
        const dx = f.car.x - car.x;
        const dz = f.car.z - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 26 || dist < 0.1) continue;
        // closing on me?
        const closing = ((f.car.vx - car.vx) * -dx + (f.car.vz - car.vz) * -dz) / dist;
        if (closing < 1 || !this.hurt) continue;
        const k = ((26 - dist) / 26) * 2.4;
        ax -= (dx / dist) * k * 14;
        az -= (dz / dist) * k * 14;
      }
    }
    // keep off the fences (the outer wall and the island): near one and heading at it, turn away
    const margin = hw - Math.abs(proj.d);
    let steer = steerAtPoint(car, ax, az);
    let throttle = 1;
    const reach = 7 + v * 0.45;
    if (margin < reach) {
      if (toward > -0.05) {
        const urgency = clamp(1 - margin / reach, 0, 1) * clamp(0.4 + toward, 0, 1);
        // inward point
        const q = track.point(proj.s, proj.d - Math.sign(proj.d) * Math.max(6, hw * 0.45));
        const away = steerAtPoint(car, q.x, q.z);
        steer = steer * (1 - urgency) + away * urgency;
        if (urgency > 0.55 && v > 12) throttle = 0.35;
      }
    }
    out.steer = steer;
    // not at full tilt when the aim is far off: turn first
    const want = Math.atan2(ax - car.x, az - car.z);
    const off = Math.abs(wrapAngle(want - car.heading));
    if (off > 1.1 && v > 9) throttle = Math.min(throttle, 0.2);
    const cap = speed * this.p.skill;
    const err = cap - v;
    out.throttle = err > 0 ? clamp(err / 2.5 + 0.35, 0, 1) * throttle : 0;
    out.brake = err < -3 ? clamp(-err / 8, 0, 0.7) : 0;
    out.handbrake = false;
    return out;
  }
}
