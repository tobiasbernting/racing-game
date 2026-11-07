// What a run can do to a race. The roguelite layer (src/run) turns the player's trinkets into a RaceMods and
// hands it to the rally through RallyOptions.mods; the race only knows this file, never the trinkets.
//
//  * `tune`   static numbers read when the race starts (bigger wheels, longer nitro, low gravity…)
//  * `bus`    dynamic hooks the race calls as things happen (tick, boost, drift, hit, lap, pickup, finish)
//  * `RaceApi` what a hook may do to the race (bounce the car, drop slime, fart, fire the confetti cannon…)
//
// New vehicles or trinkets in later phases only add data: a field here plus a line where the race reads it.

import type { CarBody, CarDriver } from '../shared/rally.ts';

/** Static modifiers. Every field has a neutral value (see `neutralTune`). */
export interface ModTune {
  /** Engine power multiplier. */
  power: number;
  /** Grip multiplier, everywhere. */
  grip: number;
  /** Extra grip and less drag on grass, sand and snow. */
  offroad: number;
  /** Car scale (looks and collision size). */
  size: number;
  /** Wheel scale (looks only, the body rides higher). */
  wheels: number;
  /** Gravity multiplier (below 1 floats). */
  gravity: number;
  /** Nitro length multiplier and strength multiplier of the extra push. */
  nitroSeconds: number;
  nitroPower: number;
  /** Extra nitro charges for the race. */
  charges: number;
  /** Drift charge speed multiplier (the mini-turbo). */
  driftRate: number;
  /** Radius in metres that coins fly to the car from (0 = off). */
  magnet: number;
  /** Multiplier on the kr value of a coin. */
  coinValue: number;
  /** Seconds of rocket start at the lights, on top of the one for a perfect start. */
  launch: number;
  /** Mud puddles do nothing. */
  mudproof: boolean;
  /** Vertical speed (m/s) of the handbrake jump when going straight (0 = no jump). */
  jump: number;
  /** Sideways wiggle of the steering (0 = none). */
  wiggle: number;
  /** Disco lights and a beat. */
  disco: boolean;
  /** Antlers on the front: the car shoves cars it bumps (multiplier). */
  shove: number;
  /** Glitter trail behind the car. */
  glitter: boolean;
  /** Multiplier on the vehicle's top speed (only bodies that have one: the moped, the tractor). */
  top: number;
  /** Damage taken is multiplied by this. */
  tough: number;
  /** A sidecar on the motorbike: steadier, heavier, and the bike stops falling over. */
  sidecar: boolean;
}

export const neutralTune = (): ModTune => ({
  power: 1,
  grip: 1,
  offroad: 1,
  size: 1,
  wheels: 1,
  gravity: 1,
  nitroSeconds: 1,
  nitroPower: 1,
  charges: 0,
  driftRate: 1,
  magnet: 0,
  coinValue: 1,
  launch: 0,
  mudproof: false,
  jump: 0,
  wiggle: 0,
  disco: false,
  shove: 0,
  glitter: false,
  top: 1,
  tough: 1,
  sidecar: false,
});

/** Things the funny stats at the end of a run count. */
export interface RaceStats {
  bounces: number;
  driftSeconds: number;
  bananas: number;
  bananaHits: number;
  boosts: number;
  coins: number;
  squashed: number;
  quacks: number;
  jumps: number;
  /** Seconds with all wheels off the ground, and how many times the car took off. */
  airSeconds: number;
  airJumps: number;
  /** Highest speed (km/h) and longest single drift (s): across a run these are maxima, not sums. */
  topSpeed: number;
  longestDrift: number;
  /** Seconds of nitro burning. */
  nitroSeconds: number;
  /** Oil slicks the player drove into, cars passed on the road, hazards the player dropped for others. */
  oilHits: number;
  overtakes: number;
  hazards: number;
  /** Times the vehicle's active ability was used. */
  abilityUses: number;
}

export const emptyStats = (): RaceStats => ({ bounces: 0, driftSeconds: 0, bananas: 0, bananaHits: 0, boosts: 0, coins: 0, squashed: 0, quacks: 0, jumps: 0, airSeconds: 0, airJumps: 0, topSpeed: 0, longestDrift: 0, nitroSeconds: 0, oilHits: 0, overtakes: 0, hazards: 0, abilityUses: 0 });

