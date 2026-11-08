// Galna Rallyt: the cars, courses and races. Pure data, types and formulas, no I/O.
//
// A car (GarageCar) has a body, tuning parts, a style (paint, livery, decals, wheels, spoiler, extras…)
// and damage 0..100. Prizes come from `racePrize`.

import { isRaceKind, type RaceKind } from './kinds.ts';
import { isArenaId, type ArenaId } from './derby.ts';

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

export const CAR_BODIES = [
  'hatch', 'buggy', 'pickup', 'coupe', 'monster', 'atv', 'moto', 'moped', 'tractor', 'sofa',
  // phase 10: ten more, each its own figure
  'epa', 'icecream', 'garbage', 'snowmobile', 'kart', 'golf', 'mower', 'camper', 'limo', 'cart',
] as const;
export type CarBody = (typeof CAR_BODIES)[number];
export const isCarBody = (s: unknown): s is CarBody => typeof s === 'string' && (CAR_BODIES as readonly string[]).includes(s);

export interface CarBodyDef {
  id: CarBody;
  /** kr; the first body is the free starter car. */
  price: number;
  /** Multipliers on the base car in car.ts (1 = the old rally car). */
  power: number;
  grip: number;
  /** Damage resistance: damage taken is divided by this. */
  tough: number;
  /** Bigger bodies feel heavier (the model and the camera use it too). */
  size: number;
  /** How it drives in car.ts (see `feel`: the cars all share the plain feel). */
  feel: Feel;
}

/** The driving feel of a body in car.ts. Every number is a multiplier on the plain rally car (1) unless it says. */
export interface Feel {
  /** Collision mass: a heavy body shoves light ones aside. */
  mass: number;
  /** Steering angle and rate. */
  steer: number;
  /** Yaw inertia: below 1 the body turns on a dime (and twitches), above 1 it is lazy. */
  yaw: number;
  /** Top speed in m/s (0 = whatever the engine and the drag allow). */
  top: number;
  /** Rolling resistance and grip on grass, sand and snow: above 1 it loves the rough. */
  rough: number;
  /** Landings and bumps hurt by this much. */
  landing: number;
  /** Rolling resistance on grass, sand and snow, as a multiplier (below 1 the rough does not slow it: the buggy). */
  roll: number;
  /** Banana peels and hay bales: 1 spins you fully, below 1 you barely notice. */
  slip: number;
  /** How far the body leans into bends (1 = a motorbike), as the visual roll of the whole vehicle. */
  lean: number;
  /** The engine's shove (the cap on the driving force) and the air drag, as multipliers. */
  punch: number;
  drag: number;
  /** Two wheels (a falling-over kind of vehicle). */
  two: boolean;
  /** Half width and half length for fences and bumping (metres, before size). */
  halfW: number;
  halfL: number;
  /** Radius of the two bump circles (metres, before size) and how far from the middle they sit. */
  bumpR: number;
  bumpAt: number;
  /** 0..1: how much snow, ice and sand grip like tarmac (the snowmobile: 1). */
  loose: number;
  /** Multiplier on the top speed on grass, and the grass hardly slows it (the mower). */
  grass: number;
  /** 0..1: once the rear steps out it keeps sliding (the limousine's long slides). */
  slide: number;
}

const CAR_FEEL: Feel = { mass: 1, steer: 1, yaw: 1, top: 0, rough: 1, landing: 1, roll: 1, slip: 1, lean: 0, punch: 1, drag: 1, two: false, halfW: 0.95, halfL: 1.05, bumpR: 1.0, bumpAt: 1.05, loose: 0, grass: 1, slide: 0 };
const feel = (o: Partial<Feel>): Feel => ({ ...CAR_FEEL, ...o });

