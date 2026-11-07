// The numbers of a crash: how much a hit hurts, how much health a car has, who gets the credit for a wreck.
// Plain maths so it can be tested without a race. Used for health in Blodbad (and for the contact damage in
// Blandat, which has no health bars but takes the same hits more lightly).

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export const BASE_HP = 100;
/** Seconds a wrecked car is out, and the share of its health it comes back with. */
export const WRECK_SECONDS = 3;
export const RESPAWN_HP = 0.7;
/** A hit this big (health points) can earn a takedown for whoever made it, if the victim is wrecked within the window. */
export const BIG_HIT = 5;
export const TAKEDOWN_WINDOW = 2;
/** A speed change below this (m/s) hurts nobody: scraping and nudging. */
export const HIT_MIN_DV = 2.2;
const DAMAGE_K = 2.4;
/** The most one hit can take. */
export const HIT_MAX = 45;

/** Health a car starts with: heavier bodies take more, then the rival's own multiplier. */
export const maxHpOf = (mass: number, hpMul = 1): number => Math.round(BASE_HP * clamp(0.7 + 0.3 * Math.sqrt(Math.max(0.1, mass)), 0.8, 1.5) * hpMul);

export interface ImpactIn {
  /** How much this car's speed changed in the hit (m/s): lighter cars change more. */
  dv: number;
  /** 0..1: how much of the hit was the other car's doing (it drove into you, not you into it). */
  blame: number;
  /** The other car's ram power (1 = a plain bumper). */
  ram: number;
  /** This car's damage taken multiplier (armour and toughness). */
  dmgTaken: number;
}

/** Health points one car loses in a hit. Faster, heavier and more rammy attackers hurt more; whoever rams hurts itself less. */
export function impactDamage(i: ImpactIn): number {
  const over = i.dv - HIT_MIN_DV;
  if (over <= 0) return 0;
  return Math.min(HIT_MAX, DAMAGE_K * over * (0.35 + 0.65 * clamp(i.blame, 0, 1)) * Math.max(0.3, i.ram) * Math.max(0.1, i.dmgTaken));
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
  const dmg = impactDamage({ dv: j / o.massVic, blame: 1, ram: o.ram, dmgTaken: o.dmgTaken });
  return dmg <= 0 ? Infinity : Math.ceil(o.hp / dmg);
}
