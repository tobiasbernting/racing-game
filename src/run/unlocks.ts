// Challenges that unlock vehicles: a mix of wins and tricks ("Vinn en runda", "Gör 10 takedowns i en runda").
// Each entry is data: which vehicle it opens, a goal, and how to measure one run towards it. Progress lives in
// the meta save and is checked while a run goes on (after every step, for the "best in one run" kind) and when
// it ends (for the kind that adds up over runs). A new vehicle is one more entry in CHALLENGES.
import type { CarBody } from '../shared/rally.ts';
import type { Meta } from './meta.ts';
import type { RunState } from './state.ts';

export interface Challenge {
  id: string;
  /** The vehicle it opens. */
  body: CarBody;
  /** The condition as a short Swedish sentence ("Vinn en runda"). */
  title: string;
  /** What the progress counts, for "Takedowns i en runda: 6/10". */
  label: string;
  goal: number;
  /** `best`: the most in one run (checked all the time). `total`: adds up over runs (counted when a run ends). */
  mode: 'best' | 'total';
  /** What one run has come to so far. */
  measure(run: RunState): number;
}

const won = (r: RunState): boolean => r.status === 'won';
const bossWon = (r: RunState, boss: string): boolean => r.log.some((l) => l.type === 'boss' && l.boss === boss && l.finished === true && l.place === 1);

/** Act 2 won without losing a heart in it: the act's boss beaten, and none of its nodes cost one. */
export function flawlessAct(r: RunState, act: number): boolean {
  const boss = r.log.some((l) => l.act === act && l.type === 'boss' && l.finished === true && l.place === 1);
  return boss && r.log.filter((l) => l.act === act).every((l) => l.lost === 0);
}

/** The vehicles that are not starters, and what opens each. */
export const CHALLENGES: readonly Challenge[] = [
  { id: 'win', body: 'coupe', title: 'Vinn en runda', label: 'Vunna rundor', goal: 1, mode: 'total', measure: (r) => (won(r) ? 1 : 0) },
  { id: 'calmWin', body: 'atv', title: 'Vinn en runda på Söndagsåkare', label: 'Vunna rundor på Söndagsåkare', goal: 1, mode: 'total', measure: (r) => (won(r) && r.calm ? 1 : 0) },
  { id: 'takedowns', body: 'monster', title: 'Gör 10 takedowns i en runda', label: 'Takedowns i en runda', goal: 10, mode: 'best', measure: (r) => r.stats.takedowns },
  { id: 'bengtMoped', body: 'moto', title: 'Slå Sura Bengt med moppen', label: 'Sura Bengt slagen med moppen', goal: 1, mode: 'best', measure: (r) => (r.car.body === 'moped' && bossWon(r, 'bengt') ? 1 : 0) },
  { id: 'flawless2', body: 'sofa', title: 'Vinn akt 2 utan att tappa ett hjärta', label: 'Akt 2 utan förlorade hjärtan', goal: 1, mode: 'best', measure: (r) => (flawlessAct(r, 1) ? 1 : 0) },
];

export const challengeFor = (body: CarBody): Challenge | undefined => CHALLENGES.find((c) => c.body === body);
export const challengeById = (id: string): Challenge | undefined => CHALLENGES.find((c) => c.id === id);

/** "Takedowns i en runda: 6/10" */
export const progressText = (c: Challenge, have: number): string => `${c.label}: ${Math.min(c.goal, have)}/${c.goal}`;

export interface ProgressStep {
  id: string;
  before: number;
  after: number;
}

export interface CheckResult {
  /** The meta with the new progress and the newly opened vehicles (the input is left alone). */
  meta: Meta;
  /** Challenges whose number went up. */
  steps: ProgressStep[];
  /** Challenges completed by this check: their vehicles are open now. */
  unlocked: Challenge[];
}

/**
 * Checks every challenge whose vehicle is still closed against a run. `ended` is true once, when the run is over:
 * only then do the `total` challenges count it (so a reload or a second check never counts a run twice).
 */
export function checkChallenges(meta: Meta, run: RunState, ended = false): CheckResult {
  const progress = { ...meta.progress };
  const bodies = [...meta.bodies];
  const steps: ProgressStep[] = [];
  const unlocked: Challenge[] = [];
  for (const c of CHALLENGES) {
    if (bodies.includes(c.body)) continue;
    const before = progress[c.id] ?? 0;
    const v = Math.max(0, c.measure(run));
    const after = Math.min(c.goal, c.mode === 'best' ? Math.max(before, v) : before + (ended ? v : 0));
    if (after !== before) {
      progress[c.id] = after;
      steps.push({ id: c.id, before, after });
    }
    if (after >= c.goal) {
      bodies.push(c.body);
      unlocked.push(c);
    }
  }
  if (!steps.length && !unlocked.length) return { meta, steps, unlocked };
  return { meta: { ...meta, progress, bodies }, steps, unlocked };
}

export interface ChallengeLine {
  id: string;
  body: CarBody;
  title: string;
  text: string;
  before: number;
  after: number;
  goal: number;
  /** Completed in this run. */
  done: boolean;
}

/**
 * What a finished run did for the challenges: those that moved, and those that completed. `start` is the progress
 * when the run began, `end` the progress when it ended.
 */
export function challengeReport(start: Record<string, number>, end: Record<string, number>, opened: readonly CarBody[]): ChallengeLine[] {
  const out: ChallengeLine[] = [];
  for (const c of CHALLENGES) {
    const before = start[c.id] ?? 0;
    const done = opened.includes(c.body);
    const after = done ? c.goal : Math.min(c.goal, end[c.id] ?? before);
    if (after > before || done) out.push({ id: c.id, body: c.body, title: c.title, text: progressText(c, after), before, after, goal: c.goal, done });
  }
  return out;
}