/** The player's car as a hook sees it each frame. */
export interface TickState {
  speed: number;
  steer: number;
  /** Handbrake held, and pressed this very frame. */
  handbrake: boolean;
  handbrakePressed: boolean;
  /** Going roughly straight (no steering, no slide). */
  straight: boolean;
  air: boolean;
  drifting: boolean;
  boosting: boolean;
  lap: number;
  place: number;
  racing: boolean;
  /** Seconds since the lights went green. */
  time: number;
}

export interface FinishInfo {
  place: number;
  n: number;
  finished: boolean;
  /** ms over all laps, 0 when not finished. */
  time: number;
  /** ms of each lap the player completed. */
  laps: number[];
  kronor: number;
  coins: number;
}

/** What a finish hook may change: kr to add, ms to take off the time. */
export interface FinishAdjust {
  kronor?: number;
  time?: number;
}

/** What a hook can do to the race. Every call is cheap and safe to repeat. */
export interface RaceApi {
  /** Pop the trinket's toast and pulse its icon (rate-limited). `text` replaces the default line. */
  say(id: string, text?: string): void;
  /** A fart (size 1 = a toot, 2 = a long one). Counts for the "pruttade" stat. */
  fart(size?: number): void;
  burp(): void;
  /** A green cloud behind the car; cars close behind swerve (unless `push` is false). */
  gas(strength: number, push?: boolean): void;
  boing(): void;
  party(): void;
  /** Hop the car: add vertical speed (m/s). Counts as a bounce. */
  bounce(vy: number): void;
  /** Add forward speed (m/s) along the road. */
  kick(dv: number): void;
  /** Extra boost for a while (seconds, strength multiplier like 1.3). */
  boost(sec: number, strength?: number): void;
  /** Drive through other cars for a while. */
  ghost(sec: number): void;
  /** Drop a slimy puddle behind the car (internally still `banana`). */
  banana(): void;
  /** Hot-dog cannon: shove the cars ahead aside. */
  cannon(strength: number): void;
  /** The front-most computer car goes flat for a while. */
  squashLeader(sec: number): void;
  /** Computer cars within `radius` m behind lose speed (k per second, 0..1). */
  slowBehind(radius: number, k: number, dt: number): void;
  /** Shove computer cars close to the player (m/s outward). */
  shove(radius: number, strength: number): void;
  /** Swap places with the closest car ahead (false when nobody is close enough). */
  swapAhead(): boolean;
  /** Drop a hay bale or an oil slick on the road in front of the closest rival ahead (false when there is none). */
  dropAhead(kind: 'hay' | 'oil'): boolean;
  /** Swap the player's vehicle for another one at random (a poof and a new body). */
  swapVehicle(): void;
  /** Add kr straight away (shown as a pop-up). */
  kronor(n: number): void;
  /** Sparkles round the car. */
  sparkle(n: number): void;
  stat(k: keyof RaceStats, n?: number): void;
}

export interface HookCtx {
  api: RaceApi;
  /** The vehicle the player started the race in. */
  body: CarBody;
  /** How many of this trinket the player has. */
  n: number;
  /** Scratch numbers for the hook, fresh each race. */
  st: Record<string, number>;
}

export interface ModHooks {
  tick?(c: HookCtx, dt: number, s: TickState): void;
  boost?(c: HookCtx, kind: 'nitro' | 'drift' | 'pad' | 'start'): void;
  drift?(c: HookCtx, seconds: number, tier: number): void;
  hit?(c: HookCtx, kind: 'wall' | 'car' | 'land', speed: number): void;
  lap?(c: HookCtx, lap: number): void;
  pickup?(c: HookCtx, kind: 'boost' | 'mud' | 'coin'): void;
  /** The horn (or the moped's bell) rang. `near` is how many cars are within 14 m. */
  honk?(c: HookCtx, near: number): void;
  finish?(c: HookCtx, r: FinishInfo): FinishAdjust | void;
}

/** One kind of trinket the player carries. */
export interface ModItem {
  id: string;
  name: string;
  emoji: string;
  n: number;
}

/** A trinket's hooks, bound to its stack count and scratch state. */
export interface ModEntry {
  id: string;
  hooks: ModHooks;
  ctx: HookCtx;
}

/** Calls every active trinket's hook. The race binds the api once, then calls these. */
export class ModBus {
  constructor(private entries: ModEntry[]) {}

  bind(api: RaceApi): void {
    for (const e of this.entries) e.ctx.api = api;
  }

  get size(): number {
    return this.entries.length;
  }

  /** Does any trinket care about the horn? (Then the car also tutes by itself behind another car.) */
  get honking(): boolean {
    return this.entries.some((e) => !!e.hooks.honk);
  }

