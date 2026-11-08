// A derby run headless: the arena track, the real car physics, the derby drivers and the real damage numbers. These
// check that the arena holds together (nobody leaves the floor, nobody sits stuck), that the drivers really go for
// each other, and that ramps lift cars the way the mesh draws them.
import { describe, expect, it } from 'vitest';
import { CAR_BODY_DEFS, type CarBody } from '../shared/rally.ts';
import { ARENA_IDS, DERBY_DAMAGE, DERBY_HP, DERBY_WARMUP, DERBY_SECONDS, DerbyBoard } from '../shared/derby.ts';
import { BASE_POWER, Car, collideCars, type Controls } from './car.ts';
import { arenaCourse, arenaStart } from './arena.ts';
import { DerbyBrain, freeSpot, type DerbyFoe } from './derbyai.ts';
import { impactDamage, maxHpOf } from './combat.ts';
import { liftFor, rampHeight, type RampSpec } from './ramps.ts';
import { Track } from './track.ts';
import { courseFor } from './variant.ts';
import { rng } from './util.ts';

interface Sim {
  board: DerbyBoard;
  cars: Car[];
  hp: number[];
  maxHp: number[];
  t: number;
  hits: number;
  rescues: number;
  stuck: number;
  outside: number;
}

/** Runs a derby between computer drivers only. */
function runDerby(arena: (typeof ARENA_IDS)[number], seed: number, bodies: CarBody[], seconds: number, aggro: number[] = []): Sim {
  const ac = arenaCourse(arena, seed);
  const track = new Track(ac.def);
  track.line.fill(0);
  track.vmax.fill(40);
  const ground = { height: () => 0, lift: liftFor(ac.ramps, track) };
  const n = bodies.length;
  const ids = bodies.map((_, i) => `c${i}`);
  const board = new DerbyBoard(ids, DERBY_SECONDS);
  const cars: Car[] = [];
  const brains: DerbyBrain[] = [];
  const hp: number[] = [];
  const maxHp: number[] = [];
  bodies.forEach((b, i) => {
    const car = new Car(track);
    const def = CAR_BODY_DEFS[b];
    car.setBody(b);
    const st = arenaStart(track, ac.shape, ac.cx, ac.cz, i, n);
    car.place(st.s, st.d, ground);
    car.heading = st.heading;
    car.power = BASE_POWER * def.power;
    car.grip = def.grip;
    car.size = 1 + (def.size - 1) * 0.6;
    car.assist = 0.75;
    cars.push(car);
    brains.push(new DerbyBrain({ aggro: aggro[i] ?? 0.8, skill: 0.95, phase: i * 1.7 }, rng(seed * 31 + i)));
    maxHp.push(Math.round(maxHpOf(def.feel.mass) * DERBY_HP));
    hp.push(maxHp[i]!);
  });
  const srand = rng(seed * 977 + 5);
  const ctl: Controls[] = cars.map(() => ({ throttle: 0, brake: 0, steer: 0, handbrake: false }));
  const dt = 1 / 60;
  const sim: Sim = { board, cars, hp, maxHp, t: 0, hits: 0, rescues: 0, stuck: 0, outside: 0 };
  const stuckFor = cars.map(() => 0);
  const lastHit = new Map<number, { by: number; t: number }>();
  for (; sim.t < seconds && !board.isOver(sim.t); sim.t += dt) {
    const foes: DerbyFoe[] = cars.map((c, i) => ({ car: c, alive: !board.isOut(ids[i]!), hp: hp[i]! / maxHp[i]!, player: false }));
    cars.forEach((c, i) => {
      if (board.isOut(ids[i]!)) {
        ctl[i] = { throttle: 0, brake: 0.3, steer: 0, handbrake: false };
        return;
      }
      brains[i]!.think(c, foes, dt, sim.t < DERBY_WARMUP);
      brains[i]!.drive(c, track, foes, sim.t, dt, ctl[i]!);
      if (brains[i]!.gaveUp) {
        // the race puts a car that keeps getting stuck back on the floor
        brains[i]!.gaveUp = false;
        sim.rescues++;
        const spot = freeSpot(track, cars.filter((o, k) => o !== c && !board.isOut(ids[k]!)), srand);
        c.place(spot.s, spot.d, ground);
        c.vx = c.vz = 0;
        c.ghost = 2.2;
      }
    });
    for (let k = 0; k < 2; k++) {
      cars.forEach((c, i) => c.step(dt / 2, ctl[i]!, ground, false));
      collideCars(cars, (a, b, j, info) => {
        if (j < 0.5) return;
        sim.hits++;
        const tot = info.closeA + info.closeB + 0.001;
        for (const [x, o, closeO] of [[a, b, info.closeB], [b, a, info.closeA]] as const) {
          if (board.isOut(ids[x]!)) continue;
          const dmg = impactDamage({ dv: info.j / cars[x]!.feel.mass, blame: closeO / tot, ram: 1, dmgTaken: 1 }) * DERBY_DAMAGE;
          if (dmg <= 0) continue;
          hp[x] = Math.max(0, hp[x]! - dmg);
          lastHit.set(x, { by: o, t: sim.t });
          if (hp[x]! <= 0) {
            const h = lastHit.get(x);
            board.eliminate(ids[x]!, sim.t, h && sim.t - h.t < 2 ? ids[h.by]! : null);
            cars[x]!.ghost = 1e9;
          }
        }
      });
    }
    cars.forEach((c, i) => {
      c.settle(dt, ground);
      if (board.isOut(ids[i]!)) return;
      const p = c.proj;
      const hw = track.at(track.hw, p.s);
      if (Math.abs(p.d) > hw + 2) sim.outside++;
      stuckFor[i] = c.speed < 2 ? stuckFor[i]! + dt : 0;
      if (stuckFor[i]! > 10) sim.stuck++;
    });
  }
  return sim;
}

