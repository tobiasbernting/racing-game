import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CAR_BODIES, type CarBody } from '../shared/rally.ts';
import { LEGACY_BODY_UNLOCK, STARTERS, cleanMeta, defaultMeta, legacyBodies } from './meta.ts';
import { META_KEY, loadMeta, parseRun, saveMeta } from './save.ts';
import { newRun, type RunState } from './state.ts';
import { MEDALS, earned, medalById, medalCount, medalFor, medalReport, checkMedals, flawlessAct, nextMedal, progressText } from './medals.ts';

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

const run = (body: CarBody = 'hatch', calm = false): RunState => newRun({ seed: 3, calm, body, driver: 'human', paint: '#e8412c' });
const bossLog = (r: RunState, act: number, boss: 'bengt' | 'ingrid', place = 1, lost = 0): void => {
  r.log.push({ nodeId: `b${act}`, act, row: 5, type: 'boss', title: boss, lost, place, n: 4, finished: place < 9, boss });
};

describe('the medal list', () => {
  it('every vehicle that is not a starter has exactly one medal, and a starter has none', () => {
    for (const b of CAR_BODIES) {
      const n = MEDALS.filter((c) => c.body === b).length;
      expect(n, b).toBe(STARTERS.includes(b) ? 0 : 1);
    }
    expect(STARTERS).toHaveLength(5);
    expect(MEDALS).toHaveLength(CAR_BODIES.length - STARTERS.length);
  });

  it('a mix of wins and tricks, each with a goal, a title and a label', () => {
    expect(new Set(MEDALS.map((c) => c.id)).size).toBe(MEDALS.length);
    for (const c of MEDALS) {
      expect(c.goal).toBeGreaterThanOrEqual(1);
      expect(c.title.length).toBeGreaterThan(8);
      expect(c.label.length).toBeGreaterThan(5);
    }
    expect(medalFor('coupe')?.title).toBe('Vinn en runda');
    expect(medalById('takedowns')?.title).toContain('10 takedowns');
    expect(MEDALS.some((c) => c.title.includes('Söndagsåkare'))).toBe(true);
    expect(MEDALS.some((c) => c.title.includes('Sura Bengt'))).toBe(true);
    expect(MEDALS.some((c) => c.title.includes('akt 2'))).toBe(true);
  });

  it('the progress text reads like "Takedowns i en runda: 6/10"', () => {
    expect(progressText(medalById('takedowns')!, 6)).toBe('Takedowns i en runda: 6/10');
    expect(progressText(medalById('takedowns')!, 99)).toBe('Takedowns i en runda: 10/10');
  });
});

/** The steps of the five older challenges (the newer ones count things a plain run does all the time, like carrying its starting trinket). */
const OLD = ['win', 'calmAct', 'calmWin', 'takedowns', 'bengtMoped', 'flawless2'];
const oldSteps = (c: { steps: { id: string }[] }) => c.steps.filter((x) => OLD.includes(x.id));

