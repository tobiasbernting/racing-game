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
  carnage: 'Smällar och vrak! Poäng för placering och 3 per vrakad bil. Mest poäng vinner, inte först i mål.',
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

/** Points for the finishing order in Blodbad (first to sixth), and for each car you wreck. */
export const PLACE_POINTS = [10, 7, 5, 3, 2, 1] as const;
export const TAKEDOWN_POINTS = 3;

export const placePoints = (place: number): number => PLACE_POINTS[Math.max(0, Math.min(PLACE_POINTS.length - 1, Math.round(place) - 1))]!;
export const carnagePoints = (place: number, takedowns: number): number => placePoints(place) + TAKEDOWN_POINTS * Math.max(0, Math.floor(takedowns));

export interface PointsEntry {
  id: string;
  /** Position on the road (1 = in front). */
  place: number;
  takedowns: number;
}

export interface PointsRow extends PointsEntry {
  points: number;
  /** Rank by points (1 = most points), ties broken by the better position on the road. */
  rank: number;
}

/** The Blodbad table: points per car and the rank they make. */
export function pointsTable(entries: readonly PointsEntry[]): PointsRow[] {
  const rows = entries.map((e) => ({ ...e, points: carnagePoints(e.place, e.takedowns), rank: 0 }));
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.place - b.place);
  sorted.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
