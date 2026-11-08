// Ikappkörningshjälp: help for a player who has ended up far behind (ran off the road, got rammed, a bad start).
// Pure numbers and small formulas, no DOM: the race loop (index.ts) and the race model (run/racesim.ts) read the same ones.
//
//  1. Slipström: close behind another car gives speed and fills the nitro.
//  2. The field eases off a little when the player is far behind (the rivals in front, never those behind).
//  3. Comeback: a small extra top speed and acceleration, and a faster nitro and ability recharge, for a player in the
//     bottom places and/or far behind. Nothing at all while leading or close to the pack.
//  4. Ilska: a couple of seconds of extra pull after an off-road respawn, a wreck or a heavy hit.
//  5. Respawn: back on the road with part of the speed kept (not standing still).
//
// All of it is scaled by the difficulty (strongest in Söndagsåkare, moderate in Normal, light in Hård, none in Ett liv,
// where only the slipström stays) and can be switched off in the settings.
import type { Difficulty } from '../run/difficulty.ts';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smooth01 = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** How much help each difficulty gets (1 = full). Ett liv gets none of the field/comeback/rage help. */
export const HELP_K: Record<Difficulty, number> = { calm: 1, normal: 0.6, hard: 0.3, one: 0 };
/** Slipström strength per difficulty: it is a driving mechanic, so even Ett liv keeps half of it (the setting can still turn it off). */
export const SLIP_K: Record<Difficulty, number> = { calm: 1, normal: 0.85, hard: 0.7, one: 0.5 };

export const helpK = (d: Difficulty, on = true): number => (on ? HELP_K[d] : 0);
export const slipK = (d: Difficulty, on = true): number => (on ? SLIP_K[d] : 0);

/** The gap (m) to the leader where "far behind" starts and where it is full. */
export const FAR = { start: 70, full: 420 };
export const farBehind = (gap: number): number => smooth01((gap - FAR.start) / (FAR.full - FAR.start));

// ---------------------------------------------------------------------------
// 2. The field eases off
// ---------------------------------------------------------------------------

/** The most a rival eases off (a share of its speed) at full help. It sits on top of the old catch-up in field.ts. */
export const RIVAL_EASE_MAX = 0.07;
/** A rival `ahead` metres in front of the player eases off by this share. Nothing within 70 m, full from 360 m. */
export function rivalEase(ahead: number, k: number): number {
  if (k <= 0 || ahead <= FAR.start) return 0;
  return RIVAL_EASE_MAX * k * smooth01((ahead - FAR.start) / (360 - FAR.start));
}

// ---------------------------------------------------------------------------
// 3. Comeback
// ---------------------------------------------------------------------------

/** 0 for the top half, up to 1 for last place (n cars, place 1 = first). */
export function placeFactor(place: number, n: number): number {
  if (n <= 2) return place >= n ? 1 : 0;
  return clamp01((place - (n + 1) / 2) / ((n - 1) / 2));
}

/**
 * How much the player needs the help, 0..1: how far behind the leader (`gapLead` m, 0 or less when leading) and how low
 * in the order. Last place far behind is 1; last place 80 m behind is a sliver; second place is at most 40 % of it.
 */
export function comebackLevel(gapLead: number, place: number, n: number): number {
  if (gapLead <= 0) return 0;
  return farBehind(gapLead) * (0.4 + 0.6 * placeFactor(place, n));
}

export interface Comeback {
  /** Extra top speed and acceleration (shares), and the extra rate of the nitro and ability recharge (a share, 1 = twice as fast). */
  top: number;
  power: number;
  recharge: number;
  /** Nitro charges per second the comeback drips in. */
  nitro: number;
}

export const COMEBACK = { top: 0.1, power: 0.35, recharge: 1.5, nitro: 0.09 };

export function comebackBonus(level: number, k: number): Comeback {
  const x = clamp01(level) * Math.max(0, k);
  return { top: COMEBACK.top * x, power: COMEBACK.power * x, recharge: COMEBACK.recharge * x, nitro: COMEBACK.nitro * x };
}

// ---------------------------------------------------------------------------
// 4. Ilska
// ---------------------------------------------------------------------------

