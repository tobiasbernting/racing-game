// The gearbox: pure numbers and rules, no physics. Every vehicle has its own box (how many gears, how fast each one
// goes before the revs run out). car.ts uses it for the revs, the shifting (by itself in Automat, on the shift buttons
// in Manuell) and for what the engine can push with at those revs. There is no clutch pedal: the clutch is automatic.
import type { CarBody } from '../shared/rally.ts';

/** Revs (rpm) at the redline and at idle. Every engine uses the same scale; the sound gives each its character. */
export const REDLINE = 7000;
export const IDLE = 900;

export interface GearBox {
  /** Speed (m/s) at the redline in each forward gear: the ratios. */
  v: readonly number[];
  /** How long a shift takes with the engine cut (s). */
  shiftTime: number;
}

const box = (v: number[], shiftTime: number): GearBox => ({ v, shiftTime });

/** The gearbox of each body. Cars: five gears; the bike: six quick ones; the moped: three screaming ones; the tractor: six slow ones. */
export const GEARBOXES: Record<CarBody, GearBox> = {
  hatch: box([15, 27, 38, 50, 64], 0.17),
  buggy: box([15, 27, 38, 50, 64], 0.15),
  pickup: box([15, 27, 38, 50, 64], 0.18),
  coupe: box([16, 28, 40, 53, 68], 0.14),
  monster: box([14, 25, 36, 48, 62], 0.2),
  atv: box([13, 23, 33, 44, 58], 0.15),
  moto: box([16, 26, 36, 47, 59, 75], 0.08),
  moped: box([13, 24, 37, 53], 0.13),
  tractor: box([9, 16, 24, 33, 43, 54], 0.26),
  sofa: box([15, 27, 38, 50, 64], 0.2),
  // phase 10: the EPA tractor has five slow gears and a long top one for the burst
  epa: box([9, 16, 24, 36, 54], 0.22),
  // the ice-cream van: four lazy gears
  icecream: box([12, 22, 34, 48], 0.25),
  // the garbage truck: six heavy gears
  garbage: box([8, 15, 23, 32, 42, 54], 0.26),
  // the snowmobile: a belt drive that changes three times, very quickly
  snowmobile: box([18, 34, 56], 0.06),
  // the kart: four close, instant gears
  kart: box([15, 27, 40, 54], 0.05),
  // the golf cart: an electric motor with three smooth steps
  golf: box([11, 20, 33, 53], 0.1),
  // the mower: four small gears with a long last one for the grass
  mower: box([10, 18, 29, 41, 52], 0.16),
  // the camper: five slow, clunky gears
  camper: box([11, 21, 32, 43, 54], 0.28),
  // the limousine: five smooth gears for the long straights
  limo: box([16, 29, 42, 56, 72], 0.18),
  // the shopping cart with a rocket: one gear, and the rocket
  cart: box([58], 0.1),
};

export const gearboxOf = (body: CarBody): GearBox => GEARBOXES[body] ?? GEARBOXES.hatch;

/** Share of the redline at which an automatic box changes up, and below which it changes down. */
export const AUTO_UP = 0.94;
export const AUTO_DOWN = 0.47;

/** The perfect-shift window: shifting up with the revs in here (just under the limiter) gives a little kick. */
export const PERFECT_LO = 0.9;
export const PERFECT_HI = 0.985;
/** Seconds the kick lasts, and how much extra push it starts with. */
export const PERFECT_TIME = 1.1;
export const PERFECT_PUSH = 0.16;
/** The shift light: green from here, amber from here, red from the perfect window. */
export const LIGHT_GREEN = 0.72;
export const LIGHT_AMBER = 0.84;

/** The revs (rpm) the wheels ask for in this gear at this speed (m/s). */
export function wheelRpm(b: GearBox, gear: number, speed: number): number {
  const v = b.v[Math.max(1, Math.min(b.v.length, gear)) - 1]!;
  return (Math.abs(speed) / v) * REDLINE;
}

/** The same as a share of the redline. */
export const wheelFrac = (b: GearBox, gear: number, speed: number): number => wheelRpm(b, gear, speed) / REDLINE;

/** The revs the clutch lets the engine run at from a standstill, added to idle by the throttle: a low gear launches, a high one lugs. */
const LAUNCH = [4000, 2100, 1300, 800, 400, 300, 300, 300];
export const launchRpm = (gear: number): number => LAUNCH[Math.min(LAUNCH.length, Math.max(1, gear)) - 1]!;

/** The engine's push at these revs (share of the redline): a lugging engine bogs down, the middle and the top are flat. 0.3 … 1. */
export function torqueK(frac: number): number {
  if (frac >= 0.4) return 1;
  if (frac <= 0.12) return 0.3;
  return 0.3 + (0.7 * (frac - 0.12)) / 0.28;
}

/**
 * How hard the engine pushes: the revs are whatever the wheels ask for, or what the slipping clutch allows at that
 * throttle if that is higher. First gear never bogs (it is the launch gear).
 */
export function pushK(b: GearBox, gear: number, speed: number, throttle: number): number {
  if (gear <= 1) return 1;
  const eff = Math.max(wheelFrac(b, gear, speed), (IDLE + throttle * launchRpm(gear)) / REDLINE);
  return torqueK(eff);
}

/** Does shifting up with the revs at this share of the redline land in the perfect window? */
export const isPerfect = (frac: number): boolean => frac >= PERFECT_LO && frac <= PERFECT_HI;

/** The gear an automatic box wants (the same rules for the rivals and for the player in Automat). */
export function autoGear(b: GearBox, gear: number, speed: number): number {
  const top = b.v.length;
  if (gear < top && wheelFrac(b, gear, speed) > AUTO_UP) return gear + 1;
  if (gear > 1 && wheelFrac(b, gear, speed) < AUTO_DOWN && wheelFrac(b, gear - 1, speed) < 0.9) return gear - 1;
  return gear;
}

/** Is a downshift into this gear allowed at this speed? The auto-clutch refuses one that would over-rev the engine. */
export const canDownshift = (b: GearBox, gear: number, speed: number): boolean => gear > 1 && wheelFrac(b, gear - 1, speed) < 1.08;

/** What the shift light shows at these revs: 0 off, 1 green, 2 amber, 3 red (the perfect window and up). */
export function shiftLight(frac: number, gear: number, b: GearBox): 0 | 1 | 2 | 3 {
  if (gear >= b.v.length) return frac > LIGHT_GREEN ? 1 : 0;
  if (frac >= PERFECT_LO) return 3;
  if (frac >= LIGHT_AMBER) return 2;
  if (frac >= LIGHT_GREEN) return 1;
  return 0;
}
