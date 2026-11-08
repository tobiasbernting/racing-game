// The numbers of a crash: how much a hit hurts, how much health a car has, who gets the credit for a wreck.
// Plain maths so it can be tested without a race. Used for health in Blodbad (and for the contact damage in
// Blandat, which has no health bars but takes the same hits more lightly).

import { FEGIS_AFTER, FEGIS_DRAIN } from '../shared/kinds.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export const BASE_HP = 80;
/** Seconds a wrecked car is out, and the share of its health it comes back with. */
export const WRECK_SECONDS = 3;
export const RESPAWN_HP = 0.7;
/** A hit this big (health points) can earn a takedown for whoever made it, if the victim is wrecked within the window. */
export const BIG_HIT = 5;
export const TAKEDOWN_WINDOW = 2;
/** A speed change below this (m/s) hurts nobody: scraping and nudging. */
export const HIT_MIN_DV = 1.0;
const DAMAGE_K = 5;
/** Damage multipliers by where a car is hit (see `exposure`). */
export const SIDE_MUL = 1.5;
export const REAR_MUL = 1.3;
/** The share of a full hit a car takes when it drives nose-first into another (a head-on is 0.6 each: an even split). */
export const NOSE_MIN = 0.2;
/** The most one hit can take. */
export const HIT_MAX = 40;

/** Health a car starts with: heavier bodies take more, then the rival's own multiplier. */
export const maxHpOf = (mass: number, hpMul = 1): number => Math.round(BASE_HP * clamp(0.7 + 0.3 * Math.sqrt(Math.max(0.1, mass)), 0.8, 1.5) * hpMul);

export interface ImpactIn {
  /** How much this car's speed changed in the hit (m/s): lighter cars change more. */
  dv: number;
  /** 0..1: how much of the hit was the other car's doing (it drove into you, not you into it). */
  blame: number;
  /** -1..1: the cosine between this car's nose and the direction to the other car (1 = it is hit on the nose, -1 = on the tail, 0 = on the flank). */
  facing: number;
  /** The other car's ram power (1 = a plain bumper). */
  ram: number;
  /** This car's own ram power: a ram build is hardened in front (default 1). */
  ownRam?: number;
  /** This car's damage taken multiplier (armour and toughness). */
  dmgTaken: number;
}

const smooth01 = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Where on a car a hit lands. */
export type HitZone = 'front' | 'side' | 'rear';
export const zoneOf = (facing: number): HitZone => (facing > 0.5 ? 'front' : facing < -0.5 ? 'rear' : 'side');

/**
 * How much of a hit a car feels, from where it was hit and who drove into whom. The car that rams with its nose at
 * the higher closing speed takes little (NOSE_MIN, 20 %), a head-on splits evenly (60 % each), the car hit on its
 * flank takes the bulk (x1.5) and the car hit on its tail a little less (x1.3). A ram build is hardened in front.
 */
export function exposure(facing: number, blame: number, ownRam = 1): number {
  const b = clamp(blame, 0, 1);
  const wf = smooth01((facing - 0.25) / 0.5);
  const wr = smooth01((-facing - 0.25) / 0.5);
  const ws = Math.max(0, 1 - wf - wr);
  const nose = (NOSE_MIN + (1 - NOSE_MIN) * b) / (1 + 0.3 * Math.max(0, ownRam - 1));
  const side = SIDE_MUL * (0.3 + 0.7 * b);
  const rear = REAR_MUL * (0.3 + 0.7 * b);
  return wf * nose + ws * side + wr * rear;
}

/** Health points one car loses in a hit. Faster, heavier and more rammy attackers hurt more; whoever rams with the nose hurts itself least. */
export function impactDamage(i: ImpactIn): number {
  const over = i.dv - HIT_MIN_DV;
  if (over <= 0) return 0;
  return Math.min(HIT_MAX, DAMAGE_K * over * exposure(i.facing, i.blame, i.ownRam) * Math.max(0.3, i.ram) * Math.max(0.1, i.dmgTaken));
}

/** The ram power of a car from its trinkets' shove: 1 is a plain bumper, and nothing goes past 2.5. */
export const ramPowerOf = (shove: number): number => Math.min(2.5, 1 + 0.35 * Math.max(0, shove));

/** Who dealt the last big hit to each car, to credit a takedown. */
export class TakedownLedger {
  private last = new Map<string, { by: string; t: number }>();

  /** A hit that did `dmg` health points of damage to `victim` at time `t` (seconds). */
  hit(victim: string, attacker: string, dmg: number, t: number): void {
    if (dmg >= BIG_HIT && attacker !== victim) this.last.set(victim, { by: attacker, t });
  }

  /** `victim` was wrecked at `t`: who gets the takedown (null when nobody hit it hard in the last 2 s). */
  credit(victim: string, t: number): string | null {
    const h = this.last.get(victim);
    this.last.delete(victim);
    return h && t - h.t <= TAKEDOWN_WINDOW ? h.by : null;
  }

  clear(victim: string): void {
    this.last.delete(victim);
  }
}

/** A thought experiment for tuning and tests: how many rear-end hits at `closing` m/s wreck a car. */
export function hitsToWreck(o: { massAtt: number; massVic: number; closing: number; ram: number; dmgTaken: number; hp: number }): number {
  const j = (1.25 * o.closing) / (1 / o.massAtt + 1 / o.massVic);
  const dmg = impactDamage({ dv: j / o.massVic, blame: 1, facing: -1, ram: o.ram, dmgTaken: o.dmgTaken });
  return dmg <= 0 ? Infinity : Math.ceil(o.hp / dmg);
}

/** The FEGIS clock of one car: seconds since it last dealt damage, and whether it is marked. */
export interface FegisState {
  idleT: number;
  fegis: boolean;
}

/**
 * Advances the clock. `near` is whether a rival is within reach: in a race with laps the clock pauses (and cools) when nobody
 * is close enough to hit; in the derby it always runs. Returns 'start' when the mark goes on and 'end' when it goes off.
 */
export function fegisTick(s: FegisState, dt: number, near: boolean): 'start' | 'end' | null {
  if (!near) {
    s.idleT = Math.max(0, s.idleT - dt * 2);
    if (s.fegis && s.idleT < FEGIS_AFTER * 0.5) {
      s.fegis = false;
      return 'end';
    }
    return null;
  }
  s.idleT += dt;
  if (!s.fegis && s.idleT >= FEGIS_AFTER) {
    s.fegis = true;
    return 'start';
  }
  return null;
}

/** A car that dealt damage: the clock starts over, and the mark goes off. */
export function fegisDealt(s: FegisState): boolean {
  s.idleT = 0;
  const was = s.fegis;
  s.fegis = false;
  return was;
}

/** Health a FEGIS car loses in `dt` seconds (a slow bleed: about half a minute to a minute to wreck it). */
export const fegisDrain = (maxHp: number, dt: number, derby: boolean): number => (maxHp * (derby ? FEGIS_DRAIN.derby : FEGIS_DRAIN.carnage) * dt) / 100;