const STATS = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.STATS;
it.skipIf(!STATS)('stats', () => {
  for (const arena of ARENA_IDS) {
    const rows: string[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sim = runDerby(arena, seed, ['pickup', 'hatch', 'tractor', 'coupe', 'monster', 'buggy'], 160, [1, 0.6, 1, 0.1, 0.9, 0.3]);
      const outs = sim.board.standings(() => 0).filter((r) => r.outAt !== null).map((r) => Math.round(r.outAt!)).sort((a, b) => a - b);
      rows.push(`${seed}: end ${sim.t.toFixed(0)} alive ${sim.board.aliveCount()} out@ ${outs.join(',')}`);
    }
    console.log(arena + '\n' + rows.join('\n'));
  }
});

describe('the arenas', () => {
  it('build a closed ring with room for a derby, a solid island in the middle and the same shape for the same seed', () => {
    for (const id of ARENA_IDS)
      for (const seed of [1, 2, 3, 99]) {
        const a = arenaCourse(id, seed);
        const t = new Track(a.def);
        expect(t.length, id).toBeGreaterThan(250);
        expect(t.length, id).toBeLessThan(600);
        // the fences stand on both sides of every sample, further out than the floor, and the island's edge does not flip inside out
        for (let i = 0; i < t.n; i++) {
          expect(t.hw[i]!).toBeGreaterThan(15);
          expect(t.wallL[i]!).toBeGreaterThan(t.hw[i]!);
          expect(t.wallR[i]!).toBeGreaterThan(t.hw[i]!);
        }
        const again = arenaCourse(id, seed);
        expect(again.ramps).toEqual(a.ramps);
        expect(again.dir).toBe(a.dir);
        expect(a.ramps.length).toBeGreaterThanOrEqual(3);
      }
  });

  it('start every car on the outer edge, facing the middle, well apart', () => {
    for (const id of ARENA_IDS) {
      const a = arenaCourse(id, 7);
      const t = new Track(a.def);
      const pts = Array.from({ length: 6 }, (_, i) => arenaStart(t, a.shape, a.cx, a.cz, i, 6));
      for (const p of pts) {
        const w = t.point(p.s, p.d);
        // facing the middle: the heading points at it
        const toMid = Math.atan2(a.cx - w.x, a.cz - w.z);
        expect(Math.abs(Math.atan2(Math.sin(toMid - p.heading), Math.cos(toMid - p.heading)))).toBeLessThan(0.05);
        expect(Math.abs(p.d)).toBeGreaterThan(a.shape.hw - 6);
      }
      for (let i = 0; i < pts.length; i++)
        for (let k = i + 1; k < pts.length; k++) {
          const A = t.point(pts[i]!.s, pts[i]!.d);
          const B = t.point(pts[k]!.s, pts[k]!.d);
          expect(Math.hypot(A.x - B.x, A.z - B.z)).toBeGreaterThan(18);
        }
    }
  });
});

