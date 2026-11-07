import { describe, expect, it } from 'vitest';
import { RIVAL_MODS, buildField, catchUpBoost, catchUpFor, easeOff, hazardsFor, modCount, narrowFor, partLevel, rivalSkill, runProgress, SKILL_CEILING } from './field.ts';
import { ARCHETYPES, RIVALS, rivalCast } from './rivals.ts';
import { KIND_ARCHETYPE_WEIGHT } from './rivals.ts';
import { RACE_KINDS } from './kinds.ts';

describe('rival archetypes', () => {
  it('give every one of the twelve a type, four of each', () => {
    expect(RIVALS).toHaveLength(12);
    for (const a of ARCHETYPES) expect(RIVALS.filter((r) => r.type === a)).toHaveLength(4);
  });

  it('a Rally grid is mostly racers and a Blodbad grid mostly rammers, the same seed always giving the same grid', () => {
    const count = (kind: (typeof RACE_KINDS)[number], type: string): number => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) n += rivalCast(seed, 4, kind).filter((r) => r.type === type).length;
      return n;
    };
    expect(count('rally', 'racer')).toBeGreaterThan(count('rally', 'rammer') * 2);
    expect(count('carnage', 'rammer')).toBeGreaterThan(count('carnage', 'racer') * 2);
    expect(rivalCast(9, 5, 'carnage').map((r) => r.id)).toEqual(rivalCast(9, 5, 'carnage').map((r) => r.id));
    // a longer grid starts with the shorter one, so the card and the race agree
    expect(rivalCast(9, 5, 'mixed').slice(0, 3).map((r) => r.id)).toEqual(rivalCast(9, 3, 'mixed').map((r) => r.id));
    expect(KIND_ARCHETYPE_WEIGHT.mixed.racer).toBe(1);
  });
});

describe('the scaling curve', () => {
  it('grows through the run: upgrades, skill and modifiers never go down, full upgrades in act 3', () => {
    let lv = -1;
    let sk = -1;
    for (let act = 0; act < 3; act++)
      for (let row = 0; row < 6; row++) {
        const t = runProgress(act, row);
        expect(partLevel(t, 'rival', false)).toBeGreaterThanOrEqual(lv);
        expect(rivalSkill(t, 'rival', false)).toBeGreaterThanOrEqual(sk);
        lv = partLevel(t, 'rival', false);
        sk = rivalSkill(t, 'rival', false);
      }
    console.log('curve (normal rival):', [[0, 0], [0, 4], [1, 0], [1, 4], [2, 0], [2, 2], [2, 5]].map(([a, r]) => `act${a! + 1} row${r}: parts ${partLevel(runProgress(a!, r!), 'rival', false).toFixed(2)} skill ${rivalSkill(runProgress(a!, r!), 'rival', false).toFixed(3)}`).join(' | '));
    expect(partLevel(runProgress(0, 0), 'rival', false)).toBe(0);
    expect(partLevel(runProgress(2, 2), 'rival', false)).toBeGreaterThanOrEqual(3);
    expect(rivalSkill(runProgress(2, 5), 'boss', false)).toBeLessThanOrEqual(SKILL_CEILING + 0.02);
    expect(buildField({ seed: 1, kind: 'mixed', act: 2, row: 5, role: 'boss', calm: false, ai: 3, boss: { id: 'kanin', archetype: 'racer', skill: 1.2 } }).rivals.every((r) => r.skill <= SKILL_CEILING)).toBe(true);
    // bosses and elites are a step ahead
    expect(partLevel(0.5, 'boss', false)).toBeGreaterThan(partLevel(0.5, 'elite', false));
    expect(partLevel(0.5, 'elite', false)).toBeGreaterThan(partLevel(0.5, 'rival', false));
  });

  it('calm mode scales much less', () => {
    for (const t of [0.3, 0.6, 1]) {
      expect(partLevel(t, 'rival', true)).toBeLessThan(partLevel(t, 'rival', false) * 0.5 + 0.01);
      expect(rivalSkill(t, 'rival', true)).toBeLessThan(rivalSkill(t, 'rival', false) - 0.05);
    }
    expect(catchUpFor(2, true).max).toBeLessThan(catchUpFor(2, false).max * 0.6);
  });

  it('gives ordinary rivals 0 modifiers in act 1 and 1-2 after, elites 3, and bosses more each act', () => {
    for (let row = 0; row < 5; row++) expect(modCount(0, row, 'rival', false, 0.5)).toBe(0);
    for (const act of [1, 2])
      for (let row = 0; row < 5; row++)
        for (const u of [0.1, 0.9]) {
          const n = modCount(act, row, 'rival', false, u);
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(2);
        }
    expect(modCount(1, 2, 'elite', false, 0.5)).toBe(3);
    expect(modCount(2, 2, 'elite', false, 0.5)).toBe(3);
    expect(modCount(0, 5, 'boss', false, 0.5)).toBeLessThan(modCount(1, 5, 'boss', false, 0.5));
    expect(modCount(1, 5, 'boss', false, 0.5)).toBeLessThan(modCount(2, 5, 'boss', false, 0.5));
  });
});

