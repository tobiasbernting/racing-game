// A race as a sum of times instead of dice: the player's lap time from their tune and skill, each rival's lap time
// from its scaled kit, archetype and the catch-up, run side by side metre by metre. The balance tests use it to ask
// the questions that matter (can a strong build lap the field? is the last act a fight?). The lap-time model is in
// shared/pace.ts and was fitted to the real physics; the contact side (takedowns, wrecks) is a small model of
// what src/rally/combat.ts does in a race, with the same ram and mass numbers.
import { MAX_CHARGES, MAX_NITRO_SECONDS, capGrip, capPower } from '../rally/mods.ts';
import { ramPowerOf } from '../rally/combat.ts';
import { LASTLAP_BOOST, catchUpBoost, easeOff, type RivalSpec } from '../shared/field.ts';
import { carnagePoints, pointsTable } from '../shared/kinds.ts';
import { DERBY_SECONDS } from '../shared/derby.ts';
import { BODY_LAP, HOOK_SAVE, HUMAN_FACTOR, NITRO_SAVE, baseLap, carGain, driftSaving, rivalLap, type HumanSkill } from '../shared/pace.ts';
import { CAR_BODY_DEFS, NITRO_SECONDS } from '../shared/rally.ts';
import { PASSIVE_LAP, PASSIVE_RAM, activeLapSave, kitOf, usesPerLap } from '../shared/abilities.ts';
import type { RallyResult } from '../rally/options.ts';
import type { RacePlan } from './plan.ts';
import { Rng } from './rng.ts';
import type { RunState } from './state.ts';
import { buildRunMods, tierOf } from './upgrades.ts';

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
  /** Damage dealt multiplier (spikes) and health multiplier (plates). */
  dmg: number;
  hp: number;
  mass: number;
  tough: number;
  grip: number;
  power: number;
}

/** What a run's car and trinkets come to, as numbers the race model reads (the game's own caps included). */
export function playerStats(run: RunState, m: PlayerModel): PlayerStats {
  const body = CAR_BODY_DEFS[run.car.body];
  const mods = buildRunMods(run.trinkets, run.up, run.car.body);
  const t = mods.tune;
  const power = capPower(body.power * t.power);
  const grip = capGrip(body.grip * t.grip);
  const charges = Math.min(MAX_CHARGES, Math.round(t.charges));
  const len = charges ? Math.min(NITRO_SECONDS * t.nitroSeconds, MAX_NITRO_SECONDS / charges) : 0;
  const human = HUMAN_FACTOR[m.skill];
  // a vehicle with a top speed (moped, tractor) loses on the straights
  // (the ten newest vehicles have their own measured lap factor instead, grip and power upgrades still counting on top of it)
  const bodyLap = BODY_LAP[run.car.body];
  const top = bodyLap === undefined && body.feel.top > 0 ? 1 + 0.55 * Math.max(0, 1 - (body.feel.top * t.top) / 50) : 1;
  // the vehicle's own kit: a passive that is a little faster, and an active used a few times a lap by a driver who knows it
  const skillK = 0.5 + 0.5 * Math.min(1, (1.08 - human) * 8);
  const passive = PASSIVE_LAP[run.car.body] ?? 1;
  // the upgrades that make a lap faster for a driver who uses them: stunts that fill the nitro, a boost on every drift, the faster ability
  const upSave = Object.entries(UP_SAVE).reduce((a, [line, per]) => a + per * tierOf(run.up, line), 0) * skillK;
  const k = kitOf(run.car.body);
  const abilityMore = k.active.save * skillK * (usesPerLap(50, k.active.cooldown * t.abilCd) - usesPerLap(50, k.active.cooldown)) * (0.5 + 0.5 * t.abilDur) + (t.abilDur - 1) * k.active.save * skillK * usesPerLap(50, k.active.cooldown);
  return {
    lap: (course) => baseLap(course) * (bodyLap === undefined ? carGain(grip, power) : bodyLap * carGain(grip / body.grip, power / body.power)) * human * top * passive,
    nitroSaved: charges * len * NITRO_SAVE * (0.6 + 0.4 * Math.min(1, (1.08 - human) * 8)),
    // mini-turbos and the speed hooks together never save more than 2.2 s a lap
    driftSaved: Math.min(1.7, driftSaving(human, t.driftRate) + run.trinkets.reduce((a, o) => a + (HOOK_SAVE[o.id] ?? 0) * Math.min(o.n, 3), 0) * skillK + upSave) + activeLapSave(run.car.body, 50, skillK) + abilityMore,
    ram: Math.max(ramPowerOf(t.shove), PASSIVE_RAM[run.car.body] ?? 1) * (1 + 0.04 * tierOf(run.up, 'ram.boost')),
    dmg: t.spike,
    hp: t.hp,
    mass: body.feel.mass * Math.pow(t.mass, 0.7),
    tough: Math.max(0.2, t.tough) / body.tough,
    grip,
    power,
  };
}

