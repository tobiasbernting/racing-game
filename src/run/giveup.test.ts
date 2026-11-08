import { describe, expect, it } from 'vitest';
import { giveUpRun, restartPick, settleRun } from './giveup.ts';
import { defaultMeta } from './meta.ts';
import { parseRun } from './save.ts';
import { newRun, type RunState } from './state.ts';
import { verdictOf } from './summary.ts';

const run = (o: Partial<{ calm: boolean; body: 'hatch' | 'moped'; paint: string }> = {}): RunState => {
  const r = newRun({ seed: 7, calm: o.calm ?? false, body: o.body ?? 'hatch', paint: o.paint ?? '#e8412c' });
  r.act = 1;
  r.stats.bossesBeaten = 1;
  r.stats.races = 5;
  return r;
};

describe('giving a run up', () => {
  it('counts as a run, pays no trophies, no win', () => {
    const m = defaultMeta();
    const r = run();
    const s = giveUpRun(m, r);
    expect(s.meta.runs).toBe(1);
    expect(s.meta.wins).toBe(0);
    expect(s.meta.trophies).toBe(0);
    expect(s.run.end).toMatchObject({ gaveUp: true, won: false, trophies: 0, total: 0 });
    expect(s.run.screen).toBeNull();
    expect(s.meta.bestAct).toBe(2);
  });

  it('keeps best-mode progress already earned, but counts no total-mode challenge', () => {
    const m = defaultMeta();
    const r = run();
    r.stats.takedowns = 6;
    r.stats.coins = 40;
    const s = giveUpRun(m, r);
    expect(s.meta.progress.takedowns).toBe(6);
    expect(s.meta.progress.coins).toBe(40);
    expect(s.meta.progress.win).toBeUndefined();
    expect(s.meta.progress.runs5).toBeUndefined();
  });

  it('a won run that is settled normally still pays out', () => {
    const r = run();
    r.status = 'won';
    const s = settleRun(defaultMeta(), r);
    expect(s.meta.trophies).toBeGreaterThan(0);
    expect(s.meta.progress.win).toBe(1);
    expect(s.meta.progress.runs5).toBe(1);
  });

  it('cannot be counted twice, not even after a reload', () => {
    const r = run();
    const a = giveUpRun(defaultMeta(), r);
    const b = giveUpRun(a.meta, a.run);
    expect(b.meta).toBe(a.meta);
    const reloaded = parseRun(JSON.parse(JSON.stringify(a.run)));
    expect(reloaded?.end?.gaveUp).toBe(true);
    const c = settleRun(a.meta, reloaded!);
    expect(c.meta.runs).toBe(1);
  });

  it('says so in the verdict', () => {
    const s = giveUpRun(defaultMeta(), run());
    const v = verdictOf(s.run);
    expect(v.won).toBe(false);
    expect(v.where).toMatch(/^Gav upp i Akt 2/);
  });

  it('the next run starts with the same vehicle, paint and helmet', () => {
    const r = run({ body: 'moped', paint: '#e8412c' });
    expect(restartPick(r)).toEqual({ diff: 'normal', body: 'moped', paint: '#e8412c', helmet: 'stripe', helmetColor: '' });
    const m = { ...defaultMeta(), diff: 'calm' as const };
    expect(giveUpRun(m, r).meta.diff).toBe('calm');
  });
});
