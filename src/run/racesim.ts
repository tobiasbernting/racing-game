// A race as a sum of times instead of dice: the player's lap time from their tune and skill, each rival's lap time
// from its scaled kit, archetype and the catch-up, run side by side metre by metre. The balance tests use it to ask
// the questions that matter (can a strong build lap the field? is the last act a fight?). The lap-time model is in
// shared/pace.ts and was fitted to the real physics; the contact side (takedowns, wrecks) is a small model of
// what src/rally/combat.ts does in a race, with the same ram and mass numbers.
import { MAX_CHARGES, MAX_NITRO_SECONDS, capGrip, capPower } from '../rally/mods.ts';
import { ramPowerOf } from '../rally/combat.ts';
import { LASTLAP_BOOST, catchUpBoost, easeOff, type RivalSpec } from '../shared/field.ts';
import { pointsTable } from '../shared/kinds.ts';
import { HOOK_SAVE, HUMAN_FACTOR, NITRO_SAVE, baseLap, carGain, driftSaving, rivalLap, type HumanSkill } from '../shared/pace.ts';
import { CAR_BODY_DEFS, NITRO_SECONDS, PART_EFFECTS } from '../shared/rally.ts';
import type { RallyResult } from '../rally/options.ts';
import type { RacePlan } from './plan.ts';
import { Rng } from './rng.ts';
import type { RunState } from './state.ts';
import { buildMods } from './trinkets.ts';

/** A lap is about this long (m): the speed is only there to turn lap times into gaps. */
export const LAP_M = 2400;

export interface PlayerModel {
  skill: HumanSkill;
  /** 0..1: how much the player goes for takedowns in Blodbad. */
  aggression: number;
}

export interface PlayerStats {
  /** Lap time (s) on a course. */
  lap(course: RacePlan['course']): number;
  /** Seconds saved in a whole race by nitro, and per lap by mini-turbos. */
  nitroSaved: number;
  driftSaved: number;
  ram: number;
  mass: number;
  tough: number;
  grip: number;
  power: number;
}

/** What a run's car and trinkets come to, as numbers the race model reads (the game's own caps included). */
export function playerStats(run: RunState, m: PlayerModel): PlayerStats {
  const body = CAR_BODY_DEFS[run.car.body];
  const mods = buildMods(run.trinkets, run.car.body);
  const t = mods.tune;
  const p = run.car.parts;
  const power = capPower(body.power * (1 + PART_EFFECTS.enginePower * (p.engine ?? 0)) * t.power);
  const grip = capGrip(body.grip * (1 + PART_EFFECTS.tyresGrip * (p.tyres ?? 0)) * t.grip);
  const charges = Math.min(MAX_CHARGES, Math.round((p.turbo ?? 0) * PART_EFFECTS.turboCharges + t.charges));
  const len = charges ? Math.min(NITRO_SECONDS * t.nitroSeconds, MAX_NITRO_SECONDS / charges) : 0;
  const human = HUMAN_FACTOR[m.skill];
  // a vehicle with a top speed (moped, tractor) loses on the straights
  const top = body.feel.top > 0 ? 1 + 0.55 * Math.max(0, 1 - (body.feel.top * t.top) / 50) : 1;
  return {
    lap: (course) => baseLap(course) * carGain(grip, power) * human * top,
    nitroSaved: charges * len * NITRO_SAVE * (0.6 + 0.4 * Math.min(1, (1.08 - human) * 8)),
    // mini-turbos and the speed hooks together never save more than 2.2 s a lap
    driftSaved: Math.min(1.6, driftSaving(human, t.driftRate) + run.trinkets.reduce((a, o) => a + (HOOK_SAVE[o.id] ?? 0) * Math.min(o.n, 3), 0) * (0.5 + 0.5 * Math.min(1, (1.08 - human) * 8))),
    ram: ramPowerOf(t.shove),
    mass: body.feel.mass,
    tough: Math.max(0.2, (1 - PART_EFFECTS.armourShield * (p.armour ?? 0)) * t.tough) / body.tough,
    grip,
    power,
  };
}

