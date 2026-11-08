// What whoever starts a race hands the rally game through `ctx.options` (see GameContext), and what the
// race reports back. Without options the game plays its default race: the farm course, three laps, five
// computer cars and the player's colour.
import type { GarageCar, RaceRules } from '../shared/rally.ts';
import type { RaceMods, RaceStats, RaceTwist } from './mods.ts';
import type { FieldPlan } from '../shared/field.ts';
import type { RaceKind } from '../shared/kinds.ts';
import type { ArenaId } from '../shared/derby.ts';

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
  /** Kronor the trinkets added at the finish (not in `kronor`). */
  bonus?: number;
  /** Ms the trinkets took off `time` (already taken off). */
  timeBonus?: number;
  /** What happened on the way, for the funny stats of a run. */
  stats?: RaceStats;
  /** The player's fastest lap in ms (0 when no lap was finished), and how often each trinket pulsed its icon. */
  bestLap?: number;
  triggers?: Record<string, number>;
  /** Rally, Blandat or Blodbad. In Blodbad `place` is the rank by points, and these tell how it came about. */
  kind?: RaceKind;
  points?: number;
  /** Blodbad and the derby: the part of the points that came from damage dealt (the rest is takedowns and the position), and the survival order in a derby. */
  dealt?: number;
  survival?: number;
  takedowns?: number;
  /** Times the player was wrecked. */
  wrecked?: number;
  /** Where the player crossed the line on the road (1 = first), whatever the points said. */
  roadPlace?: number;
  /** A Rivningsderby: how it ended. In a derby `place` is the placing (the order of elimination), `time` the length in ms. */
  derby?: DerbyOutcome;
}

/** How a Rivningsderby ended, for the result card: the final table, and whether the clock ran out. */
export interface DerbyOutcome {
  arena: ArenaId;
  /** Seconds the derby lasted, and the clock it had. */
  seconds: number;
  limit: number;
  /** The player was still running at the end. */
  alive: boolean;
  /** The clock ran out with more than one car running. */
  timeUp: boolean;
  /** Everyone, in placing order. `outAt` is the second the car was wrecked (null if it was still running). */
  table: { name: string; place: number; alive: boolean; takedowns: number; dealt: number; points: number; survival: number; hp: number; outAt: number | null; me: boolean }[];
}

export interface RallyOptions {
  rules: RaceRules;
  /** The player's car (its style and parts; `rules.sameCars` levels the body stats and the parts). */
  car: GarageCar;
  /** Seed for pickups on the track (same seed, same pads and puddles). */
  seed?: number;
  /** The player's best time (ms) on this course over `rules.laps` laps, for the "new record" toast. */
  best?: number;
  /** The player's trinkets turned into numbers and hooks (see mods.ts). Without them the race is plain. */
  mods?: RaceMods;
  /** How the player's car looks with its upgrades: the highest tier taken of every upgrade line (see run/upgrades.ts lookOf). */
  look?: Record<string, number>;
  /** A twist on the race: a boss, an icy road, hay bales. */
  twist?: RaceTwist;
  /** The rivals' kit (archetypes, upgrades, modifiers), the catch-up and the hazards. Without it the old plain grid races. */
  field?: FieldPlan;
  /** Coins on the road to collect (their kr land in `RallyResult.coins`). */
  coins?: boolean;
  /** Called once when the race is over, before `ctx.end`. */
  onDone?: (r: RallyResult) => void;
}

/** Reads `ctx.options` safely: anything but a RallyOptions means the default race. */
export const rallyOptions = (o: unknown): RallyOptions | null => (o && typeof o === 'object' && 'rules' in o && 'car' in o ? (o as RallyOptions) : null);
