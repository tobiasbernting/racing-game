// A model of how fast a car goes round a course, for the balance simulation and for sanity checks on the
// rivals' scaling. It was fitted to the real physics (src/rally/pace.test.ts runs the actual car and driver
// round real courses and checks this against them), so the simulation talks in lap times rather than dice.
import { RALLY_COURSE_DEFS, type CarBody, type RallyCourse } from './rally.ts';

/** The reference lap time (s) of a computer driver at full tilt in a plain car: about 0.89 of the gold-medal time. */
export const baseLap = (course: RallyCourse): number => RALLY_COURSE_DEFS[course].gold * 0.89;

/** Share off the lap time from the car: grip is what counts, power hardly (the tyres cannot use it). */
export const carGain = (grip: number, power: number): number => 1 - 0.28 * (grip - 1) - 0.02 * (power - 1);

/** The skill at which a computer driver gets the most out of a car with this grip (more grip, more courage pays). */
export const bestSkill = (grip: number): number => Math.min(1.08, 1 + 0.4 * (grip - 1));

/** The lap-time factor of a computer driver of this skill: cautious costs a little, overdriving costs more (spins). */
export function driverFactor(skill: number, grip: number): number {
  const s = bestSkill(grip);
  return 1 + 0.3 * Math.max(0, s - skill) + 1.2 * Math.max(0, skill - s);
}

/** What a human player's skill is worth as a lap-time factor, relative to a computer driver at full tilt. */
export const HUMAN_FACTOR = { poor: 1.1, average: 1.035, good: 0.975, expert: 0.945 } as const;
export type HumanSkill = keyof typeof HUMAN_FACTOR;

/** Seconds a nitro second saves, and a mini-turbo's worth per lap for a driver of this skill (s per lap). */
export const NITRO_SAVE = 0.5;
export const driftSaving = (human: number, driftRate: number): number => Math.max(0, (1.08 - human) * 10) * Math.min(2, Math.sqrt(driftRate));

/**
 * Lap time (s) of a computer rival. Sharper driving (the racing line, later braking: about 1.3 % at full sharpness
 * in the real physics) and a nitro modifier (about 1.2 %) shave a little more off.
 */
export const rivalLap = (course: RallyCourse, r: { skill: number; grip: number; power: number; sharp?: number; nitro?: number }): number =>
  baseLap(course) * carGain(r.grip, r.power) * driverFactor(r.skill, r.grip) * (1 - 0.013 * (r.sharp ?? 0)) * (1 - 0.012 * (r.nitro ?? 0));

/** Seconds per lap that trinkets with a speed hook give a player who uses them well, per copy (the hooks are capped in the game). */
export const HOOK_SAVE: Record<string, number> = { kaffekoppen: 0.45, sladdgradde: 0.35, myntturbo: 0.3, tvattbjorn: 0.25, kraftdryck: 0.15, efterklang: 0.1, rampgalning: 0.1 };

/**
 * Lap-time factor of every vehicle against the plain rally car (1), fitted to the real physics in src/rally/bodypace.test.ts
 * (the actual car and computer driver on four courses, the burst of the EPA tractor and the rocket of the cart used whenever ready).
 * Every vehicle is meant to be a real choice: all of them lie within about 3 % of the plain car, and each gets there its own way
 * (the heavy ones by torque and grip, the grass lovers off the road, the two-wheelers through the bends).
 */
export const BODY_LAP: Record<CarBody, number> = {
  hatch: 1.0,
  buggy: 0.979,
  pickup: 0.995,
  coupe: 1.003,
  monster: 0.999,
  atv: 0.976,
  moto: 0.999,
  moped: 0.985,
  tractor: 1.037,
  sofa: 0.992,
  epa: 0.987,
  icecream: 0.993,
  garbage: 1.03,
  snowmobile: 0.985,
  kart: 0.989,
  golf: 0.972,
  mower: 0.976,
  camper: 1.042,
  limo: 1,
  cart: 0.992,
};