const INCIDENT = { poor: 0.35, average: 0.2, good: 0.12, expert: 0.07 } as const;
const SIGMA = { poor: 0.065, average: 0.05, good: 0.04, expert: 0.03 } as const;
/** The share of the hazards on the road a driver of each kind drives into (rivals do not steer round them). */
const HAZARD_HIT = { poor: 0.22, average: 0.16, good: 0.1, expert: 0.06 } as const;
const HAZARD_COST = { hay: 2.2, oil: 2.8, pothole: 0.8 } as const;

const gauss = (rg: Rng): number => Math.sqrt(-2 * Math.log(Math.max(1e-9, rg.float()))) * Math.cos(2 * Math.PI * rg.float());
const poisson = (rg: Rng, lam: number): number => {
  let k = 0;
  let p = 1;
  const L = Math.exp(-lam);
  do {
    k++;
    p *= rg.float();
  } while (p > L && k < 20);
  return k - 1;
};

export interface SimResult {
  /** The player's place on the road, and (Blodbad) the rank by points. */
  roadPlace: number;
  rank: number;
  n: number;
  /** Seconds. */
  time: number;
  points: number;
  takedowns: number;
  wrecks: number;
  /** The player finished a whole lap or more ahead of the last car. */
  lapped: boolean;
  /** Seconds ahead of the second car (negative when behind the winner). */
  margin: number;
  /** Ids in finishing order. */
  winners: string[];
}

interface Car {
  id: string;
  lap: number;
  sigma: number;
  incident: number;
  spec: RivalSpec | null;
  u: number;
  t: number;
  done: boolean;
  pen: number;
}