/** Seconds per lap, per tier, that an upgrade line saves a driver who uses it (the stunts that fill the nitro, a spark on every drift or boost). */
export const UP_SAVE: Record<string, number> = {
  'stunt.air': 0.06,
  'stunt.flip': 0.05,
  'stunt.wheel': 0.04,
  'stunt.near': 0.04,
  'stunt.cap': 0.1,
  'race.drift': 0.04,
  'race.cap': 0.12,
};

/** Seconds a lap that a full shove (ram power and mass) saves in each kind of race. */
const SHOVE = { rally: 0, mixed: 1.1, carnage: 1.3 } as const;

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

/** How well a driver of each kind dodges the hits in a derby (a good player sees them coming). */
/** How the computer cars' numbers are scaled to the player's in the derby model (fitted so that a decent build wins a derby more often than a bare car). */
const RIVAL_SURV = 0.8;
const RIVAL_OFF = 0.85;
const DODGE = { poor: 0.8, average: 1, good: 1.25, expert: 1.5 } as const;

/**
 * A Rivningsderby as a sequence of eliminations. Every car has a survival number (health, mass, armour: the stats the
 * collision numbers use) and an offence number (ram, mass, appetite for contact); a car's chance of being the next one
 * wrecked is what the others throw at it divided by what it can take and how well it dodges. The weakest tend to go
 * first, the striker who knocks out the field survives, and when the clock runs out the cars still running are ranked by
 * health. Takedowns go to whoever dealt the blow.
 */
