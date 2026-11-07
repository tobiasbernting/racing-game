// How the numbers of one race fold into the numbers of a run. Pure: no clock, no DOM.
import type { RallyResult } from '../rally/options.ts';
import type { RaceStats } from '../rally/mods.ts';
import type { RunStats } from './state.ts';

/** Stats where a run keeps the best single value instead of the sum. */
const MAX_KEYS: readonly (keyof RaceStats)[] = ['topSpeed', 'longestDrift'];

const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/** Adds a finished race to the run's stats (the race's own counters, its trinket triggers, fastest lap, podium and time). */
export function addRaceStats(st: RunStats, res: RallyResult): void {
  const rs = res.stats;
  if (rs) {
    for (const k of Object.keys(rs) as (keyof RaceStats)[]) {
      const v = finite(rs[k]);
      if (MAX_KEYS.includes(k)) st[k] = Math.max(st[k], v);
      else st[k] += v;
    }
  }
  if (res.takedowns) st.takedowns += res.takedowns;
  if (res.wrecked) st.wrecks += res.wrecked;
  const lap = finite(res.bestLap);
  if (lap > 0 && (st.bestLap === 0 || lap < st.bestLap)) st.bestLap = Math.round(lap);
  if (res.triggers) {
    for (const [id, n] of Object.entries(res.triggers)) {
      const v = finite(n);
      if (v > 0) st.triggers[id] = (st.triggers[id] ?? 0) + Math.floor(v);
    }
  }
  if (res.finished) {
    st.totalTime += finite(res.time);
    if (res.place <= 3 && res.n > 3) st.podiums++;
  }
}