/** Runs one race to the end. */
export function simulateRace(plan: RacePlan, run: RunState, m: PlayerModel, rg: Rng, stats: PlayerStats = playerStats(run, m)): SimResult {
  const laps = plan.rules.laps;
  const course = plan.course;
  const carnage = plan.kind === 'carnage';
  const field = plan.field;
  const cars: Car[] = [{ id: 'me', lap: stats.lap(course), sigma: SIGMA[m.skill], incident: INCIDENT[m.skill], spec: null, u: 0, t: 0, done: false, pen: 0 }];
  for (const sp of field.rivals) cars.push({ id: `ai${sp.slot}`, lap: rivalLap(course, { skill: sp.skill, grip: sp.grip, power: sp.power, sharp: field.sharp, nitro: sp.nitroEvery ? sp.nitro : 0 }), sigma: 0.026, incident: 0.1, spec: sp, u: 0, t: 0, done: false, pen: 0 });
  // contact: who gets how many takedowns and how many times the player is wrecked
  let myTake = 0;
  let myWrecks = 0;
  const take: Record<string, number> = {};
  if (carnage) {
    const lam = 0.35 + m.aggression * (1.1 + 2.4 * (stats.ram - 1) + 0.5 * (stats.mass - 1) + 0.4 * (stats.mass > 2 ? 1 : 0));
    myTake = poisson(rg, Math.min(6, lam));
    for (const sp of field.rivals) take[`ai${sp.slot}`] = poisson(rg, 0.15 + 0.5 * sp.aggro * sp.ram);
    const hunt = field.rivals.reduce((a, sp) => a + sp.aggro * sp.ram, 0);
    myWrecks = poisson(rg, (0.25 + 0.3 * hunt * stats.tough) / (0.7 + 0.3 * stats.mass));
    for (let k = 0; k < myWrecks && field.rivals.length; k++) {
      const sp = field.rivals[rg.int(0, field.rivals.length - 1)]!;
      take[`ai${sp.slot}`] = (take[`ai${sp.slot}`] ?? 0) + 1;
    }
  }
  // hazards on the road: hay, oil and potholes cost seconds to whoever drives into them
  const hz = field.hazards;
  const hazardCost = (hit: number, slip: number): number => laps * hit * (hz.hay * HAZARD_COST.hay * slip + hz.oil * HAZARD_COST.oil * slip + hz.pothole * HAZARD_COST.pothole);
  // being gone for by the rivals who like contact (already scaled by the race kind): shoves, spins and lost speed
  const hunted = field.rivals.reduce((a, sp) => a + sp.aggro * sp.ram, 0);
  const contactCost = (laps * 0.4 * hunted) / (0.7 + 0.3 * Math.sqrt(stats.mass));
  const myPenalty = contactCost + hazardCost(HAZARD_HIT[m.skill], 1) +  (carnage ? myWrecks * 3.0 + myTake * 0.6 * (0.4 + m.aggression) : 0) + (poisson(rg, laps * INCIDENT[m.skill]) * 6);
  // per-car pace for each lap (noise), with the player's savings spread over the race
  const pace: number[][] = cars.map((c) => Array.from({ length: laps }, () => LAP_M / (c.lap * (1 + c.sigma * gauss(rg)))));
  const me = cars[0]!;
  const savedPerLap = (stats.nitroSaved + stats.driftSaved * laps) / laps;
  for (let l = 0; l < laps; l++) pace[0]![l] = LAP_M / Math.max(1, me.lap * (1 + me.sigma * gauss(rg)) - savedPerLap);
  me.pen = myPenalty;
  for (const c of cars.slice(1)) {
    let pen = 0;
    for (let l = 0; l < laps; l++) if (rg.float() < c.incident) pen += 6;
    // the rivals shove each other too, a little less than they shove the player
    const mutual = c.spec ? laps * 0.2 * Math.max(0, hunted - c.spec.aggro * c.spec.ram) : 0;
    c.pen = pen + hazardCost(0.22, c.spec?.slip ?? 1) + mutual;
  }
  const total = laps * LAP_M;
  let t = 0;
  let snap: number[] | null = null;
  while (cars.some((c) => !c.done) && t < 900) {
    t += 1;
    cars.forEach((c, idx) => {
      if (c.done) return;
      // an incident or a wreck stands the car still for a while
      const wait = Math.min(1, c.pen);
      c.pen -= wait;
      const run1 = 1 - wait;
      if (run1 <= 0) return;
      const lapNo = Math.min(laps - 1, Math.floor(c.u / LAP_M));
      let v = pace[idx]![lapNo]!;
      if (c !== me && !me.done) {
        const gap = c.u - me.u;
        v *= (1 + catchUpBoost(-gap, field.catchUp)) * (1 - easeOff(gap, field.catchUp));
        if (c.spec?.rules.includes('lastlap') && lapNo >= laps - 1) v *= 1 + LASTLAP_BOOST;
      }
      c.u += v * run1;
      if (c.u >= total) {
        c.done = true;
        c.t = t - (c.u - total) / v;
        c.u = total;
      }
    });
    if (me.done && !snap) snap = cars.map((c) => c.u);
  }
  const order = [...cars].sort((a, b) => a.t - b.t);
  const roadPlace = order.indexOf(me) + 1;
  const table = pointsTable(order.map((c, i) => ({ id: c.id, place: i + 1, takedowns: c.id === 'me' ? myTake : take[c.id] ?? 0 })));
  const row = table.find((r) => r.id === 'me')!;
  // a lap down: the player crossed the line a whole lap or more ahead of some car
  const lapped = roadPlace === 1 && !!snap && snap.slice(1).some((u) => u <= total - LAP_M);
  const second = order[roadPlace === 1 ? 1 : 0]!;
  return { roadPlace, rank: carnage ? row.rank : roadPlace, n: cars.length, time: me.t, points: row.points, takedowns: myTake, wrecks: myWrecks, lapped, margin: roadPlace === 1 ? second.t - me.t : me.t - order[0]!.t, winners: order.map((c) => c.id) };
}

/** The result as the game would report it. */
export function asRallyResult(plan: RacePlan, r: SimResult, finished = true): RallyResult {
  return { place: r.rank, n: r.n, finished, time: Math.round(r.time * 1000), laps: plan.rules.laps, kronor: 0, coins: 25, medal: null, damage: 0, kind: plan.kind, points: plan.kind === 'carnage' ? r.points : undefined, takedowns: r.takedowns, wrecked: r.wrecks, roadPlace: r.roadPlace };
}
