import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CAR_BODIES, type CarBody } from '../shared/rally.ts';
import { STARTERS, cleanMeta, defaultMeta, legacyBodies, unlockedBodies } from './meta.ts';
import { META_KEY, loadMeta, parseRun, saveMeta } from './save.ts';
import { newRun, type RunState } from './state.ts';
import { CHALLENGES, challengeById, challengeFor, challengeReport, checkChallenges, flawlessAct, progressText } from './unlocks.ts';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}
let store: MemoryStorage;
beforeEach(() => {
  store = new MemoryStorage();
  (globalThis as unknown as { localStorage: unknown }).localStorage = store;
});
afterEach(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

const run = (body: CarBody = 'hatch', calm = false): RunState => newRun({ seed: 3, calm, body, driver: 'human', paint: '#e8412c', trophies: 0 });
const bossLog = (r: RunState, act: number, boss: 'bengt' | 'ingrid', place = 1, lost = 0): void => {
  r.log.push({ nodeId: `b${act}`, act, row: 5, type: 'boss', title: boss, lost, place, n: 4, finished: place < 9, boss });
};

describe('the challenge list', () => {
  it('every vehicle that is not a starter has exactly one challenge, and a starter has none', () => {
    for (const b of CAR_BODIES) {
      const n = CHALLENGES.filter((c) => c.body === b).length;
      expect(n, b).toBe(STARTERS.includes(b) ? 0 : 1);
    }
    expect(STARTERS).toHaveLength(5);
    expect(CHALLENGES).toHaveLength(CAR_BODIES.length - STARTERS.length);
  });

  it('a mix of wins and tricks, each with a goal, a title and a label', () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    for (const c of CHALLENGES) {
      expect(c.goal).toBeGreaterThanOrEqual(1);
      expect(c.title.length).toBeGreaterThan(8);
      expect(c.label.length).toBeGreaterThan(5);
    }
    expect(challengeFor('coupe')?.title).toBe('Vinn en runda');
    expect(challengeById('takedowns')?.title).toContain('10 takedowns');
    expect(CHALLENGES.some((c) => c.title.includes('Söndagsåkare'))).toBe(true);
    expect(CHALLENGES.some((c) => c.title.includes('Sura Bengt'))).toBe(true);
    expect(CHALLENGES.some((c) => c.title.includes('akt 2'))).toBe(true);
  });

  it('the progress text reads like "Takedowns i en runda: 6/10"', () => {
    expect(progressText(challengeById('takedowns')!, 6)).toBe('Takedowns i en runda: 6/10');
    expect(progressText(challengeById('takedowns')!, 99)).toBe('Takedowns i en runda: 10/10');
  });
});

describe('checking a run against the challenges', () => {
  it('takedowns count the most in one run, and open the monster at ten', () => {
    const r = run();
    r.stats.takedowns = 6;
    let c = checkChallenges(defaultMeta(), r);
    expect(c.meta.progress.takedowns).toBe(6);
    expect(c.unlocked).toHaveLength(0);
    expect(c.steps).toEqual([{ id: 'takedowns', before: 0, after: 6 }]);
    // the next run only does 4: the best stays
    const r2 = run();
    r2.stats.takedowns = 4;
    c = checkChallenges(c.meta, r2);
    expect(c.meta.progress.takedowns).toBe(6);
    expect(c.steps).toHaveLength(0);
    r2.stats.takedowns = 10;
    c = checkChallenges(c.meta, r2);
    expect(c.unlocked.map((x) => x.body)).toEqual(['monster']);
    expect(unlockedBodies(c.meta)).toContain('monster');
  });

  it('winning a run opens the sportbil, but only when the run ends (it adds up over runs, once)', () => {
    const r = run();
    r.status = 'won';
    let c = checkChallenges(defaultMeta(), r, false);
    expect(c.unlocked).toHaveLength(0);
    c = checkChallenges(defaultMeta(), r, true);
    expect(c.unlocked.map((x) => x.body)).toEqual(['coupe']);
    // a win on Söndagsåkare opens the fyrhjuling as well
    const calm = run('hatch', true);
    calm.status = 'won';
    expect(checkChallenges(defaultMeta(), calm, true).unlocked.map((x) => x.body).sort()).toEqual(['atv', 'coupe']);
    // a lost run opens nothing
    const lost = run();
    lost.status = 'dead';
    expect(checkChallenges(defaultMeta(), lost, true).unlocked).toHaveLength(0);
  });

  it('does not change the meta it is given, and gives the same meta back when nothing moved', () => {
    const m = defaultMeta();
    const r = run();
    expect(checkChallenges(m, r)).toMatchObject({ meta: m, steps: [], unlocked: [] });
    r.stats.takedowns = 3;
    checkChallenges(m, r);
    expect(m.progress).toEqual({});
    expect(m.bodies).toEqual(STARTERS);
  });

  it('Sura Bengt has to fall to the moppe, not to any car', () => {
    const car = run('hatch');
    bossLog(car, 0, 'bengt');
    expect(checkChallenges(defaultMeta(), car).unlocked).toHaveLength(0);
    const moppe = run('moped');
    bossLog(moppe, 0, 'ingrid');
    expect(checkChallenges(defaultMeta(), moppe).unlocked).toHaveLength(0);
    bossLog(moppe, 0, 'bengt', 2);
    expect(checkChallenges(defaultMeta(), moppe).unlocked).toHaveLength(0);
    moppe.log.pop();
    bossLog(moppe, 0, 'bengt', 1);
    expect(checkChallenges(defaultMeta(), moppe).unlocked.map((x) => x.body)).toEqual(['moto']);
  });

  it('act 2 without losing a heart needs the boss beaten and not one heart gone in the act', () => {
    const r = run();
    r.log.push({ nodeId: 'a', act: 1, row: 1, type: 'race', title: 'x', lost: 0, place: 1, n: 4, finished: true });
    expect(flawlessAct(r, 1)).toBe(false);
    bossLog(r, 1, 'ingrid', 1, 0);
    expect(flawlessAct(r, 1)).toBe(true);
    expect(checkChallenges(defaultMeta(), r).unlocked.map((x) => x.body)).toEqual(['sofa']);
    r.log[0]!.lost = 1;
    expect(flawlessAct(r, 1)).toBe(false);
    // hearts lost in act 1 or 3 do not count against act 2
    r.log[0]!.lost = 0;
    r.log.push({ nodeId: 'z', act: 0, row: 1, type: 'race', title: 'x', lost: 2 }, { nodeId: 'y', act: 2, row: 1, type: 'race', title: 'x', lost: 1 });
    expect(flawlessAct(r, 1)).toBe(true);
  });

  it('a vehicle that is already open is not checked again', () => {
    const m = { ...defaultMeta(), bodies: [...STARTERS, 'monster' as const] };
    const r = run();
    r.stats.takedowns = 12;
    expect(checkChallenges(m, r)).toMatchObject({ steps: [], unlocked: [] });
  });

  it('takes a new entry with no other change (the next ten vehicles are more lines in the list)', () => {
    // a made-up vehicle: one more challenge in the list is all it takes
    const extra = { id: 'blodbadAtv', body: 'moto' as const, title: 'Vinn ett Blodbad med fyrhjulingen', label: 'Blodbad vunna med fyrhjulingen', goal: 1, mode: 'best' as const, measure: (r: RunState) => (r.car.body === 'atv' && r.log.some((l) => l.kind === 'carnage' && l.place === 1) ? 1 : 0) };
    expect(extra.measure(run('atv'))).toBe(0);
    const r = run('atv');
    r.log.push({ nodeId: 'q', act: 0, row: 1, type: 'race', kind: 'carnage', title: 'x', lost: 0, place: 1, n: 4, finished: true });
    expect(extra.measure(r)).toBe(1);
  });
});

