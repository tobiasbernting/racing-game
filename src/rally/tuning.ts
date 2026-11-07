// What a GarageCar does to the handling (body stats and tuning parts), the computer cars' cars, the
// damage rules, and the player's smoke colour.
import * as THREE from 'three';
import { CAR_BODIES, CAR_BODY_DEFS, PART_EFFECTS, defaultStyle, emptyParts, newCar, type CarBody, type CarDecal, type CarDriver, type CarSmoke, type CarStyle, type Feel, type GarageCar } from '../shared/rally.ts';
import { clamp } from './util.ts';

export interface Tune {
  /** Multipliers on the base car (car.ts). */
  power: number;
  grip: number;
  /** Added to the car's assist. */
  assist: number;
  brakeMul: number;
  /** Damage taken is multiplied by this (body toughness and armour). */
  dmgMul: number;
  size: number;
  /** Nitro charges for the race. */
  charges: number;
}

/**
 * The handling a car gets from its body and parts. `sameCars` levels everything but the looks: every
 * body drives like the plain hatchback with no parts (only the size stays) and gets one nitro.
 */
export function tuneFor(car: GarageCar, sameCars: boolean, nitro: boolean): Tune {
  const body = CAR_BODY_DEFS[car.body] ?? CAR_BODY_DEFS.hatch;
  const b = sameCars ? CAR_BODY_DEFS.hatch : body;
  const parts = sameCars ? emptyParts() : car.parts;
  const lvl = (k: keyof typeof parts): number => clamp(Math.round(parts[k] ?? 0), 0, 3);
  return {
    power: b.power * (1 + lvl('engine') * PART_EFFECTS.enginePower),
    grip: b.grip * (1 + lvl('tyres') * PART_EFFECTS.tyresGrip),
    assist: lvl('suspension') * PART_EFFECTS.suspensionAssist,
    brakeMul: 1 + lvl('brakes') * PART_EFFECTS.brakesForce,
    dmgMul: Math.max(0.2, 1 - lvl('armour') * PART_EFFECTS.armourShield) / b.tough,
    size: 1 + (body.size - 1) * 0.6,
    charges: nitro ? (sameCars ? 1 : lvl('turbo') * PART_EFFECTS.turboCharges) : 0,
  };
}

/** Damage 0..100 slows the car (never to a stop) and makes it slide a little more. */
export const damagePower = (d: number): number => 1 - 0.35 * clamp(d, 0, 100) / 100;
export const damageGrip = (d: number): number => 1 - 0.1 * clamp(d, 0, 100) / 100;

/** Bodies for the computer cars online (the same on every screen). */
const AI_BODIES: CarBody[] = ['hatch', 'buggy', 'pickup', 'coupe', 'hatch'];

/** Who the computer drivers get to drive, with weights: mostly cars, now and then something silly. */
const RIVAL_POOL: [CarBody, number][] = [
  ['hatch', 2],
  ['buggy', 1.2],
  ['pickup', 1.2],
  ['coupe', 1.2],
  ['atv', 1.2],
  ['moto', 1],
  ['moped', 1],
  ['tractor', 0.7],
  ['sofa', 0.5],
];

/** A deterministic 0..1 from a seed and a slot (no Math.random: the same race gives the same grid). */
export function seededUnit(seed: number, k: number): number {
  let h = Math.imul((seed | 0) ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** The body a computer car drives: from the race seed and its slot, in about four races out of ten something that is not a car. */
export function rivalBody(seed: number, k: number): CarBody {
  const total = RIVAL_POOL.reduce((a, [, w]) => a + w, 0);
  let x = seededUnit(seed, k) * total;
  for (const [b, w] of RIVAL_POOL) {
    x -= w;
    if (x < 0) return b;
  }
  return 'hatch';
}

/** What a computer car feels like on its body: the real mass and steering, but no crawling top speed (the rubber band does the rest). */
export function rivalFeel(body: CarBody): Feel {
  const f = CAR_BODY_DEFS[body].feel;
  return f.top > 0 ? { ...f, top: Math.max(34, f.top * 1.7) } : f;
}

const RIVAL_LIVERIES = ['stripe', 'none', 'checker', 'zigzag', 'stripes2', 'camo', 'flames', 'none'] as const;
const SPONSORS = ['grusolja', 'kaosbensin', 'dackdunder', 'skrotfix', 'mackens', 'surstark'] as const;
const RIVAL_TRIM = ['#f4f1ea', '#15171c', '#ffd23f', '#f4f1ea', '#e8e2d0', '#ff7a1a', '#15171c', '#f4f1ea'];

/** Every rival its own look: a livery, a trim colour and a different set of sponsors (from its slot). */
function rivalLook(k: number, paint: string): Pick<CarStyle, 'livery' | 'paint2' | 'decals' | 'finish'> {
  const dark = new THREE.Color(paint).getHSL({ h: 0, s: 0, l: 0 }).l < 0.35;
  const pick = (i: number): CarDecal => SPONSORS[(k * 2 + i * 3) % SPONSORS.length]!;
  return {
    livery: RIVAL_LIVERIES[k % RIVAL_LIVERIES.length]!,
    paint2: dark ? '#e8e2d0' : RIVAL_TRIM[k % RIVAL_TRIM.length]!,
    decals: { hood: pick(0), doors: pick(1), back: pick(2) },
    finish: k % 3 === 2 ? 'matte' : 'gloss',
  };
}

/** A computer car for the online grid and the remote screens: body, colour and number from its slot. */
export function aiCar(k: number, color: string, driver: CarDriver, body?: CarBody): GarageCar {
  const c = newCar(-1 - k, body ?? AI_BODIES[k % AI_BODIES.length] ?? 'hatch', '', color);
  c.style = { ...defaultStyle(color), number: k + 2, driver, ...rivalLook(k, color) };
  return c;
}

/** The arcade's own car: the red (or the player's colour) hatchback with number 1. */
export function arcadeCar(color: string): GarageCar {
  const c = newCar(0, 'hatch', '', color);
  c.style.number = 1;
  return c;
}

export const isBody = (s: unknown): s is CarBody => typeof s === 'string' && (CAR_BODIES as readonly string[]).includes(s);

const SMOKE: Record<CarSmoke, string> = {
  white: '#d9d6d0',
  rainbow: '#ffffff',
  hearts: '#ff8ac0',
  hay: '#e8c862',
  pink: '#ff9ad5',
  blue: '#7ab8ff',
  gold: '#ffd23f',
};

/** Tyre smoke in the player's colour (rainbow cycles through the hues). */
export function smokeColor(kind: CarSmoke | undefined, time: number, out: THREE.Color): THREE.Color {
  if (kind === 'rainbow') return out.setHSL((time * 0.35) % 1, 0.85, 0.7);
  return out.set(SMOKE[kind ?? 'white'] ?? SMOKE.white);
}
