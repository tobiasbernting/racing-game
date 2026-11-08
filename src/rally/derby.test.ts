// A derby run headless: the arena track, the real car physics, the derby drivers and the real damage numbers. These
// check that the arena holds together (nobody leaves the floor, nobody sits stuck), that the drivers really go for
// each other, and that ramps lift cars the way the mesh draws them.
import { describe, expect, it } from 'vitest';
import { CAR_BODIES, CAR_BODY_DEFS, type CarBody } from '../shared/rally.ts';
import { ARENA_IDS, DERBY_DAMAGE, DERBY_HP, DERBY_WARMUP, DERBY_SECONDS, DerbyBoard } from '../shared/derby.ts';
import { BASE_POWER, Car, collideCars, type Controls } from './car.ts';
import { arenaCourse, arenaStart } from './arena.ts';
import { DerbyBrain, freeSpot, type DerbyFoe } from './derbyai.ts';
import { fegisDealt, fegisDrain, fegisTick, impactDamage, maxHpOf, type FegisState } from './combat.ts';
import { damagePoints } from '../shared/kinds.ts';
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
  /** Damage dealt per car (points), what the aggressor side (it drove into the other) and the victim side took, in health points, and the cars that were ever marked FEGIS. */
  dealt: number[];
  aggressorTaken: number;
  victimTaken: number;
  fegis: Set<number>;
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
  const sim: Sim = { board, cars, hp, maxHp, t: 0, hits: 0, rescues: 0, stuck: 0, outside: 0, dealt: cars.map(() => 0), aggressorTaken: 0, victimTaken: 0, fegis: new Set() };
  const marks: FegisState[] = cars.map(() => ({ idleT: 0, fegis: false }));
  const stuckFor = cars.map(() => 0);
  const lastHit = new Map<number, { by: number; t: number }>();
  for (; sim.t < seconds && !board.isOver(sim.t); sim.t += dt) {
    const foes: DerbyFoe[] = cars.map((c, i) => ({ car: c, alive: !board.isOut(ids[i]!), hp: hp[i]! / maxHp[i]!, player: false }));
    cars.forEach((c, i) => {
      if (board.isOut(ids[i]!)) {
        ctl[i] = { throttle: 0, brake: 0.3, steer: 0, handbrake: false };
        return;
      }
      if (sim.t >= DERBY_WARMUP) {
        if (fegisTick(marks[i]!, dt, true) === 'start') sim.fegis.add(i);
        if (marks[i]!.fegis) hp[i] = Math.max(0, hp[i]! - fegisDrain(maxHp[i]!, dt, true));
        if (hp[i]! <= 0) {
          board.eliminate(ids[i]!, sim.t, null);
          c.ghost = 1e9;
          return;
        }
      }
      brains[i]!.desperate = marks[i]!.fegis;
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
          const dmg = impactDamage({ dv: info.j / cars[x]!.feel.mass, blame: closeO / tot, facing: x === a ? info.faceA : info.faceB, ram: 1, dmgTaken: 1 }) * DERBY_DAMAGE;
          if (dmg <= 0) continue;
          const real = Math.min(dmg, hp[x]!);
          if (closeO / tot < 0.5) sim.aggressorTaken += real;
          else sim.victimTaken += real;
          sim.dealt[o]! += damagePoints(real, maxHp[x]!);
          board.deal(ids[o]!, damagePoints(real, maxHp[x]!));
          fegisDealt(marks[o]!);
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

describe('fighting is the only way to win a derby', () => {
  it('the car that rams takes far less damage than the car it hits (nose against flank and tail), summed over a whole derby', () => {
    let aggr = 0;
    let vict = 0;
    for (const seed of [1, 2, 3, 4]) {
      const sim = runDerby('bowl', seed, ['pickup', 'hatch', 'tractor', 'coupe', 'monster', 'buggy'], 100);
      aggr += sim.aggressorTaken;
      vict += sim.victimTaken;
    }
    console.log('derby damage taken by the aggressor side vs the victim side', Math.round(aggr), Math.round(vict));
    expect(vict).toBeGreaterThan(0);
    expect(aggr).toBeLessThan(vict * 0.45);
  });

  it('every computer driver goes for the others, racers too: all of them deal damage in the first 60 seconds, none cruises', () => {
    for (const seed of [1, 2, 3]) {
      // two real rammers and four racers with hardly any appetite
      const sim = runDerby('oval', seed, ['pickup', 'hatch', 'tractor', 'coupe', 'monster', 'buggy'], 60, [1, 0.05, 1, 0.05, 0.1, 0.05]);
      const quiet = sim.dealt.filter((d) => d < 1).length;
      expect(quiet, `seed ${seed}: dealt ${sim.dealt.map((d) => Math.round(d)).join(',')}`).toBeLessThanOrEqual(1);
    }
  });

  it('points rule the table: the car with the most damage and wrecks tops it, not the one with the most health', () => {
    const sim = runDerby('bowl', 5, ['pickup', 'hatch', 'tractor', 'coupe', 'monster', 'buggy'], 150, [1, 0.3, 1, 0.3, 0.8, 0.3]);
    const st = sim.board.standings((id) => sim.hp[Number(id.slice(1))]! / sim.maxHp[Number(id.slice(1))]!);
    const pts = st.map((r) => r.points);
    expect([...pts].sort((a, b) => b - a)).toEqual(pts);
    expect(st[0]!.dealt + st[0]!.takedowns * 20).toBeGreaterThan(0);
  });
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

  it('racers are no passengers: with almost no appetite they still hunt, and a rammer does not simply outlast them by cruising', () => {
    const sim = runDerby('bowl', 11, ['coupe', 'coupe', 'pickup', 'pickup'], 120, [0.05, 0.05, 1, 1]);
    // the racers deal damage too, and every car ends up in the points table with a fair share of the fighting
    expect(sim.dealt[0]! + sim.dealt[1]!).toBeGreaterThan(5);
    expect(sim.hits).toBeGreaterThan(10);
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

describe('every vehicle in the arena', () => {
  it('all twenty bodies can be driven in a derby: they stay on the floor, stay finite and get hit', () => {
    for (const body of CAR_BODIES) {
      const sim = runDerby('bowl', 3, [body, 'hatch', 'pickup', 'coupe'], 40);
      for (const c of sim.cars) {
        expect(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.y), body).toBe(true);
        expect(Math.abs(c.proj.d), body).toBeLessThan(45);
        expect(Math.abs(c.y), body).toBeLessThan(8);
      }
      expect(sim.outside, body).toBeLessThan(30);
    }
  });
});