export const CAR_BODY_DEFS: Record<CarBody, CarBodyDef> = {
  hatch: { id: 'hatch', price: 0, power: 1.0, grip: 1.0, tough: 1.0, size: 1.0, feel: feel({}) },
  // the sandbuggy: sand and grass do not slow it down (its passive)
  buggy: { id: 'buggy', price: 900, power: 0.95, grip: 1.0, tough: 0.9, size: 0.95, feel: feel({ rough: 1.5, roll: 0.25 }) },
  pickup: { id: 'pickup', price: 1500, power: 1.05, grip: 1.02, tough: 1.3, size: 1.1, feel: feel({ mass: 1.4, yaw: 1.1 }) },
  // the sportbil: slips through the air (its passive: a higher top speed)
  coupe: { id: 'coupe', price: 2500, power: 1.0, grip: 1.0, tough: 0.85, size: 1.0, feel: feel({ drag: 0.92 }) },
  monster: { id: 'monster', price: 4000, power: 1.1, grip: 0.98, tough: 1.5, size: 1.3, feel: feel({ mass: 2.2, yaw: 1.2, landing: 0.6, rough: 1.25 }) },
  // the fyrhjuling: light and twitchy, loves the rough and the jumps
  atv: { id: 'atv', price: 1800, power: 1.0, grip: 0.97, tough: 0.9, size: 0.9, feel: feel({ mass: 0.6, steer: 1.3, yaw: 0.6, rough: 1.6, landing: 0.5, lean: 0.25, halfW: 0.7, halfL: 0.95, bumpR: 0.75, bumpAt: 0.85 }) },
  // the motorcykel: very quick in a straight line, leans into bends and has less grip
  moto: { id: 'moto', price: 3200, power: 1.05, grip: 0.97, tough: 0.7, size: 0.9, feel: feel({ mass: 0.45, steer: 1.15, yaw: 0.75, lean: 1, punch: 1.2, drag: 1.0, two: true, landing: 1.2, halfW: 0.4, halfL: 0.95, bumpR: 0.5, bumpAt: 0.8 }) },
  // the moppe: slow, super nimble and a bit silly
  moped: { id: 'moped', price: 600, power: 0.95, grip: 1.0, tough: 1.0, size: 0.85, feel: feel({ mass: 0.5, steer: 1.45, yaw: 0.5, top: 49, lean: 0.7, punch: 1.0, drag: 0.9, two: true, slip: 0.5, halfW: 0.38, halfL: 0.85, bumpR: 0.48, bumpAt: 0.7 }) },
  // the traktor: slow, heavy and unstoppable
  tractor: { id: 'tractor', price: 2200, power: 1.2, grip: 0.9, tough: 2.2, size: 1.2, feel: feel({ mass: 3.6, steer: 0.9, yaw: 1.5, top: 50, rough: 1.5, punch: 1.4, landing: 0.4, slip: 0.2, halfW: 1.25, halfL: 1.5, bumpR: 1.25, bumpAt: 1.1 }) },
  // the soffbil: a sofa on wheels. Average stats, maximum silliness
  sofa: { id: 'sofa', price: 5000, power: 1.0, grip: 1.03, tough: 1.0, size: 1.05, feel: feel({ mass: 1.1, steer: 0.95, yaw: 1.1, lean: 0.3, halfW: 1.0, halfL: 1.05 }) },
  // the EPA-traktor: an old car made into a slow A-tractor. A speed limiter (30 on the sign), but nothing slows it down
  epa: { id: 'epa', price: 700, power: 1.0, grip: 0.97, tough: 1.2, size: 1.0, feel: feel({ grass: 1.12, mass: 1.4, steer: 1.0, yaw: 1.1, top: 49, rough: 1.6, roll: 0.1, slip: 0.15, punch: 1.3, landing: 0.7, halfW: 0.95, halfL: 1.15, bumpR: 1.0, bumpAt: 1.1 }) },
  // the glassbil: a boxy ice-cream van, wobbly and a bit slow
  icecream: { id: 'icecream', price: 2400, power: 1.05, grip: 1.05, tough: 1.2, size: 1.15, feel: feel({ mass: 1.5, steer: 0.95, yaw: 1.25, punch: 1.0, drag: 1.1, landing: 0.8, halfW: 1.05, halfL: 1.75, bumpR: 1.05, bumpAt: 1.3 }) },
  // the sopbil: a garbage truck. Heavy, tough and slow to turn
  garbage: { id: 'garbage', price: 3000, power: 1.2, grip: 0.95, tough: 1.8, size: 1.3, feel: feel({ mass: 3.0, steer: 0.85, yaw: 1.5, top: 50, rough: 1.1, punch: 1.35, drag: 1.1, slip: 0.4, landing: 0.5, halfW: 1.2, halfL: 2.0, bumpR: 1.2, bumpAt: 1.5 }) },
  // the snöskoter: grips on snow, ice and sand like tarmac, a bit nervous on the road itself
  snowmobile: { id: 'snowmobile', price: 2600, power: 1.1, grip: 0.92, tough: 0.8, size: 0.95, feel: feel({ mass: 0.7, steer: 1.2, yaw: 0.75, lean: 0.35, punch: 1.1, drag: 1.08, rough: 1.2, landing: 0.9, loose: 1, halfW: 0.6, halfL: 1.25, bumpR: 0.65, bumpAt: 0.9 }) },
  // the gokart: tiny, glued to the road and the best handling there is, but every bump hurts
  kart: { id: 'kart', price: 3500, power: 0.75, grip: 1.3, tough: 1.2, size: 0.75, feel: feel({ mass: 0.8, steer: 1.4, yaw: 0.55, top: 50, drag: 0.8, rough: 0.6, landing: 1.6, lean: 0.15, halfW: 0.55, halfL: 0.9, bumpR: 0.6, bumpAt: 0.55 }) },
  // the golfbil: slow, light, quiet and happy on the grass
  golf: { id: 'golf', price: 1200, power: 0.95, grip: 1.02, tough: 0.8, size: 0.9, feel: feel({ mass: 0.9, steer: 1.15, yaw: 0.85, top: 49, rough: 1.3, roll: 0.5, punch: 1.1, landing: 0.9, halfW: 0.8, halfL: 1.25, bumpR: 0.8, bumpAt: 0.8 }) },
  // the åkgräsklippare: a ride-on mower, much faster on grass than on the road
  mower: { id: 'mower', price: 1000, power: 1.15, grip: 0.98, tough: 0.9, size: 0.9, feel: feel({ mass: 0.8, steer: 1.25, yaw: 0.8, top: 48, rough: 1.4, roll: 0.08, grass: 1.4, punch: 1.1, landing: 0.9, halfW: 0.8, halfL: 1.15, bumpR: 0.8, bumpAt: 0.75 }) },
  // the husbil: a camper van, big and slow
  camper: { id: 'camper', price: 3800, power: 1.2, grip: 0.92, tough: 1.7, size: 1.35, feel: feel({ mass: 3.2, steer: 0.9, yaw: 1.6, top: 50, rough: 1.1, punch: 1.3, drag: 1.2, slip: 0.5, landing: 0.5, halfW: 1.25, halfL: 2.3, bumpR: 1.25, bumpAt: 1.7 }) },
  // the limousin: long and fast on the straights, hopeless in a tight bend, and once it slides it keeps sliding
  limo: { id: 'limo', price: 4500, power: 1.2, grip: 1.08, tough: 1.0, size: 1.2, feel: feel({ mass: 1.8, steer: 1.0, yaw: 1.2, punch: 1.3, drag: 0.97, slide: 1, landing: 0.9, halfW: 1.0, halfL: 3.0, bumpR: 1.0, bumpAt: 2.0 }) },
  // the kundvagn med raketmotor: light, twitchy and wobbly; the rocket does the rest
  cart: { id: 'cart', price: 4200, power: 0.95, grip: 0.97, tough: 1.1, size: 0.8, feel: feel({ mass: 0.6, steer: 1.3, yaw: 0.6, top: 52, drag: 0.95, landing: 1.3, punch: 1.0, halfW: 0.55, halfL: 0.85, bumpR: 0.6, bumpAt: 0.5 }) },
};

