// Settling a run: the one place where a finished run is counted into the meta progress. A run that ends by dying or
// winning pays trophies; a run given up ("Ge upp rundan") counts as a run but pays nothing, and the challenges that
// add up over runs ("Vinn en runda", "Kör klart 5 rundor") do not count it, while "best in one run" progress that was
// already earned stays. `RunState.end` guards it: a run is only ever settled once, so a reload cannot count it twice.
import { trophiesFor, unlockedTrinkets, type Meta } from './meta.ts';
import type { RunState } from './state.ts';
import { checkChallenges } from './unlocks.ts';

export interface Settled {
  meta: Meta;
  /** The same run object, with `end` filled in (a run that was settled before comes back as it was). */
  run: RunState;
}

/** Counts a run that is over (won or dead) or given up. Changes `run` (`end`, `opened`); returns the new meta. */
export function settleRun(meta: Meta, run: RunState, gaveUp = false): Settled {
  if (run.end) return { meta, run };
  const won = !gaveUp && run.status === 'won';
  const gain = gaveUp ? 0 : trophiesFor({ bossesBeaten: run.stats.bossesBeaten, won, races: run.stats.races });
  const old = meta.trophies;
  const total = old + gain;
  // the end of the run counts for the challenges that add up over runs; a given-up run only keeps what it already earned
  const chk = checkChallenges(meta, run, !gaveUp);
  const bodies = [...new Set([...run.opened, ...chk.unlocked.map((c) => c.body)])];
  const trinkets = unlockedTrinkets(total)
    .filter((t) => t.unlock > old)
    .map((t) => t.id);
  const seen = new Set(meta.seen);
  trinkets.forEach((id) => seen.add(id));
  const next: Meta = { ...chk.meta, trophies: total, runs: meta.runs + 1, wins: meta.wins + (won ? 1 : 0), bestAct: Math.max(meta.bestAct, won ? 3 : run.act + 1), seen: [...seen] };
  run.opened = bodies;
  run.end = { won, trophies: gain, total, unlockedBodies: bodies, unlockedTrinkets: trinkets, progress: { ...next.progress }, ...(gaveUp ? { gaveUp: true } : {}) };
  return { meta: next, run };
}

/** Ends a running run as given up: no trophies, a run in the count, and no screen left to resume. */
export function giveUpRun(meta: Meta, run: RunState): Settled {
  if (run.end) return { meta, run };
  run.status = 'dead';
  run.screen = null;
  return settleRun(meta, run, true);
}

/** What the next run starts with after a restart: the same vehicle, driver and paint (Söndagsåkare stays in the meta). */
export function restartPick(run: RunState): { body: RunState['car']['body']; driver: NonNullable<RunState['car']['style']['driver']>; paint: string } {
  return { body: run.car.body, driver: run.car.style.driver ?? 'human', paint: run.car.style.paint };
}
