import { describe, expect, it } from 'vitest';
import { chaosGift, pickReward } from '../run/flow.ts';
import { mapOf, newRun } from '../run/state.ts';
import { allNodes } from '../run/map.ts';
import { playerStats } from '../run/racesim.ts';
import { isTrinket } from '../run/trinkets.ts';
import { ACTIVE_IDS, CHAOS_EFFECTS, KITS, LEANS, PASSIVE_IDS, activeLapSave, chaosPick, chargeOf, draftTarget, kitOf, pivotDir, usesPerLap } from './abilities.ts';
import { CAR_BODIES } from './rally.ts';

describe('the vehicles\' kits', () => {
  it('every body has a lean, a passive, an active with a cooldown and a starting trinket that exists', () => {
    for (const b of CAR_BODIES) {
      const k = kitOf(b);
      expect(k.body).toBe(b);
      expect(LEANS).toContain(k.lean);
      expect(PASSIVE_IDS).toContain(k.passive.id);
      expect(ACTIVE_IDS).toContain(k.active.id);
      expect(isTrinket(k.trinket), `${b}: ${k.trinket}`).toBe(true);
      expect(k.active.name.length).toBeGreaterThan(2);
      expect(k.active.text.length).toBeGreaterThan(15);
      expect(k.passive.text.length).toBeGreaterThan(15);
    }
  });

  it('no two vehicles share an active or a passive, and the leans are spread out', () => {
    expect(new Set(CAR_BODIES.map((b) => KITS[b].active.id)).size).toBe(CAR_BODIES.length);
    expect(new Set(CAR_BODIES.map((b) => KITS[b].passive.id)).size).toBe(CAR_BODIES.length);
    for (const lean of LEANS) expect(CAR_BODIES.filter((b) => KITS[b].lean === lean).length).toBeGreaterThanOrEqual(2);
  });

  it('cooldowns allow a few uses per lap at most, never a spam', () => {
    for (const b of CAR_BODIES) {
      const cd = KITS[b].active.cooldown;
      expect(cd).toBeGreaterThanOrEqual(8);
      expect(cd).toBeLessThanOrEqual(20);
      // a lap is 40-70 s: at most three uses even for a perfect player
      expect(usesPerLap(40, cd)).toBeLessThanOrEqual(2.5);
      expect(usesPerLap(70, cd)).toBeLessThanOrEqual(2.5);
    }
  });

  it('the rammers use ram actives and the racers speed ones', () => {
    for (const b of CAR_BODIES) if (KITS[b].lean === 'ram') expect(['ram', 'speed']).toContain(KITS[b].active.ai);
    expect(KITS.monster.active.ai).toBe('ram');
    expect(KITS.tractor.active.ai).toBe('ram');
    expect(KITS.coupe.active.ai).toBe('speed');
  });

  it('a run starts with the starting trinket of its vehicle', () => {
    for (const b of CAR_BODIES) {
      const r = newRun({ seed: 5, calm: false, body: b, paint: '#e8412c' });
      expect(r.trinkets.map((t) => t.id)).toEqual([KITS[b].trinket]);
      expect(r.got[0]?.id).toBe(KITS[b].trinket);
    }
  });
});