// ---------------------------------------------------------------------------
// Tuning parts (level 0..3 each)
// ---------------------------------------------------------------------------

export const CAR_PARTS = ['engine', 'tyres', 'suspension', 'brakes', 'turbo', 'armour'] as const;
export type CarPart = (typeof CAR_PARTS)[number];
export const isCarPart = (s: unknown): s is CarPart => typeof s === 'string' && (CAR_PARTS as readonly string[]).includes(s);
export const PART_MAX_LEVEL = 3;

/** kr for level 1, 2 and 3 of each part. */
export const PART_PRICES: Record<CarPart, [number, number, number]> = {
  engine: [200, 500, 1100],
  tyres: [150, 400, 900],
  suspension: [150, 400, 900],
  brakes: [100, 300, 700],
  turbo: [250, 600, 1200],
  armour: [150, 400, 900],
};

/** What the parts do to the car in car.ts, per level (the game multiplies/adds these). */
export const PART_EFFECTS = {
  /** power × (1 + level·this) */
  enginePower: 0.1,
  /** grip × (1 + level·this) */
  tyresGrip: 0.06,
  /** assist and slide-catching + level·this; landings softer */
  suspensionAssist: 0.08,
  /** brake force × (1 + level·this) */
  brakesForce: 0.12,
  /** nitro charges per race = level (0 none); each charge is NITRO_SECONDS of boost */
  turboCharges: 1,
  /** damage taken × (1 − level·this) */
  armourShield: 0.15,
} as const;
export const NITRO_SECONDS = 2.2;