describe('a field for a race', () => {
  const input = { seed: 4242, kind: 'carnage' as const, act: 2, row: 3, role: 'rival' as const, calm: false, ai: 5 };

  it('is the same every time and has a kit per rival: archetype, modifiers that exist, temper by race kind', () => {
    const a = buildField(input);
    expect(buildField(input)).toEqual(a);
    expect(a.rivals).toHaveLength(5);
    for (const r of a.rivals) {
      expect(ARCHETYPES).toContain(r.archetype);
      expect(r.mods.length).toBeGreaterThanOrEqual(1);
      expect(new Set(r.mods).size).toBe(r.mods.length);
      for (const m of r.mods) expect(RIVAL_MODS.some((x) => x.id === m)).toBe(true);
      expect(r.skill).toBeLessThanOrEqual(SKILL_CEILING);
    }
    // rammers want contact, and Rally dulls it
    const rally = buildField({ ...input, kind: 'rally' });
    const rammer = (f: typeof a) => f.rivals.filter((r) => r.archetype === 'rammer').reduce((x, r) => x + r.aggro, 0) / Math.max(1, f.rivals.filter((r) => r.archetype === 'rammer').length);
    expect(rammer(a)).toBeGreaterThan(0.5);
    expect(rammer(rally)).toBeLessThan(0.3);
  });

  it('racers brake later and use the line, rammers are heavier and hit harder', () => {
    const fields = Array.from({ length: 60 }, (_, i) => buildField({ ...input, seed: i * 31 + 7, kind: 'mixed' }));
    const all = fields.flatMap((f) => f.rivals);
    const avg = (t: string, k: 'late' | 'lineUse' | 'mass' | 'ram' | 'hp'): number => {
      const l = all.filter((r) => r.archetype === t);
      return l.reduce((a, r) => a + r[k], 0) / l.length;
    };
    expect(avg('racer', 'late')).toBeGreaterThan(avg('rammer', 'late'));
    expect(avg('racer', 'lineUse')).toBeGreaterThan(avg('rammer', 'lineUse'));
    expect(avg('rammer', 'mass')).toBeGreaterThan(avg('racer', 'mass'));
    expect(avg('rammer', 'ram')).toBeGreaterThan(avg('racer', 'ram'));
    expect(avg('rammer', 'hp')).toBeGreaterThan(avg('racer', 'hp'));
  });

  it('puts the boss in the first slot with extra rules in the later acts', () => {
    const boss = { id: 'kanin', archetype: 'mixed' as const, power: 1.05, skill: 1 };
    const act1 = buildField({ ...input, act: 0, row: 5, role: 'boss', boss });
    const act3 = buildField({ ...input, act: 2, row: 5, role: 'boss', boss });
    expect(act1.rivals[0]!.boss).toBe(true);
    expect(act1.rivals[0]!.rules).toEqual([]);
    expect(act3.rivals[0]!.rules).toContain('lastlap');
    expect(act3.rivals[0]!.mods.length).toBeGreaterThan(act1.rivals[0]!.mods.length);
    expect(act3.rivals[1]!.boss).toBe(false);
  });

  it('gets harder courses later: more hazards, a narrower road, calm eases both', () => {
    const h = (a: number) => Object.values(hazardsFor(a, 'mixed', false)).reduce((x, y) => x + y, 0);
    expect(h(0)).toBe(0);
    expect(h(1)).toBeGreaterThan(h(0));
    expect(h(2)).toBeGreaterThan(h(1));
    expect(hazardsFor(2, 'carnage', false).oil).toBeGreaterThan(hazardsFor(2, 'rally', false).oil);
    expect(narrowFor(2, false)).toBeLessThan(narrowFor(1, false));
    expect(narrowFor(2, true)).toBe(1);
    expect(Object.values(hazardsFor(2, 'mixed', true)).reduce((x, y) => x + y, 0)).toBeLessThan(h(2));
  });
});

describe('catch-up', () => {
  const c = catchUpFor(2, false);
  it('only helps rivals that are far behind the player, grows with the gap and stops at a cap', () => {
    expect(catchUpBoost(10, c)).toBe(0);
    expect(catchUpBoost(c.start, c)).toBe(0);
    expect(catchUpBoost(150, c)).toBeGreaterThan(0);
    expect(catchUpBoost(250, c)).toBeGreaterThan(catchUpBoost(150, c));
    expect(catchUpBoost(5000, c)).toBeCloseTo(c.max);
  });
  it('never helps a rival that is ahead of the player: a negative gap gives nothing, and the one in front eases off a little', () => {
    expect(catchUpBoost(-50, c)).toBe(0);
    expect(catchUpBoost(-500, c)).toBe(0);
    expect(easeOff(10, c)).toBe(0);
    expect(easeOff(200, c)).toBeGreaterThan(0);
    expect(easeOff(5000, c)).toBeLessThanOrEqual(c.easeMax);
  });
  it('is bigger later in a run', () => {
    expect(catchUpFor(1, false).max).toBeGreaterThan(catchUpFor(0, false).max);
    expect(catchUpFor(2, false).max).toBeGreaterThan(catchUpFor(1, false).max);
  });
});