describe('the sofa\'s passive', () => {
  it('a random trinket from the pool lands in the build, the same one for the same run and act', () => {
    const mk = () => {
      const r = newRun({ seed: 11, calm: false, body: 'sofa', paint: '#e8412c' });
      r.act = 1;
      return r;
    };
    const a = mk();
    const before = a.trinkets.reduce((n, t) => n + t.n, 0);
    const id = chaosGift(a);
    expect(id).toBeTruthy();
    expect(a.trinkets.reduce((n, t) => n + t.n, 0)).toBe(before + 1);
    expect(a.got.some((g) => g.id === id && g.from.includes('Kaosarvet'))).toBe(true);
    expect(chaosGift(mk())).toBe(id);
    const other = mk();
    other.act = 2;
    expect(typeof chaosGift(other)).toBe('string');
  });

  it('beating a boss as the sofa brings a new one into the build, beating it in anything else does not', () => {
    const afterBoss = (body: 'sofa' | 'hatch'): number => {
      let r = newRun({ seed: 21, calm: false, body, paint: '#e8412c' });
      r.trinkets = [];
      const boss = allNodes(mapOf(r)).find((n) => n.type === 'boss')!;
      r.screen = { kind: 'reward', nodeId: boss.id, choices: ['gummianka'], source: 'boss' };
      r = pickReward(r, -1);
      expect(r.act).toBe(1);
      return r.trinkets.reduce((n, t) => n + t.n, 0);
    };
    expect(afterBoss('sofa')).toBe(1);
    expect(afterBoss('hatch')).toBe(0);
  });
});

describe('the little formulas', () => {
  it('the pivot turns the way you steer, or else towards the road', () => {
    expect(pivotDir(0.8, -1)).toBe(1);
    expect(pivotDir(-0.8, 1)).toBe(-1);
    expect(pivotDir(0, 0.6)).toBe(1);
    expect(pivotDir(0, -0.6)).toBe(-1);
    expect(pivotDir(0.05, -0.6)).toBe(-1);
  });

  it('the slingshot wants a car close ahead, in the lane, and picks the nearest', () => {
    expect(draftTarget([])).toBeNull();
    expect(draftTarget([{ fwd: -5, lat: 0 }, { fwd: 30, lat: 0 }, { fwd: 8, lat: 9 }])).toBeNull();
    expect(draftTarget([{ fwd: 12, lat: 1 }, { fwd: 6, lat: -2 }])).toEqual({ fwd: 6, lat: -2 });
  });

  it('the chaos effect covers every outcome and never runs off the list', () => {
    const seen = new Set(Array.from({ length: 64 }, (_v, i) => chaosPick(i / 64)));
    expect(seen.size).toBe(CHAOS_EFFECTS.length);
    expect(CHAOS_EFFECTS).toContain(chaosPick(1));
    expect(CHAOS_EFFECTS).toContain(chaosPick(-1));
  });

  it('the charge on the button runs from empty to full', () => {
    expect(chargeOf(10, 10)).toBe(0);
    expect(chargeOf(5, 10)).toBeCloseTo(0.5);
    expect(chargeOf(0, 10)).toBe(1);
    expect(chargeOf(-3, 10)).toBe(1);
  });
});

describe('the abilities in the balance simulation', () => {
  const lapOf = (body: (typeof CAR_BODIES)[number], skill: 'poor' | 'good' = 'good'): number => {
    const r = newRun({ seed: 5, calm: false, body, paint: '#e8412c' });
    r.trinkets = [];
    return playerStats(r, { skill, aggression: 0.3 }).lap('farm');
  };
  const saved = (body: (typeof CAR_BODIES)[number]): number => {
    const r = newRun({ seed: 5, calm: false, body, paint: '#e8412c' });
    r.trinkets = [];
    const s = playerStats(r, { skill: 'good', aggression: 0.3 });
    return s.driftSaved;
  };

  it('no active saves more than a second a lap, and no passive more than one percent of it', () => {
    for (const b of CAR_BODIES) {
      expect(activeLapSave(b, 50, 1)).toBeLessThan(1);
      expect(saved(b)).toBeLessThan(2.4);
    }
    expect(activeLapSave('tractor', 50, 1)).toBeLessThan(activeLapSave('moto', 50, 1) + 0.0001);
  });

  it('a poor driver gets less out of an active than a good one', () => {
    expect(activeLapSave('moto', 50, 0.5)).toBeLessThan(activeLapSave('moto', 50, 1));
    expect(lapOf('coupe', 'poor')).toBeGreaterThan(lapOf('coupe', 'good'));
  });
});
