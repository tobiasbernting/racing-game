// Medals (Medaljer): achievements, a mix of wins and tricks ("Vinn en runda", "Gör 10 takedowns i en runda"). They
// lock nothing: every vehicle and every talisman is open from the first launch, a medal is a thing to brag about in
// Skrytlådan. Each entry is data: a name, a goal, and how to measure one run towards it. Progress lives in the meta
// save (by medal id, the same ids the old challenges had, so old progress is the new medal progress) and is checked
// while a run goes on (after every step, for the "best in one run" kind) and when it ends (for the kind that adds up
// over runs). `body` is the vehicle the medal used to open; it is only kept to read old saves.
import type { CarBody } from '../shared/rally.ts';
import type { Meta } from './meta.ts';
import type { RunState } from './state.ts';

export interface Medal {
  id: string;
  /** The medal's name on the shelf, and its picture. */
  name: string;
  emoji: string;
  /** The vehicle it used to open (old saves, and the medal's picture). */
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
/** The boss of this act (0 = akt 1) beaten: first place in its race. Whoever the seed picked, it is the act's boss. */
const bossWon = (r: RunState, act: number): boolean => r.log.some((l) => l.type === 'boss' && l.act === act && l.finished === true && l.place === 1);

/**
 * Medals that were renamed when the bosses changed (Sura Bengt and Frost-Frida left; the act's boss is picked from a pool now).
 * An old save's progress under the old id counts under the new one.
 */
export const MEDAL_RENAMES: Readonly<Record<string, string>> = { bengtMoped: 'boss1Moped', bengt: 'boss1', frida: 'boss2' };

/** Act 2 won without losing a heart in it: the act's boss beaten, and none of its nodes cost one. */
export function flawlessAct(r: RunState, act: number): boolean {
  const boss = r.log.some((l) => l.act === act && l.type === 'boss' && l.finished === true && l.place === 1);
  return boss && r.log.filter((l) => l.act === act).every((l) => l.lost === 0);
}

/** Every medal. */
export const MEDALS: readonly Medal[] = [
  { id: 'win', name: 'Rundvinnaren', emoji: '🏆', body: 'coupe', title: 'Vinn en runda', label: 'Vunna rundor', goal: 1, mode: 'total', measure: (r) => (won(r) ? 1 : 0) },
  { id: 'calmWin', name: 'Söndagsvinnaren', emoji: '🛋️', body: 'atv', title: 'Vinn en runda på Söndagsåkare', label: 'Vunna rundor på Söndagsåkare', goal: 1, mode: 'total', measure: (r) => (won(r) && r.calm ? 1 : 0) },
  { id: 'takedowns', name: 'Krossmästaren', emoji: '💥', body: 'monster', title: 'Gör 10 takedowns i en runda', label: 'Takedowns i en runda', goal: 10, mode: 'best', measure: (r) => r.stats.takedowns },
  { id: 'boss1Moped', name: 'Moppen mot bossen', emoji: '🛵', body: 'moto', title: 'Slå akt 1-bossen med moppen', label: 'Akt 1-bossen slagen med moppen', goal: 1, mode: 'best', measure: (r) => (r.car.body === 'moped' && bossWon(r, 0) ? 1 : 0) },
  // phase 10: three of these are easy for a ten-year-old (the golf cart on Söndagsåkare, the camper by playing, the mower by pressing the button)
  { id: 'boss1', name: 'Tävlingsstoppet', emoji: '🏁', body: 'epa', title: 'Slå en akt 1-boss (Torsten, Göran eller Tina)', label: 'Akt 1-bossen slagen', goal: 1, mode: 'best', measure: (r) => (bossWon(r, 0) ? 1 : 0) },
  { id: 'coins', name: 'Myntsamlaren', emoji: '🪙', body: 'icecream', title: 'Samla 150 mynt i en runda', label: 'Mynt i en runda', goal: 150, mode: 'best', measure: (r) => r.stats.coins },
  { id: 'hoard', name: 'Talismansamlaren', emoji: '🎒', body: 'garbage', title: 'Samla ihop 12 talismaner i en runda', label: 'Talismaner i väskan', goal: 12, mode: 'best', measure: (r) => r.trinkets.reduce((a, t) => a + t.n, 0) },
  { id: 'boss2', name: 'Bollbesegraren', emoji: '⚽', body: 'snowmobile', title: 'Slå en akt 2-boss (Freddie, Mats eller Berit)', label: 'Akt 2-bossen slagen', goal: 1, mode: 'best', measure: (r) => (bossWon(r, 1) ? 1 : 0) },
  { id: 'drift', name: 'Sladdkungen', emoji: '🌀', body: 'kart', title: 'Sladda i 40 sekunder i en runda', label: 'Sekunder i sladd', goal: 40, mode: 'best', measure: (r) => Math.floor(r.stats.driftSeconds) },
  { id: 'calmAct2', name: 'Söndagsäventyraren', emoji: '🗺️', body: 'golf', title: 'Kom till akt 2 på Söndagsåkare', label: 'Akt 2 nådd på Söndagsåkare', goal: 1, mode: 'best', measure: (r) => (r.calm && r.act >= 1 ? 1 : 0) },
  { id: 'abilityUses', name: 'Knappnötaren', emoji: '🔘', body: 'mower', title: 'Använd fordonets förmåga 20 gånger i en runda', label: 'Förmågor i en runda', goal: 20, mode: 'best', measure: (r) => r.stats.abilityUses },
  { id: 'runs5', name: 'Veteranen', emoji: '🎖️', body: 'camper', title: 'Kör klart 5 rundor', label: 'Avslutade rundor', goal: 5, mode: 'total', measure: () => 1 },
  { id: 'spend', name: 'Storspenderaren', emoji: '💸', body: 'limo', title: 'Spendera 900 kronor i en runda', label: 'Kronor spenderade i en runda', goal: 900, mode: 'best', measure: (r) => r.stats.kronorSpent },
  { id: 'cartWin', name: 'Långsamt men säkert', emoji: '🐌', body: 'cart', title: 'Vinn en runda med moppen eller traktorn', label: 'Vunna rundor med moppen eller traktorn', goal: 1, mode: 'total', measure: (r) => (won(r) && (r.car.body === 'moped' || r.car.body === 'tractor') ? 1 : 0) },
  { id: 'flawless2', name: 'Helt orörd', emoji: '✨', body: 'sofa', title: 'Vinn akt 2 utan att tappa ett hjärta', label: 'Akt 2 utan förlorade hjärtan', goal: 1, mode: 'best', measure: (r) => (flawlessAct(r, 1) ? 1 : 0) },
];

export const medalFor = (body: CarBody): Medal | undefined => MEDALS.find((c) => c.body === body);
export const medalById = (id: string): Medal | undefined => MEDALS.find((c) => c.id === id);
/** Is the goal reached? */
export const earned = (progress: Readonly<Record<string, number>>, m: Medal): boolean => (progress[m.id] ?? 0) >= m.goal;
/** How many medals the progress has earned. */
export const medalCount = (progress: Readonly<Record<string, number>>): number => MEDALS.filter((m) => earned(progress, m)).length;

/** "Takedowns i en runda: 6/10" */
export const progressText = (c: Medal, have: number): string => `${c.label}: ${Math.min(c.goal, have)}/${c.goal}`;

export interface ProgressStep {
  id: string;
  before: number;
  after: number;
}

export interface CheckResult {
  /** The meta with the new progress (the input is left alone). */
  meta: Meta;
  /** Medals whose number went up. */
  steps: ProgressStep[];
  /** Medals earned by this check. */
  earned: Medal[];
}

/**
 * Checks every medal not yet earned against a run. `ended` is true once, when the run is over: only then do the
 * `total` medals count it (so a reload or a second check never counts a run twice).
 */
export function checkMedals(meta: Meta, run: RunState, ended = false): CheckResult {
  const progress = { ...meta.progress };
  const steps: ProgressStep[] = [];
  const got: Medal[] = [];
  for (const c of MEDALS) {
    const before = progress[c.id] ?? 0;
    if (before >= c.goal) continue;
    const v = Math.max(0, c.measure(run));
    const after = Math.min(c.goal, c.mode === 'best' ? Math.max(before, v) : before + (ended ? v : 0));
    if (after !== before) {
      progress[c.id] = after;
      steps.push({ id: c.id, before, after });
    }
    if (after >= c.goal) got.push(c);
  }
  if (!steps.length) return { meta, steps, earned: got };
  return { meta: { ...meta, progress }, steps, earned: got };
}

export interface MedalLine {
  id: string;
  name: string;
  body: CarBody;
  title: string;
  text: string;
  before: number;
  after: number;
  goal: number;
  /** Earned in this run. */
  done: boolean;
}

/**
 * What a finished run did for the medals: those that moved, and those that were earned. `start` is the progress
 * when the run began, `end` the progress when it ended, `got` the medals' vehicles earned during it.
 */
export function medalReport(start: Record<string, number>, end: Record<string, number>, got: readonly CarBody[]): MedalLine[] {
  const out: MedalLine[] = [];
  for (const c of MEDALS) {
    const before = start[c.id] ?? 0;
    const done = got.includes(c.body);
    const after = done ? c.goal : Math.min(c.goal, end[c.id] ?? before);
    if (after > before || done) out.push({ id: c.id, name: c.name, body: c.body, title: c.title, text: progressText(c, after), before, after, goal: c.goal, done });
  }
  return out;
}

/** The medal closest to being earned (the biggest share done, at least a start on it), for "Nästa medalj". */
export function nextMedal(progress: Readonly<Record<string, number>>): { medal: Medal; have: number } | null {
  let best: { medal: Medal; have: number; k: number } | null = null;
  for (const m of MEDALS) {
    if (earned(progress, m)) continue;
    const have = Math.min(m.goal, progress[m.id] ?? 0);
    const k = have / m.goal;
    if (!best || k > best.k) best = { medal: m, have, k };
  }
  return best ? { medal: best.medal, have: best.have } : null;
}