// ---------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------

/** Paints a kid can pick (hex). */
export const CAR_PAINTS = [
  '#e8412c', '#ff8a1f', '#f4c20d', '#8bc34a', '#2fa84f', '#18b7c9', '#2f6fe0', '#1f3a93',
  '#8a4fd8', '#d63aa5', '#f06ba8', '#ffb6c1', '#8c5a3c', '#5d4a32', '#f2f2f2', '#c9c9c9',
  '#6b7280', '#16161a', '#b8860b', '#00ced1', '#ff4500', '#7fff00', '#ffd700', '#e6e6fa',
] as const;

export const CAR_FINISHES = ['gloss', 'matte', 'metallic'] as const;
export type CarFinish = (typeof CAR_FINISHES)[number];

export const CAR_LIVERIES = ['none', 'stripe', 'stripes2', 'flames', 'checker', 'dots', 'zigzag', 'stars', 'hearts', 'camo', 'lightning', 'rainbow'] as const;
export type CarLivery = (typeof CAR_LIVERIES)[number];

/** Stickers. `number` paints the car's number in a roundel; the made-up sponsors (Grusolja, Kaosbensin…) are the default look. */
export const CAR_DECALS = ['number', 'grusolja', 'kaosbensin', 'dackdunder', 'skrotfix', 'mackens', 'surstark', 'star', 'heart', 'flame', 'lightning', 'flower', 'rainbow', 'paw', 'cow', 'hen', 'pig', 'sheep', 'crown', 'smiley', 'flag', 'strawberry'] as const;
export type CarDecal = (typeof CAR_DECALS)[number];
/** Where a sticker can go; `doors` is mirrored on both sides. */
export const DECAL_SLOTS = ['hood', 'roof', 'doors', 'back'] as const;
export type DecalSlot = (typeof DECAL_SLOTS)[number];

export const CAR_WHEELS = ['steel', 'sport', 'offroad', 'star', 'gold'] as const;
export type CarWheels = (typeof CAR_WHEELS)[number];

export const CAR_SPOILERS = ['none', 'small', 'big', 'wing'] as const;
export type CarSpoiler = (typeof CAR_SPOILERS)[number];

/** Bolt-on extras (any number of them). */
export const CAR_EXTRAS = ['roofrack', 'lightbar', 'flag', 'bullbar', 'exhaust2', 'antenna', 'sideskirts', 'snorkel', 'antlers', 'ears', 'horsetail'] as const;
export type CarExtra = (typeof CAR_EXTRAS)[number];

export const CAR_HORNS = ['beep', 'tune', 'cow', 'duck', 'train', 'honk'] as const;
export type CarHorn = (typeof CAR_HORNS)[number];

/** Who sits behind the wheel: always a person in a helmet and race overalls (older saves had animals; they read as this). */
export const CAR_DRIVERS = ['human'] as const;
export type CarDriver = (typeof CAR_DRIVERS)[number];