function simulateDerby(plan: RacePlan, run: RunState, m: PlayerModel, rg: Rng, stats: PlayerStats): SimResult {
  const field = plan.field;
  interface D {
    id: string;
    surv: number;
    off: number;
    dodge: number;
    alive: boolean;
    take: number;
    outAt: number;
  }
  const mine: D = {
    id: 'me',
    surv: (Math.pow(stats.hp, 0.65) * (0.7 + 0.3 * stats.mass)) / Math.pow(Math.max(0.25, stats.tough), 0.6),
    // the one who goes for the hits deals them (ram, spikes, mass); the one who stays out of the way dodges more of them
    off: Math.pow(stats.ram * stats.dmg, 1.3) * Math.sqrt(stats.mass) * (0.25 + 0.95 * m.aggression),
    // a quick, grippy car slips out of the way: grip and power are what the dodging is made of
    dodge: DODGE[m.skill] * Math.pow(Math.min(1.6, stats.grip), 0.9) * Math.pow(Math.min(1.8, stats.power), 0.7) * (1.45 - 0.75 * m.aggression),
    alive: true,
    take: 0,
    outAt: 0,
  };
  const cars: D[] = [mine];
  for (const sp of field.rivals) {
    const skillK = 0.85 + 0.6 * Math.max(0, Math.min(1, (sp.skill - 0.8) / 0.26));
    cars.push({
      id: `ai${sp.slot}`,
      surv: RIVAL_SURV * (Math.pow(sp.hp * 1.0, 0.65) * (0.7 + 0.3 * sp.mass)) / Math.pow(Math.max(0.25, sp.dmgTaken), 0.6),
      off: RIVAL_OFF * sp.ram * Math.sqrt(sp.mass) * (0.2 + 0.8 * sp.aggro),
      dodge: skillK * (1.25 - 0.4 * sp.aggro),
      alive: true,
      take: 0,
      outAt: 0,
    });
  }
  const noise = (): number => Math.exp(0.45 * gauss(rg));
  const pickBy = (list: D[], w: (c: D) => number): D => {
    const ws = list.map((c) => Math.max(1e-6, w(c)));
    let x = rg.float() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) {
      x -= ws[i]!;
      if (x <= 0) return list[i]!;
    }
    return list[list.length - 1]!;
  };
  let t = 0;
  const out: D[] = [];
  while (cars.filter((c) => c.alive).length > 1) {
    const alive = cars.filter((c) => c.alive);
    // one wreck every half minute or so, quicker when there are many cars left
    t += -Math.log(Math.max(1e-6, rg.float())) * 24 * Math.pow(4 / alive.length, 0.35);
    if (t >= DERBY_SECONDS) break;
    const threat = (c: D): number => alive.reduce((a, o) => a + (o === c ? 0 : o.off), 0);
    const victim = pickBy(alive, (c) => (threat(c) * noise()) / (c.surv * c.dodge));
    const attacker = pickBy(
      alive.filter((c) => c !== victim),
      (c) => Math.pow(c.off, 1.5),
    );
    victim.alive = false;
    victim.outAt = t;
    attacker.take++;
    out.push(victim);
  }
  // who is left when the clock runs out is ranked by health: what a car can take, a little luck
  const left = cars.filter((c) => c.alive).sort((a, b) => b.surv * b.dodge * noise() - a.surv * a.dodge * noise());
  const order = [...left, ...out.reverse()];
  const place = order.indexOf(mine) + 1;
  const row = { points: carnagePoints(place, mine.take) };
  const wrecked = mine.alive ? 0 : 1;
  return { roadPlace: place, rank: place, n: cars.length, time: Math.min(DERBY_SECONDS, t), points: row.points, takedowns: mine.take, wrecks: wrecked, lapped: false, margin: 0, winners: order.map((c) => c.id) };
}

/** Runs one race to the end. */
export function simulateRace(plan: RacePlan, run: RunState, m: PlayerModel, rg: Rng, stats: PlayerStats = playerStats(run, m)): SimResult {
  if (plan.arena) return simulateDerby(plan, run, m, rg, stats);
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
    const lam = 0.35 + m.aggression * (1.1 + 2.4 * (stats.ram - 1) + 0.5 * (stats.mass - 1) + 0.4 * (stats.mass > 2 ? 1 : 0)) * (0.8 + 0.2 * stats.dmg);
    myTake = poisson(rg, Math.min(6, lam));
    for (const sp of field.rivals) take[`ai${sp.slot}`] = poisson(rg, 0.15 + 0.5 * sp.aggro * sp.ram);
    const hunt = field.rivals.reduce((a, sp) => a + sp.aggro * sp.ram, 0);
    myWrecks = poisson(rg, (0.25 + 0.3 * hunt * (stats.tough / Math.pow(stats.hp, 0.6))) / (0.7 + 0.3 * stats.mass));
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
  // a heavy bumper pays in the races with shoving: the traffic is pushed aside, not driven round (not in Rally, where the rivals keep off)
  const shove = SHOVE[plan.kind] * Math.min(1.4, 0.45 * Math.max(0, stats.ram - 1) + 0.25 * Math.max(0, stats.mass - 1)) * (0.5 + 0.5 * m.aggression);
  const savedPerLap = (stats.nitroSaved + stats.driftSaved * laps) / laps + shove;
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
