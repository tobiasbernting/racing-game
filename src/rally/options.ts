// What whoever starts a race hands the rally game through `ctx.options` (see GameContext), and what the
// race reports back. Without options the game plays its default race: the farm course, three laps, five
// computer cars and the player's colour.
import type { GarageCar, RaceRules } from '../shared/rally.ts';

/** What a finished race reports (through RallyOptions.onDone, once, before ctx.end). */
export interface RallyResult {
  /** The player's placing, 1 = first. When the player did not finish, the last place. */
  place: number;
  /** Cars on the track, the player included. */
  n: number;
  /** Did the player cross the line? */
  finished: boolean;
  /** Race time in ms over all laps (0 when not finished). */
  time: number;
  /** Laps the player completed. */
  laps: number;
  /** Kronor earned from the placing (racePrize, or the small taking-part prize for a DNF). */
  kronor: number;
  /** Kronor picked up on the track during the race (0 until the track has coins). */
  coins: number;
  medal: 'gold' | 'silver' | 'bronze' | null;
  /** The player's car damage 0..100 at the end. */
  damage: number;
}

export interface RallyOptions {
  rules: RaceRules;
  /** The player's car (its style and parts; `rules.sameCars` levels the body stats and the parts). */
  car: GarageCar;
  /** Seed for pickups on the track (same seed, same pads and puddles). */
  seed?: number;
  /** The player's best time (ms) on this course over `rules.laps` laps, for the "new record" toast. */
  best?: number;
  /** Called once when the race is over, before `ctx.end`. */
  onDone?: (r: RallyResult) => void;
}

/** Reads `ctx.options` safely: anything but a RallyOptions means the default race. */
export const rallyOptions = (o: unknown): RallyOptions | null => (o && typeof o === 'object' && 'rules' in o && 'car' in o ? (o as RallyOptions) : null);