/** The designs a helmet can wear on top of its colours (the picture of each is drawn in models.ts and ui/helmet.ts). */
export const HELMET_DESIGNS = ['stripe', 'twin', 'checker', 'star', 'flame', 'dots', 'bolt', 'wing'] as const;
export type HelmetDesign = (typeof HELMET_DESIGNS)[number];
/** A helmet only a boss wears (the joker's long ears). */
export type HelmetLook = HelmetDesign | 'ears';
export const isHelmetDesign = (v: unknown): v is HelmetDesign => typeof v === 'string' && (HELMET_DESIGNS as readonly string[]).includes(v);
export const HELMET_NAMES: Record<HelmetDesign, string> = { stripe: 'Rand', twin: 'Dubbelrand', checker: 'Rutor', star: 'Stjärna', flame: 'Lågor', dots: 'Prickar', bolt: 'Blixt', wing: 'Vingar' };

/** Tyre smoke and boost flame colour. */
export const CAR_SMOKES = ['white', 'rainbow', 'hearts', 'hay', 'pink', 'blue', 'gold'] as const;
export type CarSmoke = (typeof CAR_SMOKES)[number];

export interface CarStyle {
  paint: string;
  /** Secondary colour (liveries, spoiler, rims where it fits). */
  paint2: string;
  finish: CarFinish;
  livery: CarLivery;
  decals: Partial<Record<DecalSlot, CarDecal>>;
  /** 1..99, shown by the `number` decal and on the plate. */
  number: number;
  wheels: CarWheels;
  rimColor: string;
  spoiler: CarSpoiler;
  extras: CarExtra[];
  horn: CarHorn;
  /** Underglow colour, shown at night and in tunnels; null for none. */
  glow: string | null;
  driver: CarDriver;
  /** The pattern on the driver's helmet, and its colour ('' = the car's own paint). */
  helmet: HelmetLook;
  helmetColor: string;
  smoke: CarSmoke;
  /** Text on the number plate (≤ 8 characters, cleaned like chat). */
  plate: string;
}

/** kr for each kind of change in the garage (paint is cheap so kids can play with it). */
export const STYLE_PRICES = {
  paint: 20,
  paint2: 20,
  finish: 40,
  livery: 50,
  decal: 15,
  number: 0,
  wheels: 120,
  rimColor: 20,
  spoiler: 150,
  extra: 100,
  horn: 40,
  glow: 150,
  driver: 0,
  smoke: 60,
  plate: 0,
} as const;

export const PLATE_MAX = 8;

export function defaultStyle(paint = '#e8412c'): CarStyle {
  return {
    paint,
    paint2: '#f2f2f2',
    finish: 'gloss',
    livery: 'none',
    decals: { hood: 'dackdunder', doors: 'grusolja', back: 'kaosbensin' },
    number: 7,
    wheels: 'steel',
    rimColor: '#c9c9c9',
    spoiler: 'none',
    extras: [],
    horn: 'beep',
    glow: null,
    driver: 'human',
    helmet: 'stripe',
    helmetColor: '',
    smoke: 'white',
    plate: '',
  };
}

// ---------------------------------------------------------------------------
// The garage on a player
// ---------------------------------------------------------------------------

export interface GarageCar {
  id: number;
  body: CarBody;
  /** The car's name (≤ 16 characters). */
  name: string;
  parts: Record<CarPart, number>;
  style: CarStyle;
  /** 0 (shiny) .. 100 (a wreck that still drives, slowly). */
  damage: number;
  races: number;
  wins: number;
}

export const MAX_CARS = 6;
export const CAR_NAME_MAX = 16;

export const emptyParts = (): Record<CarPart, number> => ({ engine: 0, tyres: 0, suspension: 0, brakes: 0, turbo: 0, armour: 0 });

export function newCar(id: number, body: CarBody, name: string, paint?: string): GarageCar {
  return { id, body, name, parts: emptyParts(), style: defaultStyle(paint), damage: 0, races: 0, wins: 0 };
}

/** What the car is worth (body + parts), for the repair bill and the sell price. */
export function carValue(car: GarageCar): number {
  let v = CAR_BODY_DEFS[car.body].price;
  for (const p of CAR_PARTS) for (let l = 0; l < (car.parts[p] ?? 0); l++) v += PART_PRICES[p][l]!;
  return v;
}

/** Selling a car gives half its value (never the last car). */
export const sellPrice = (car: GarageCar): number => Math.round(carValue(car) / 2);

