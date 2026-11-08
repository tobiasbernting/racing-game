// Rivningsderby: an enclosed arena, no laps, the last car still running wins. Every car has health (see
// rally/combat.ts); a wrecked car is out for good. The placing is the order of elimination (the first one out is last),
// the cars still running are ranked by health for the position part of the points, and the winner is whoever has the most
// points: damage dealt and takedowns first, survival a smaller part. Pure rules, no three.js: the race (rally/index.ts) calls them and the tests walk them.
import type { RallyCourse } from './rally.ts';
import { carnagePoints } from './kinds.ts';

export const ARENA_IDS = ['bowl', 'oval'] as const;
export type ArenaId = (typeof ARENA_IDS)[number];
export const isArenaId = (s: unknown): s is ArenaId => typeof s === 'string' && (ARENA_IDS as readonly string[]).includes(s);

export interface ArenaInfo {
  id: ArenaId;
  name: string;
  emoji: string;
  /** One line on the pre-race card. */
  text: string;
  /** The course whose colour grade, sky and name the arena borrows. */
  course: RallyCourse;
}

export const ARENAS: Record<ArenaId, ArenaInfo> = {
  bowl: { id: 'bowl', name: 'Skrotskålen', emoji: '🥣', text: 'En rund skål av grus och däckvägg med en tornstor skrotbunke i mitten.', course: 'city' },
  oval: { id: 'oval', name: 'Däckovalen', emoji: '🛞', text: 'En lång oval med hoppramper på mitten och lysande strålkastare.', course: 'mountain' },
};

/** Seconds of derby before the time is up and the most health wins. */
export const DERBY_SECONDS = 150;
/** Everybody's health is this much more in a derby than in Blodbad: a derby is meant to take a minute or two, not ten seconds. */
export const DERBY_HP = 1.8;
/** ...and every hit hurts a little less, so a car lasts a handful of proper smashes (a wreck is for good here). */
export const DERBY_DAMAGE = 0.62;
/** Seconds at the start in which the computer cars only circle and size each other up. */
export const DERBY_WARMUP = 6;
/** The chance that the last boss calls you to a derby instead of a race (a seeded roll per run). */
export const DERBY_BOSS_CHANCE = 0.4;

export const DERBY_NAME = 'Rivningsderby';
export const DERBY_EMOJI = '🏟️';
/** The rule in one line, for the pre-race card. */
export const DERBY_TEXT = 'Rivningsderby: ingen mållinje. Vrakade bilar är ute för gott. Mest poäng vinner: skada du gör och bilar du vrakar. Den som aldrig slåss blir FEGIS och tappar hälsa.';
/** Where the arena is called what. */
export const arenaName = (id: ArenaId): string => ARENAS[id].name;

export interface DerbyStanding {
  id: string;
  /** 1 = the winner. */
  place: number;
  /** Still running when the derby ended. */
  alive: boolean;
  /** Seconds into the derby it was wrecked (null when alive). */
  outAt: number | null;
  takedowns: number;
  /** Damage dealt, in points. */
  dealt: number;
  /** Points: damage + takedowns + the survival part. They decide the placing. */
  points: number;
  /** Survival order (1 = the last one running, or the one with most health when the time ran out). */
  survival: number;
  /** Health left, 0..1 (what ranks the cars alive at the end). */
  hp: number;
}

/** Who is still in, who went out when and who took them down. */
export class DerbyBoard {
  private readonly out: { id: string; t: number; by: string | null }[] = [];
  private readonly takes = new Map<string, number>();
  private readonly dmg = new Map<string, number>();

  constructor(
    readonly ids: readonly string[],
    readonly limit: number = DERBY_SECONDS,
  ) {}

  isOut(id: string): boolean {
    return this.out.some((o) => o.id === id);
  }

  /** Is `id` one of the cars on the board? (A stray id never changes anything.) */
  has(id: string): boolean {
    return this.ids.includes(id);
  }

  /** `id` is wrecked for good at time `t`, perhaps by `by` (a takedown for them). Returns false when it was already out. */
  eliminate(id: string, t: number, by: string | null = null): boolean {
    if (!this.has(id) || this.isOut(id)) return false;
    const taker = by && by !== id && this.has(by) ? by : null;
    this.out.push({ id, t, by: taker });
    if (taker) this.takes.set(taker, (this.takes.get(taker) ?? 0) + 1);
    return true;
  }

  takedowns(id: string): number {
    return this.takes.get(id) ?? 0;
  }

  alive(): string[] {
    return this.ids.filter((id) => !this.isOut(id));
  }

  aliveCount(): number {
    return this.ids.length - this.out.length;
  }

  /** Over when one car is left (or none), or when the time is up. */
  isOver(t: number): boolean {
    return this.aliveCount() <= 1 || t >= this.limit;
  }

  /** Seconds left, never below 0. */
  timeLeft(t: number): number {
    return Math.max(0, this.limit - t);
  }

  /** Damage dealt (in points) by `id`: the board keeps the tally, the race tells it. */
  deal(id: string, pts: number): void {
    if (this.has(id) && pts > 0) this.dmg.set(id, (this.dmg.get(id) ?? 0) + pts);
  }

  dealt(id: string): number {
    return this.dmg.get(id) ?? 0;
  }

  /**
   * The table (final or as it stands). Survival order first: the cars alive by health, then the wrecks, the last one out
   * first. That order gives the position part of the points; the placing is the rank by points (damage dealt and takedowns
   * count most), ties going to whoever lasted longer.
   */
  standings(hp: (id: string) => number): DerbyStanding[] {
    const alive = this.alive()
      .map((id) => ({ id, hp: Math.max(0, Math.min(1, hp(id))) }))
      .sort((a, b) => b.hp - a.hp || this.takedowns(b.id) - this.takedowns(a.id) || this.ids.indexOf(a.id) - this.ids.indexOf(b.id));
    const rows: DerbyStanding[] = [];
    const n = this.ids.length;
    alive.forEach((a, i) => rows.push(this.row(a.id, i + 1, null, a.hp, true)));
    // the one wrecked last is the best of the wrecks
    [...this.out].reverse().forEach((o, i) => rows.push(this.row(o.id, alive.length + i + 1, o.t, 0, false)));
    const ranked = rows.slice(0, n).sort((a, b) => b.points - a.points || a.survival - b.survival);
    return ranked.map((r, i) => ({ ...r, place: i + 1 }));
  }

  private row(id: string, survival: number, outAt: number | null, hp: number, alive: boolean): DerbyStanding {
    const td = this.takedowns(id);
    const dealt = Math.round(this.dealt(id));
    return { id, place: survival, survival, alive, outAt, takedowns: td, dealt, points: carnagePoints(survival, td, dealt), hp };
  }

  place(id: string, hp: (id: string) => number): number {
    return this.standings(hp).find((r) => r.id === id)?.place ?? this.ids.length;
  }
}

/** The short sentence under the result: how the player's derby went. */
export function derbyHeadline(s: { place: number; n: number; alive: boolean; timeUp: boolean }): string {
  if (s.place === 1) return s.timeUp ? 'Tiden tog slut och du hade flest poäng. Du vann derbyt!' : 'Flest poäng när derbyt var slut. Du vann derbyt!';
  if (!s.alive) return s.place === s.n ? 'Först ut och minst poäng. Det var snabbt.' : `Utslagen, men du slutade på plats ${s.place} av ${s.n} på poäng.`;
  return `Det blev plats ${s.place} av ${s.n} på poäng. Slåss mer nästa gång!`;
}
