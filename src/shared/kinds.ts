// The three kinds of race a map node can be, and how Blodbad scores. Pure data and formulas.
//
//   🏁 Rally    clean, technical racing: light plating damage, rivals keep out of your way, first across wins
//   ⚖️ Blandat  racing with shoving: moderate contact, some rivals go for you, nobody is thrown out
//   💥 Blodbad  mayhem: health bars, wrecks, takedowns; the winner is the one with most points
export const RACE_KINDS = ['rally', 'mixed', 'carnage'] as const;
export type RaceKind = (typeof RACE_KINDS)[number];
export const isRaceKind = (s: unknown): s is RaceKind => typeof s === 'string' && (RACE_KINDS as readonly string[]).includes(s);

export const KIND_NAMES: Record<RaceKind, string> = { rally: 'Rally', mixed: 'Blandat', carnage: 'Blodbad' };
export const KIND_EMOJI: Record<RaceKind, string> = { rally: '🏁', mixed: '⚖️', carnage: '💥' };

/** One line on the pre-race card. */
export const KIND_TEXT: Record<RaceKind, string> = {
  rally: 'Ren racing. Lätt plåtskada, rivalerna håller sig på sin sida. Först i mål vinner.',
  mixed: 'Racing med knuffar. Några rivaler går på dig, men ingen åker ut. Först i mål vinner.',
  carnage: 'Smällar och vrak! Poäng för skada du gör och vrakade bilar, lite för placeringen. Mest poäng vinner. Den som aldrig slåss blir FEGIS och tappar hälsa.',
};

/** Where a race kind leans when rewards are drawn (see TrinketDef.path). */
export const KIND_PATH: Record<RaceKind, 'race' | 'ram' | null> = { rally: 'race', mixed: null, carnage: 'ram' };

/** How hard the rivals who like to shove go for you, by race kind (multiplies the archetype's own appetite). */
export const KIND_AGGRO: Record<RaceKind, number> = { rally: 0.12, mixed: 0.55, carnage: 1 };

/** Share of each kind among the race nodes of an act (the mix averages about 35 / 40 / 25 over a run). */
export const KIND_MIX: readonly (readonly [number, number, number])[] = [
  [0.45, 0.4, 0.15],
  [0.35, 0.4, 0.25],
  [0.25, 0.4, 0.35],
];

/**
 * Blodbad and the derby are scored on fighting: points for the damage you deal, for every car you wreck, and a smaller
 * part for where you end up (the finishing order, or in the derby how long you lasted). A car that never fights gets the
 * position points and nothing else, so it cannot win.
 */
export const PLACE_POINTS = [20, 14, 10, 6, 4, 2] as const;
/** Per wrecked car (the damage that wrecked it is paid on top). */
export const TAKEDOWN_POINTS = 20;
/** Points per percent of the victim's full health that a hit takes off: wrecking a whole car by hits alone is 50 p. */
export const DAMAGE_PER_PERCENT = 0.5;

export const placePoints = (place: number): number => PLACE_POINTS[Math.max(0, Math.min(PLACE_POINTS.length - 1, Math.round(place) - 1))]!;
/** Points for `hp` health points taken off a car that has `maxHp` in all. */
export const damagePoints = (hp: number, maxHp: number): number => (DAMAGE_PER_PERCENT * 100 * Math.max(0, hp)) / Math.max(1, maxHp);
/** A car's points: damage dealt (already in points), takedowns and the position part. */
export const carnagePoints = (place: number, takedowns: number, damage = 0): number =>
  placePoints(place) + TAKEDOWN_POINTS * Math.max(0, Math.floor(takedowns)) + Math.round(Math.max(0, damage));

export interface PointsEntry {
  id: string;
  /** Position on the road (1 = in front). */
  place: number;
  takedowns: number;
  /** Damage dealt, in points. */
  damage?: number;
}

export interface PointsRow extends PointsEntry {
  points: number;
  /** Rank by points (1 = most points), ties broken by the better position on the road. */
  rank: number;
}

/** The Blodbad table: points per car and the rank they make. */
export function pointsTable(entries: readonly PointsEntry[]): PointsRow[] {
  const rows = entries.map((e) => ({ ...e, points: carnagePoints(e.place, e.takedowns, e.damage ?? 0), rank: 0 }));
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.place - b.place);
  sorted.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/** Seconds without dealing any damage before a car is marked FEGIS, and how fast it then loses health (percent of its full health per second). */
export const FEGIS_AFTER = 10;
export const FEGIS_DRAIN = { carnage: 2.4, derby: 2.2 } as const;
/** In a race with laps the clock only runs while a rival is this close (m): the leader far ahead of the pack has nobody to hit. */
export const FEGIS_REACH = 45;