export const RAGE = { seconds: 2.4, hitSeconds: 1.8, fade: 0.6, cooldown: 4, power: 0.6, top: 0.08, hit: 8 };
export type RageCause = 'respawn' | 'wreck' | 'hit';
export const rageSeconds = (cause: RageCause): number => (cause === 'hit' ? RAGE.hitSeconds : RAGE.seconds);

/** The strength of the rage with `left` seconds of `total` to go: full, then fading over the last 0.6 s. */
export const rageStrength = (left: number, total: number): number => (total <= 0 || left <= 0 ? 0 : Math.min(1, left / Math.min(RAGE.fade, total)));

export function rageBonus(strength: number, k: number): { top: number; power: number } {
  const x = clamp01(strength) * Math.max(0, k);
  return { top: RAGE.top * x, power: RAGE.power * x };
}

// ---------------------------------------------------------------------------
// 1. Slipström
// ---------------------------------------------------------------------------

export const SLIP = { reach: 20, lane: 2.7, minSpeed: 14, top: 0.07, power: 0.25, nitro: 0.11, rise: 2.2, fall: 1.3 };

/** How deep in the draft, 0..1: right on the bumper is 1, at the edge of the reach 0; outside the lane 0. */
export function slipDepth(fwd: number, lat: number, speed: number): number {
  if (speed < SLIP.minSpeed || fwd < 1 || fwd > SLIP.reach || Math.abs(lat) > SLIP.lane) return 0;
  const along = 1 - (fwd - 1) / (SLIP.reach - 1);
  const side = 1 - Math.abs(lat) / SLIP.lane;
  return clamp01(Math.sqrt(along) * (0.4 + 0.6 * side));
}

export function slipBonus(level: number, k: number): { top: number; power: number; nitro: number } {
  const x = clamp01(level) * Math.max(0, k);
  return { top: SLIP.top * x, power: SLIP.power * x, nitro: SLIP.nitro * x };
}

// ---------------------------------------------------------------------------
// 5. Respawn
// ---------------------------------------------------------------------------

export const RESPAWN = { keep: 0.6, min: 13, max: 36, autoOff: 2.4, autoStuck: 1.8, plainOff: 6, plainStuck: 2.8, buttonAfter: 0.8 };

/** The speed (m/s) the car rolls on with after a respawn: 60 % of what it had, never standing still. */
export const respawnSpeed = (speed: number): number => Math.min(RESPAWN.max, Math.max(RESPAWN.min, Math.max(0, speed) * RESPAWN.keep));

/** Seconds off the road / stuck before the car is put back by itself (quicker with the help on). */
export const autoRespawnAfter = (helpOn: boolean): { off: number; stuck: number } => (helpOn ? { off: RESPAWN.autoOff, stuck: RESPAWN.autoStuck } : { off: RESPAWN.plainOff, stuck: RESPAWN.plainStuck });

/** Should the "↩ Tillbaka" button show on a touch screen? */
export const showBackButton = (offT: number, stuckT: number): boolean => offT > RESPAWN.buttonAfter || stuckT > RESPAWN.buttonAfter;

// ---------------------------------------------------------------------------
// The race model (run/racesim.ts) reads the same numbers as speed, not as top speed and recharge
// ---------------------------------------------------------------------------

/** Share of a top-speed/power bonus that turns into average speed over a lap (corners and braking eat the rest). */
export const SIM_EFFECT = 0.5;
/** Average speed share the faster recharge adds at full comeback (more nitro and ability uses per lap). */
export const SIM_RECHARGE = 0.012;

/** The player's extra average speed in the race model: comeback, plus rage while it lasts, plus slipström while in a draft. */
export function simSpeedBonus(o: { level: number; k: number; rage?: number; slip?: number; slipK?: number }): number {
  const c = comebackBonus(o.level, o.k);
  const r = rageBonus(o.rage ?? 0, o.k);
  const s = slipBonus(o.slip ?? 0, o.slipK ?? 0);
  return (c.top + c.power * 0.15 + r.top + r.power * 0.15 + s.top + s.power * 0.12) * SIM_EFFECT + SIM_RECHARGE * clamp01(o.level) * Math.max(0, o.k);
}