/** The repair bill: about a tenth of a win for a scratched car, never more than REPAIR_MAX. */
export const REPAIR_MAX = 400;
export function repairCost(car: GarageCar): number {
  if (car.damage <= 0) return 0;
  const full = 120 + carValue(car) * 0.07;
  return Math.max(10, Math.min(REPAIR_MAX, Math.round((car.damage / 100) * full)));
}
/** Damage mends by itself a little every morning, so a broke kid can still race. */
export const DAMAGE_HEAL_PER_DAY = 15;

/** Driving stats as 1..5 stars for the garage (no numbers for the kids). */
export function carStars(car: GarageCar): { speed: number; grip: number; handling: number; tough: number } {
  const b = CAR_BODY_DEFS[car.body];
  const st = (x: number): number => Math.max(1, Math.min(5, Math.round(x)));
  return {
    speed: st((b.power - 0.85) * 8 + car.parts.engine * 0.7 + car.parts.turbo * 0.4),
    grip: st((b.grip - 0.85) * 8 + car.parts.tyres * 0.9),
    handling: st(1.5 + car.parts.suspension * 0.8 + car.parts.brakes * 0.5),
    tough: st((b.tough - 0.8) * 4 + car.parts.armour * 0.8),
  };
}

// ---------------------------------------------------------------------------
// Courses and rules
// ---------------------------------------------------------------------------

export const RALLY_COURSES = ['farm', 'forest', 'ice', 'beach', 'city', 'meadow', 'mountain', 'desert', 'volcano', 'candy', 'moon', 'kitchen'] as const;
export type RallyCourse = (typeof RALLY_COURSES)[number];
export const isRallyCourse = (s: unknown): s is RallyCourse => typeof s === 'string' && (RALLY_COURSES as readonly string[]).includes(s);

export interface RallyCourseDef {
  id: RallyCourse;
  /** Prize multiplier (longer, harder courses pay more). */
  prize: number;
  /** The surface that dominates (for the card and the tyres tip). */
  surface: 'asphalt' | 'gravel' | 'snow' | 'sand';
  /** Target lap time (s) for a gold medal at 1 lap; silver ×1.15, bronze ×1.35. */
  gold: number;
  emoji: string;
  color: string;
}

export const RALLY_COURSE_DEFS: Record<RallyCourse, RallyCourseDef> = {
  farm: { id: 'farm', prize: 1.0, surface: 'asphalt', gold: 62, emoji: '🚜', color: '#e8412c' },
  forest: { id: 'forest', prize: 1.15, surface: 'gravel', gold: 54, emoji: '🌲', color: '#2fa84f' },
  ice: { id: 'ice', prize: 1.25, surface: 'snow', gold: 57, emoji: '❄️', color: '#5fb7ff' },
  beach: { id: 'beach', prize: 1.1, surface: 'sand', gold: 60, emoji: '🏖️', color: '#f4c20d' },
  city: { id: 'city', prize: 1.3, surface: 'asphalt', gold: 55, emoji: '🌃', color: '#8a4fd8' },
  meadow: { id: 'meadow', prize: 1.05, surface: 'gravel', gold: 48, emoji: '🌼', color: '#9bc53d' },
  mountain: { id: 'mountain', prize: 1.25, surface: 'snow', gold: 59, emoji: '🏔️', color: '#4a6fa5' },
  desert: { id: 'desert', prize: 1.3, surface: 'sand', gold: 66, emoji: '🏜️', color: '#e8a33a' },
  volcano: { id: 'volcano', prize: 1.4, surface: 'gravel', gold: 68, emoji: '🌋', color: '#e8501c' },
  candy: { id: 'candy', prize: 1.45, surface: 'asphalt', gold: 56, emoji: '🍭', color: '#f06ba8' },
  moon: { id: 'moon', prize: 1.5, surface: 'asphalt', gold: 61, emoji: '🌙', color: '#9aa3b8' },
  kitchen: { id: 'kitchen', prize: 1.45, surface: 'asphalt', gold: 66, emoji: '🥣', color: '#7fc8e8' },
};

/** The courses of the wild (act 2) and the crazy (act 3) kind; the countryside ones are the rest. */
export const WILD_COURSES: readonly RallyCourse[] = ['desert', 'volcano'];
export const CRAZY_COURSES: readonly RallyCourse[] = ['candy', 'moon', 'kitchen'];