describe('the result of a run for the challenges', () => {
  it('tells what moved and what opened, from the start of the run to its end', () => {
    const lines = challengeReport({ takedowns: 2 }, { takedowns: 7, win: 1 }, ['coupe']);
    expect(lines.map((l) => l.id).sort()).toEqual(['takedowns', 'win']);
    const tk = lines.find((l) => l.id === 'takedowns')!;
    expect([tk.before, tk.after, tk.done]).toEqual([2, 7, false]);
    expect(tk.text).toBe('Takedowns i en runda: 7/10');
    expect(lines.find((l) => l.id === 'win')!.done).toBe(true);
    expect(challengeReport({}, {}, [])).toEqual([]);
  });
});

describe('saves from before the challenges', () => {
  it('keep every vehicle the trophies had opened', () => {
    const old = { v: 1, trophies: 15, runs: 9, wins: 2, bestAct: 3, seen: [], calm: false, body: 'monster', paint: '#e8412c', driver: 'human' };
    const m = cleanMeta(old);
    for (const b of ['hatch', 'buggy', 'pickup', 'moped', 'atv', 'coupe', 'tractor', 'moto', 'monster'] as const) expect(m.bodies, b).toContain(b);
    expect(m.bodies).not.toContain('sofa');
    expect(m.body).toBe('monster');
    expect(m.progress).toEqual({});
  });

  it('a brand new player has the five starters; an old save with few trophies still has them too (the pickup, moppe and traktor became starters)', () => {
    expect(cleanMeta(null).bodies).toEqual(STARTERS);
    expect(cleanMeta({ trophies: 0 }).bodies).toEqual(STARTERS);
    expect(legacyBodies(0)).toEqual(STARTERS);
    expect(cleanMeta({ trophies: 20 }).bodies).toHaveLength(CAR_BODIES.length);
  });

  it('once a save has its own list, the trophies do not open vehicles any more', () => {
    const m = cleanMeta({ trophies: 99, bodies: [...STARTERS, 'coupe'] });
    expect(m.bodies).toContain('coupe');
    expect(m.bodies).not.toContain('sofa');
    expect(m.bodies).not.toContain('monster');
  });

  it('the first load of an old save writes the list, and nothing is taken away on the next load', () => {
    store.setItem(META_KEY, JSON.stringify({ v: 1, trophies: 8, runs: 3, wins: 0, bestAct: 2, seen: [], calm: false, body: 'coupe', paint: '#e8412c', driver: 'human' }));
    const first = loadMeta();
    expect(first.bodies).toContain('coupe');
    saveMeta(first);
    expect(loadMeta().bodies).toEqual(first.bodies);
    // junk in the list and in the progress is dropped, the rest kept
    store.setItem(META_KEY, JSON.stringify({ ...first, bodies: ['coupe', 'raket', 7], progress: { takedowns: 4.9, nope: 3, win: 'ja' } }));
    const back = loadMeta();
    expect(back.bodies).toEqual([...STARTERS, 'coupe'].sort((a, b) => CAR_BODIES.indexOf(a as CarBody) - CAR_BODIES.indexOf(b as CarBody)));
    expect(back.progress).toEqual({ takedowns: 4 });
  });

  it('a run saved before this phase still loads (no progress snapshot, no opened list)', () => {
    const r = JSON.parse(JSON.stringify(run()));
    delete r.chal0;
    delete r.opened;
    const back = parseRun(r)!;
    expect(back.chal0).toEqual({});
    expect(back.opened).toEqual([]);
  });
});