  tick(dt: number, s: TickState): void {
    for (const e of this.entries) e.hooks.tick?.(e.ctx, dt, s);
  }
  boost(kind: 'nitro' | 'drift' | 'pad' | 'start'): void {
    for (const e of this.entries) e.hooks.boost?.(e.ctx, kind);
  }
  drift(seconds: number, tier: number): void {
    for (const e of this.entries) e.hooks.drift?.(e.ctx, seconds, tier);
  }
  hit(kind: 'wall' | 'car' | 'land', speed: number): void {
    for (const e of this.entries) e.hooks.hit?.(e.ctx, kind, speed);
  }
  lap(lap: number): void {
    for (const e of this.entries) e.hooks.lap?.(e.ctx, lap);
  }
  pickup(kind: 'boost' | 'mud' | 'coin'): void {
    for (const e of this.entries) e.hooks.pickup?.(e.ctx, kind);
  }
  honk(near: number): void {
    for (const e of this.entries) e.hooks.honk?.(e.ctx, near);
  }
  /** Sums what the finish hooks add. */
  finish(r: FinishInfo): Required<FinishAdjust> {
    const out = { kronor: 0, time: 0 };
    for (const e of this.entries) {
      const a = e.hooks.finish?.(e.ctx, r);
      if (a) {
        out.kronor += a.kronor ?? 0;
        out.time += a.time ?? 0;
      }
    }
    return out;
  }
}

export interface RaceMods {
  items: ModItem[];
  tune: ModTune;
  bus: ModBus;
}

/** No trinkets at all. */
export const noMods = (): RaceMods => ({ items: [], tune: neutralTune(), bus: new ModBus([]) });

/**
 * A twist on the race itself, not on the player's car: the boss gimmicks and the harder acts. Everything is
 * optional; a race without one is a plain race.
 */
export interface RaceTwist {
  /** The first computer car becomes this rival (a boss): name, driver and body. */
  boss?: { name: string; face: CarDriver; body: CarBody; color: string; power: number; skill: number };
  /** Rivals get this much more (or less) skill / power than the difficulty says. */
  rivalSkill?: number;
  rivalPower?: number;
  /** Rivals fire a short nitro every this many seconds (0 = never). */
  rivalNitro?: number;
  /** Rivals hop across the road every this many seconds (0 = never). */
  rivalHop?: number;
  /** Grip multiplier for everyone (an icy road). */
  grip?: number;
  /** Hay bales on the road per lap: they spin whoever hits them. */
  hay?: number;
}

/**
 * Linear up to `knee`, then closing in on `max` without ever reaching it: a soft cap, so the tenth copy of
 * something still adds a little but no single stack breaks the game.
 */
export function softCap(x: number, knee: number, max: number): number {
  if (x <= knee) return x;
  const room = max - knee;
  return knee + room * (1 - Math.exp(-(x - knee) / room));
}

/** Soft caps on what trinkets can add together (the player's parts come on top, and are capped by their levels). */
export function capTune(t: ModTune): ModTune {
  t.power = softCap(t.power, 1.25, 1.5);
  t.grip = softCap(t.grip, 1.1, 1.22);
  t.offroad = softCap(t.offroad, 1.3, 1.6);
  t.size = softCap(t.size, 1.3, 1.7);
  t.wheels = softCap(t.wheels, 1.8, 2.4);
  t.gravity = Math.max(0.4, t.gravity);
  t.nitroSeconds = softCap(t.nitroSeconds, 1.6, 2.4);
  t.nitroPower = softCap(t.nitroPower, 1.3, 1.6);
  t.charges = Math.round(softCap(t.charges, 2, 3) * 100) / 100;
  t.driftRate = softCap(t.driftRate, 3, 5);
  t.magnet = Math.min(30, t.magnet);
  t.coinValue = softCap(t.coinValue, 2, 3);
  t.launch = Math.min(5, t.launch);
  t.jump = Math.min(12, t.jump);
  t.shove = softCap(t.shove, 1.5, 3);
  t.top = Math.min(1.5, t.top);
  t.tough = Math.max(0.45, t.tough);
  return t;
}

/** The most nitro charges a race can have in all (the turbo part and trinkets together), and the seconds of nitro in all. */
export const MAX_CHARGES = 5;
export const MAX_NITRO_SECONDS = 12;

/** The most the car's power and grip can come to in all (body, parts and trinkets together): soft caps. */
export const capPower = (x: number): number => softCap(x, 1.3, 1.5);
export const capGrip = (x: number): number => softCap(x, 1.12, 1.22);