export const RALLY_TIMES = ['day', 'sunset', 'night'] as const;
export type RallyTime = (typeof RALLY_TIMES)[number];
export const RALLY_WEATHERS = ['clear', 'rain'] as const;
export type RallyWeather = (typeof RALLY_WEATHERS)[number];
export const RALLY_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type RallyDifficulty = (typeof RALLY_DIFFICULTIES)[number];

export interface RaceRules {
  course: RallyCourse;
  /** 1..5 */
  laps: number;
  /** Cars take damage from fences and each other. */
  damage: boolean;
  /** Computer-driven farm animals filling the grid: 0..5. */
  ai: number;
  difficulty: RallyDifficulty;
  time: RallyTime;
  weather: RallyWeather;
  /** Nitro charges from the turbo part may be used. */
  nitro: boolean;
  /** Everyone drives the same stats (styling still shows): a fair family race. */
  sameCars: boolean;
  /** Boost pads and mud puddles on the road. */
  pickups: boolean;
  /** Rally, Blandat or Blodbad (see kinds.ts). */
  kind: RaceKind;
  /** A Rivningsderby in this arena (see derby.ts): no laps, the last car running wins. Always with kind Blodbad. */
  arena?: ArenaId;
}

export const MAX_LAPS = 5;
export const MAX_AI = 5;
/** Humans in one race (plus AI, never more than 8 cars). */
export const MAX_RACERS = 6;
export const MAX_CARS_ON_TRACK = 8;

export function defaultRules(): RaceRules {
  return { course: 'farm', laps: 3, damage: false, ai: 3, difficulty: 'normal', time: 'day', weather: 'clear', nitro: true, sameCars: false, pickups: true, kind: 'rally' };
}

/** Cleans anything a client sent into valid rules. */
export function cleanRules(r: unknown): RaceRules {
  const d = defaultRules();
  if (!r || typeof r !== 'object') return d;
  const o = r as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : def);
  const int = (v: unknown, lo: number, hi: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : def);
  return {
    course: pick(o.course, RALLY_COURSES, d.course),
    laps: int(o.laps, 1, MAX_LAPS, d.laps),
    damage: o.damage === true,
    ai: int(o.ai, 0, MAX_AI, d.ai),
    difficulty: pick(o.difficulty, RALLY_DIFFICULTIES, d.difficulty),
    time: pick(o.time, RALLY_TIMES, d.time),
    weather: pick(o.weather, RALLY_WEATHERS, d.weather),
    nitro: o.nitro !== false,
    sameCars: o.sameCars === true,
    pickups: o.pickups !== false,
    kind: isRaceKind(o.kind) ? o.kind : 'rally',
    ...(isArenaId(o.arena) ? { arena: o.arena, kind: 'carnage' as const } : {}),
  };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * kr for finishing a race in `place` of `n` cars (humans and AI). Everyone who finishes gets something.
 * Alone on the track (a time trial, or a race with nobody else) pays like a practice run.
 */
export function racePrize(rules: RaceRules, place: number, n: number): number {
  const byPlace = [160, 112, 80, 56, 40, 32, 28, 24];
  const base = n <= 1 ? 50 : byPlace[Math.max(0, Math.min(byPlace.length - 1, place - 1))]!;
  const laps = Math.max(0.6, Math.min(1.6, rules.laps / 3));
  const diff = rules.difficulty === 'easy' ? 0.8 : rules.difficulty === 'hard' ? 1.25 : 1;
  const dmg = rules.damage ? 1.25 : 1;
  const field = 0.85 + Math.min(8, n) * 0.03;
  return Math.round(base * laps * diff * dmg * field * RALLY_COURSE_DEFS[rules.course].prize) + 10;
}

/** kr for not finishing (left early, timed out): a little for taking part. */
export const RACE_DNF_PRIZE = 10;

/** Medal for a total time over `laps` laps, or null. */
export function raceMedal(course: RallyCourse, laps: number, totalMs: number): 'gold' | 'silver' | 'bronze' | null {
  const gold = RALLY_COURSE_DEFS[course].gold * laps * 1000 + 3000;
  if (totalMs <= gold) return 'gold';
  if (totalMs <= gold * 1.15) return 'silver';
  if (totalMs <= gold * 1.35) return 'bronze';
  return null;
}