describe('checking a run against the medals', () => {
  it('takedowns count the most in one run, and earn the monster medal at ten', () => {
    const r = run();
    r.stats.takedowns = 6;
    let c = checkMedals(defaultMeta(), r);
    expect(c.meta.progress.takedowns).toBe(6);
    expect(c.earned).toHaveLength(0);
    expect(oldSteps(c)).toEqual([{ id: 'takedowns', before: 0, after: 6 }]);
    // the next run only does 4: the best stays
    const r2 = run();
    r2.stats.takedowns = 4;
    c = checkMedals(c.meta, r2);
    expect(c.meta.progress.takedowns).toBe(6);
    expect(oldSteps(c)).toHaveLength(0);
    r2.stats.takedowns = 10;
    c = checkMedals(c.meta, r2);
    expect(c.earned.map((x) => x.body)).toEqual(['monster']);
    expect(earned(c.meta.progress, medalFor('monster')!)).toBe(true);
  });

  it('winning a run earns the sportbil medal, but only when the run ends (it adds up over runs, once)', () => {
    const r = run();
    r.status = 'won';
    let c = checkMedals(defaultMeta(), r, false);
    expect(c.earned).toHaveLength(0);
    c = checkMedals(defaultMeta(), r, true);
    expect(c.earned.map((x) => x.body)).toEqual(['coupe']);
    // a win on Söndagsåkare earns the fyrhjuling medal as well
    const calm = run('hatch', true);
    calm.status = 'won';
    expect(checkMedals(defaultMeta(), calm, true).earned.map((x) => x.body).sort()).toEqual(['atv', 'coupe']);
    // a lost run opens nothing
    const lost = run();
    lost.status = 'dead';
    expect(checkMedals(defaultMeta(), lost, true).earned).toHaveLength(0);
  });

  it('does not change the meta it is given, and gives the same meta back when nothing moved', () => {
    const m = defaultMeta();
    const r = run();
    r.trinkets = [];
    expect(checkMedals(m, r)).toMatchObject({ meta: m, steps: [], earned: [] });
    r.stats.takedowns = 3;
    checkMedals(m, r);
    expect(m.progress).toEqual({});
  });

  it('Sura Bengt has to fall to the moppe for the motorcykel; any car opens the EPA-traktor', () => {
    const car = run('hatch');
    bossLog(car, 0, 'bengt');
    expect(checkMedals(defaultMeta(), car).earned.map((x) => x.body)).toEqual(['epa']);
    const moppe = run('moped');
    bossLog(moppe, 0, 'ingrid');
    expect(checkMedals(defaultMeta(), moppe).earned).toHaveLength(0);
    bossLog(moppe, 0, 'bengt', 2);
    expect(checkMedals(defaultMeta(), moppe).earned).toHaveLength(0);
    moppe.log.pop();
    bossLog(moppe, 0, 'bengt', 1);
    expect(checkMedals(defaultMeta(), moppe).earned.map((x) => x.body).sort()).toEqual(['epa', 'moto']);
  });

  it('act 2 without losing a heart needs the boss beaten and not one heart gone in the act', () => {
    const r = run();
    r.log.push({ nodeId: 'a', act: 1, row: 1, type: 'race', title: 'x', lost: 0, place: 1, n: 4, finished: true });
    expect(flawlessAct(r, 1)).toBe(false);
    bossLog(r, 1, 'ingrid', 1, 0);
    expect(flawlessAct(r, 1)).toBe(true);
    expect(checkMedals(defaultMeta(), r).earned.map((x) => x.body)).toEqual(['sofa']);
    r.log[0]!.lost = 1;
    expect(flawlessAct(r, 1)).toBe(false);
    // hearts lost in act 1 or 3 do not count against act 2
    r.log[0]!.lost = 0;
    r.log.push({ nodeId: 'z', act: 0, row: 1, type: 'race', title: 'x', lost: 2 }, { nodeId: 'y', act: 2, row: 1, type: 'race', title: 'x', lost: 1 });
    expect(flawlessAct(r, 1)).toBe(true);
  });

  it('a medal that is already earned is not checked again', () => {
    const m = { ...defaultMeta(), progress: { takedowns: 10 } };
    const r = run();
    r.stats.takedowns = 12;
    expect(oldSteps(checkMedals(m, r))).toEqual([]);
    expect(checkMedals(m, r).earned).toEqual([]);
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

describe('the result of a run for the medals', () => {
  it('tells what moved and what opened, from the start of the run to its end', () => {
    const lines = medalReport({ takedowns: 2 }, { takedowns: 7, win: 1 }, ['coupe']);
    expect(lines.map((l) => l.id).sort()).toEqual(['takedowns', 'win']);
    const tk = lines.find((l) => l.id === 'takedowns')!;
    expect([tk.before, tk.after, tk.done]).toEqual([2, 7, false]);
    expect(tk.text).toBe('Takedowns i en runda: 7/10');
    expect(lines.find((l) => l.id === 'win')!.done).toBe(true);
    expect(medalReport({}, {}, [])).toEqual([]);
  });
});

describe('saves from before the medals: nothing is lost', () => {
  it('the vehicles the trophies had opened are medals earned, and the player keeps the vehicle they drove', () => {
    const old = { v: 1, trophies: 15, runs: 9, wins: 2, bestAct: 3, seen: [], calm: false, body: 'monster', paint: '#e8412c', driver: 'human' };
    const m = cleanMeta(old);
    for (const b of ['atv', 'coupe', 'moto', 'monster'] as const) expect(earned(m.progress, medalFor(b)!), b).toBe(true);
    expect(earned(m.progress, medalFor('sofa')!)).toBe(false);
    expect(m.body).toBe('monster');
    expect('bodies' in m).toBe(false);
  });

  it('a brand new player has no medals; the oldest trophy rule only ever knew the first ten vehicles', () => {
    expect(medalCount(cleanMeta(null).progress)).toBe(0);
    expect(medalCount(cleanMeta({ trophies: 0 }).progress)).toBe(0);
    expect(legacyBodies(0)).toEqual(STARTERS);
    expect(medalCount(cleanMeta({ trophies: 20 }).progress)).toBe(CAR_BODIES.filter((b) => b in LEGACY_BODY_UNLOCK && !STARTERS.includes(b)).length);
    expect(earned(cleanMeta({ trophies: 9999 }).progress, medalFor('kart')!)).toBe(false);
  });

  it('a save with its own list of open vehicles: each one is a medal earned, the trophies add nothing', () => {
    const m = cleanMeta({ trophies: 99, bodies: [...STARTERS, 'coupe'] });
    expect(earned(m.progress, medalFor('coupe')!)).toBe(true);
    expect(earned(m.progress, medalFor('sofa')!)).toBe(false);
    expect(earned(m.progress, medalFor('monster')!)).toBe(false);
  });

  it('half-done progress is kept as it was, and a vehicle that was open completes its medal', () => {
    const m = cleanMeta({ trophies: 3, bodies: [...STARTERS, 'monster'], progress: { takedowns: 4, coins: 60 } });
    expect(m.progress.coins).toBe(60);
    expect(m.progress.takedowns).toBe(10);
  });

  it('the first load of an old save keeps it all through a save and a load, junk is dropped', () => {
    store.setItem(META_KEY, JSON.stringify({ v: 1, trophies: 8, runs: 3, wins: 0, bestAct: 2, seen: [], calm: false, body: 'coupe', paint: '#e8412c', driver: 'human' }));
    const first = loadMeta();
    expect(earned(first.progress, medalFor('coupe')!)).toBe(true);
    saveMeta(first);
    expect(loadMeta().progress).toEqual(first.progress);
    store.setItem(META_KEY, JSON.stringify({ ...first, trophies: 0, progress: { takedowns: 4.9, nope: 3, win: 'ja' } }));
    expect(loadMeta().progress).toEqual({ takedowns: 4 });
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

describe('the next medal', () => {
  it('is the one closest to done, and null when all are earned', () => {
    expect(nextMedal({ takedowns: 8, coins: 30 })!.medal.id).toBe('takedowns');
    const all = Object.fromEntries(MEDALS.map((m) => [m.id, m.goal]));
    expect(nextMedal(all)).toBeNull();
  });
});

describe('a save in the medal format', () => {
  it('is never lifted again: trophies alone do not hand out medals on every load', () => {
    const fresh = cleanMeta({ trophies: 40, runs: 12 });
    expect(medalCount(fresh.progress)).toBe(medalCount(cleanMeta({ trophies: 40 }).progress));
    const saved = JSON.parse(JSON.stringify({ ...defaultMeta(), trophies: 40, runs: 12, progress: { takedowns: 3 } }));
    const back = cleanMeta(saved);
    expect(back.progress).toEqual({ takedowns: 3 });
    expect(back.medals).toBe(1);
    saveMeta(back);
    expect(loadMeta().progress).toEqual({ takedowns: 3 });
  });

  it('an old save is lifted once, written in the new format, and the next load adds nothing', () => {
    store.setItem(META_KEY, JSON.stringify({ v: 1, trophies: 14, bodies: [...STARTERS, 'atv'], body: 'atv' }));
    const first = loadMeta();
    expect(Object.keys(first.progress)).toEqual(['calmWin']);
    saveMeta(first);
    expect(JSON.parse(store.getItem(META_KEY)!).bodies).toBeUndefined();
    expect(Object.keys(loadMeta().progress)).toEqual(['calmWin']);
  });
});