describe('the derby drivers', () => {
  it('go for each other: a field of rammers wrecks cars, nobody leaves the floor and nobody sits stuck', () => {
    for (const arena of ARENA_IDS)
      for (const seed of [1, 4, 5]) {
        const sim = runDerby(arena, seed, ['pickup', 'hatch', 'tractor', 'coupe', 'monster', 'buggy'], 160);
        const out = sim.board.ids.length - sim.board.aliveCount();
        expect(sim.hits, arena).toBeGreaterThan(8);
        expect(out, arena).toBeGreaterThanOrEqual(1);
        expect(sim.outside, `${arena} off the floor`).toBeLessThan(40);
        expect(sim.stuck, `${arena} ${seed} stuck`).toBe(0);
      }
  });

  it('racers that only roam and dodge still get hit now and then but last longer than the rammers', () => {
    const sim = runDerby('bowl', 11, ['coupe', 'coupe', 'pickup', 'pickup'], 120, [0.05, 0.05, 1, 1]);
    const outAt = (i: number): number => sim.board.standings(() => 0).find((r) => r.id === `c${i}`)?.outAt ?? Infinity;
    expect(Math.min(outAt(0), outAt(1))).toBeGreaterThanOrEqual(Math.min(outAt(2), outAt(3)) - 1);
  });
});

describe('ramps', () => {
  const kicker: RampSpec = { kind: 'kicker', s: 100, d: 0, ang: 0, len: 7, width: 4.4, height: 1.25 };

  it('rise towards the lip and drop away at once, with soft sides and nothing outside', () => {
    expect(rampHeight(kicker, -3.5, 0)).toBeCloseTo(0, 5);
    expect(rampHeight(kicker, 0, 0)).toBeCloseTo(0.625, 3);
    expect(rampHeight(kicker, 3.4, 0)).toBeGreaterThan(1.1);
    expect(rampHeight(kicker, 3.6, 0)).toBe(0);
    expect(rampHeight(kicker, 0, 2.2)).toBeGreaterThan(0.2);
    expect(rampHeight(kicker, 0, 3.4)).toBe(0);
    const hump: RampSpec = { ...kicker, kind: 'hump', len: 10, height: 0.8 };
    expect(rampHeight(hump, 0, 0)).toBeCloseTo(0.8, 3);
    expect(rampHeight(hump, 4.9, 0)).toBeLessThan(0.02);
    // a hump works from either way
    expect(rampHeight(hump, 2, 0)).toBeCloseTo(rampHeight(hump, -2, 0), 6);
  });

  it('a car driving over a kicker leaves the ground and comes down again', () => {
    const track = new Track(courseFor('farm', null));
    const ramp: RampSpec = { kind: 'kicker', s: 60, d: 0, ang: 0, len: 7, width: 5, height: 1.25 };
    const ground = { height: () => 0, lift: liftFor([ramp], track) };
    const car = new Car(track);
    car.setBody('hatch');
    car.place(10, 0, ground);
    car.vx = Math.sin(car.heading) * 24;
    car.vz = Math.cos(car.heading) * 24;
    const ctl: Controls = { throttle: 0.6, brake: 0, steer: 0, handbrake: false };
    let air = 0;
    let maxAir = 0;
    let top = 0;
    for (let t = 0; t < 6; t += 1 / 120) {
      car.step(1 / 120, ctl, ground, false);
      car.settle(1 / 120, ground);
      if (car.air) air += 1 / 120;
      else {
        maxAir = Math.max(maxAir, air);
        air = 0;
      }
      top = Math.max(top, car.y);
    }
    expect(maxAir).toBeGreaterThan(0.5);
    expect(maxAir).toBeLessThan(1.6);
    expect(top).toBeGreaterThan(1.5);
  });
});
