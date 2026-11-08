import { describe, expect, it } from 'vitest';
import type { RallyResult } from '../rally/options.ts';
import { buyHeart, drawTrinkets, healPrice } from './economy.ts';
import { chooseEvent, continueAfterRace, enterNode, finishNode, submitRace } from './flow.ts';
import { DIFFICULTIES, DIFFS, asDifficulty, heartRuleText, trophyScale, type Difficulty } from './difficulty.ts';
import { settleRun } from './giveup.ts';
import { cleanMeta, defaultMeta } from './meta.ts';
import { parseRun } from './save.ts';
import { addTrinket, heartsLost, newRun, reachable, scrapHearts, type RunState } from './state.ts';
import { trophyReasons } from './summary.ts';
import { EVENTS } from './events.ts';
import { Rng } from './rng.ts';
import { TRINKETS } from './trinkets.ts';

const start = (diff: Difficulty, seed = 42): RunState => {
  const r = newRun({ seed, diff, body: 'hatch', paint: '#e8412c' });
  r.trinkets = [];
  r.got = [];
  return r;
};
const result = (o: Partial<RallyResult> = {}): RallyResult => ({ place: 1, n: 4, finished: true, time: 90000, laps: 2, kronor: 100, coins: 0, medal: null, damage: 0, ...o });
const goRace = (run: RunState, type = 'race'): RunState => {
  let r = run;
  for (let guard = 0; guard < 40 && r.screen?.kind !== 'prerace'; guard++) {
    if (r.screen) r = finishNode(r);
    const open = reachable(r);
    const pick = open.find((n) => n.type === type) ?? open.find((n) => n.type === 'race' || n.type === 'elite' || n.type === 'boss');
    if (!pick) throw new Error('no race');
    r = enterNode(r, pick.id);
  }
  return r;
};

/** A run standing at the pre-race card of the act 1 boss, every node before it won. */
const bossRun = (d: Difficulty): RunState => {
  // walk to the boss of act 1 by taking every node as a win
  let r = start(d);
  for (let guard = 0; guard < 200; guard++) {
    const open = reachable(r);
    if (!open.length) break;
    const boss = open.find((n) => n.type === 'boss');
    r = enterNode(r, (boss ?? open[0]!).id);
    if (boss) return r;
    r = finishNode(r.screen?.kind === 'prerace' ? continueAfterRace(submitRace(r, result())) : r);
    if (r.screen) r = finishNode(r);
  }
  throw new Error('no boss');
};

describe('the four difficulties', () => {
  it('the table: hearts, trophies, kiosk, bosses, Skrotpant', () => {
    expect(DIFFICULTIES).toEqual(['calm', 'normal', 'hard', 'one']);
    expect(DIFFICULTIES.map((d) => DIFFS[d].hearts)).toEqual([5, 3, 2, 1]);
    expect(DIFFICULTIES.map((d) => DIFFS[d].trophyMul)).toEqual([1, 1, 1.5, 2]);
    expect(DIFFICULTIES.map((d) => DIFFS[d].scrapEvery)).toEqual([4, 4, 6, 0]);
    expect(DIFFS.one.shopHearts).toBe(false);
    expect(DIFFS.hard.bossHealWin).toBe(0);
    expect(DIFFS.normal.bossHealWin).toBe(1);
    expect(DIFFS.calm.name).toBe('Söndagsåkare');
    // only Söndagsåkare has gentle rivals
    expect(DIFFICULTIES.filter((d) => DIFFS[d].gentleRivals)).toEqual(['calm']);
  });

  it('a new run starts with the hearts of its difficulty, and only Söndagsåkare is calm', () => {
    for (const d of DIFFICULTIES) {
      const r = start(d);
      expect(r.hearts).toBe(DIFFS[d].hearts);
      expect(r.maxHearts).toBe(DIFFS[d].hearts);
      expect(r.diff).toBe(d);
      expect(r.calm).toBe(d === 'calm');
    }
    expect(newRun({ seed: 1, calm: true, body: 'hatch', paint: '#e8412c' }).diff).toBe('calm');
    expect(newRun({ seed: 1, calm: false, body: 'hatch', paint: '#e8412c' }).diff).toBe('normal');
  });

  it('heart rules: Söndagsåkare is lenient, the others share the normal rules', () => {
    // Hård forgives a second place against a boss (−1), but a worse place still costs two
    expect(heartsLost(2, 4, true, 'hard', true)).toBe(1);
    expect(heartsLost(3, 4, true, 'hard', true)).toBe(2);
    expect(heartsLost(1, 4, true, 'hard', true)).toBe(0);
    for (const d of ['normal', 'hard', 'one'] as const) {
      expect(heartsLost(3, 6, true, d)).toBe(0);
      expect(heartsLost(4, 6, true, d)).toBe(1);
      expect(heartsLost(2, 6, false, d)).toBe(2);
      if (d !== 'hard') expect(heartsLost(2, 4, true, d, true)).toBe(2);
      expect(heartsLost(1, 4, true, d, true)).toBe(0);
    }
    expect(heartsLost(5, 6, true, 'calm', true)).toBe(0);
    expect(heartsLost(6, 6, true, 'calm')).toBe(1);
  });

  it('Hård survives one bad race, Ett liv does not', () => {
    const bad = result({ place: 4, n: 4 });
    const hard = submitRace(goRace(start('hard')), bad);
    expect(hard.status).toBe('running');
    expect(hard.hearts).toBe(1);
    const one = submitRace(goRace(start('one')), bad);
    expect(one.status).toBe('dead');
    expect(one.hearts).toBe(0);
  });

  it('Ett liv ends on a DNF, on a lost boss, and on the bottom half by points; a good race is fine', () => {
    expect(submitRace(goRace(start('one')), result({ place: 2, n: 4 })).status).toBe('running');
    expect(submitRace(goRace(start('one')), result({ place: 3, n: 4 })).status).toBe('dead');
    expect(submitRace(goRace(start('one')), result({ place: 2, n: 4, finished: false })).status).toBe('dead');
    // a boss race: second place is already a loss, a win is fine
    expect(submitRace(bossRun('one'), result({ place: 2, n: 4 })).status).toBe('dead');
    expect(submitRace(bossRun('one'), result({ place: 1, n: 4 })).status).toBe('running');
    expect(submitRace(bossRun('hard'), result({ place: 2, n: 4 })).hearts).toBe(1);
    expect(submitRace(bossRun('hard'), result({ place: 3, n: 4 })).status).toBe('dead');
  });

  it('a boss win heals one heart in Normal and nothing in Hård; Söndagsåkare pays two when the node ends', () => {
    const normal = bossRun('normal');
    normal.hearts = 1;
    expect(submitRace(normal, result()).hearts).toBe(2);
    const hard = bossRun('hard');
    hard.hearts = 1;
    expect(submitRace(hard, result()).hearts).toBe(1);
    const calm = bossRun('calm');
    calm.hearts = 1;
    const after = submitRace(calm, result());
    expect(after.hearts).toBe(1);
    expect(finishNode(after.screen?.kind === 'postrace' ? after : after).hearts).toBe(3);
  });

  it('the kiosk: Hård asks 50 percent more, Ett liv sells no hearts', () => {
    const n = start('normal');
    const h = start('hard');
    expect(healPrice(h)).toBeGreaterThanOrEqual(healPrice(n) * 1.45);
    expect(healPrice(h)).toBeLessThanOrEqual(healPrice(n) * 1.55);
    const shopped = (r: RunState): RunState => {
      const c = structuredClone(r);
      c.screen = { kind: 'shop', nodeId: 'x', stock: [], rerolls: 0, healed: false, repaired: false };
      c.kronor = 999;
      return c;
    };
    h.hearts = 1;
    const hard = shopped(h);
    expect(buyHeart(hard)).toBe('ok');
    const one = shopped(start('one'));
    one.hearts = 0;
    one.maxHearts = 2;
    expect(buyHeart(one)).toBe('nothing');
    expect(one.hearts).toBe(0);
  });

  it('Skrotpant: every 4th wreck, every 6th in Hård, never in Ett liv', () => {
    expect(scrapHearts(3, 4)).toBe(1);
    expect(scrapHearts(3, 4, DIFFS.hard.scrapEvery)).toBe(0);
    expect(scrapHearts(5, 6, DIFFS.hard.scrapEvery)).toBe(1);
    expect(scrapHearts(0, 40, DIFFS.one.scrapEvery)).toBe(0);
    for (const [d, td, back] of [['normal', 4, 1], ['hard', 4, 0], ['hard', 6, 1], ['one', 8, 0]] as const) {
      const r = goRace(start(d));
      r.hearts = Math.max(0, DIFFS[d].hearts - 1);
      if (d === 'one') r.maxHearts = 2; // pretend there is room, to see that nothing is paid
      const after = submitRace(r, result({ takedowns: td }));
      expect(after.hearts - r.hearts, `${d} ${td}`).toBe(back);
    }
  });

  it('heart trinkets pay kronor in Ett liv and are never offered; elsewhere they add a heart', () => {
    const one = start('one');
    addTrinket(one, 'hjartekudde');
    expect(one.maxHearts).toBe(1);
    expect(one.hearts).toBe(1);
    expect(one.kronor).toBeGreaterThan(0);
    const hard = start('hard');
    addTrinket(hard, 'hjartekudde');
    expect(hard.maxHearts).toBe(3);
    expect(hard.hearts).toBe(3);
    expect(hard.kronor).toBe(0);
    const heartIds = TRINKETS.filter((t) => t.perk?.maxHearts).map((t) => t.id);
    expect(heartIds.length).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) for (const id of drawTrinkets(start('one'), new Rng(i), 12, 'shop')) expect(heartIds).not.toContain(id);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) for (const id of drawTrinkets(start('hard'), new Rng(i), 12, 'shop')) seen.add(id);
    expect(heartIds.some((id) => seen.has(id))).toBe(true);
  });

  it('events that heal give kronor in Ett liv, and a lost heart never kills there', () => {
    const heal = EVENTS.find((e) => e.choices.some((c) => c.outcomes.some((o) => o.fx.some((f) => f.k === 'heart' && f.n > 0))))!;
    const idx = heal.choices.findIndex((c) => c.outcomes.some((o) => o.fx.some((f) => f.k === 'heart' && f.n > 0)));
    for (let seed = 1; seed < 30; seed++) {
      const r = start('one', seed);
      const node = reachable(r)[0]!;
      let e = enterNode(r, node.id);
      e = { ...e, kronor: 100, screen: { kind: 'event', nodeId: node.id, eventId: heal.id, outcome: null } };
      const done = chooseEvent(e, idx);
      expect(done.hearts).toBe(1);
      expect(done.status).toBe('running');
    }
  });

  it('trophies: Normal x1, Hård x1,5, Ett liv x2, and the reasons add up', () => {
    expect(trophyScale('normal', 7)).toBe(7);
    expect(trophyScale('calm', 7)).toBe(7);
    expect(trophyScale('hard', 7)).toBe(11); // 10,5 rounds up
    expect(trophyScale('one', 7)).toBe(14);
    expect(trophyScale('one', 0)).toBe(0);
    for (const d of DIFFICULTIES) {
      const r = start(d);
      r.status = 'dead';
      r.stats.bossesBeaten = 2;
      r.stats.races = 12;
      const s = settleRun(defaultMeta(), r);
      const base = 2 * 2 + 1;
      expect(s.run.end?.trophies).toBe(trophyScale(d, base));
      expect(s.meta.trophies).toBe(trophyScale(d, base));
      expect(trophyReasons(r, false).reduce((a, x) => a + x.n, 0)).toBe(trophyScale(d, base));
    }
    const given = start('one');
    given.stats.bossesBeaten = 1;
    expect(settleRun(defaultMeta(), given, true).run.end?.trophies).toBe(0);
  });

  it('the best act and the wins are remembered for each difficulty', () => {
    let meta = defaultMeta();
    const a = start('hard');
    a.act = 1;
    a.status = 'dead';
    meta = settleRun(meta, a).meta;
    const w = start('hard', 5);
    w.act = 2;
    w.status = 'won';
    meta = settleRun(meta, w).meta;
    const o = start('one', 6);
    o.status = 'dead';
    meta = settleRun(meta, o).meta;
    expect(meta.best.hard).toEqual({ act: 3, wins: 1 });
    expect(meta.best.one).toEqual({ act: 1, wins: 0 });
    expect(meta.best.normal).toEqual({ act: 0, wins: 0 });
    expect(cleanMeta(JSON.parse(JSON.stringify(meta))).best).toEqual(meta.best);
  });
});

describe('old saves', () => {
  it('meta: calm true is Söndagsåkare, anything else Normal; a stored difficulty wins', () => {
    expect(cleanMeta({ calm: true }).diff).toBe('calm');
    expect(cleanMeta({ calm: false }).diff).toBe('normal');
    expect(cleanMeta({}).diff).toBe('normal');
    expect(cleanMeta({ diff: 'one', calm: true }).diff).toBe('one');
    expect(cleanMeta({ diff: 'nonsense' }).diff).toBe('normal');
    expect(cleanMeta({ best: 'junk' }).best).toEqual(defaultMeta().best);
  });

  it('a run in progress keeps its mode and its hearts', () => {
    const base = JSON.parse(JSON.stringify(start('normal')));
    delete base.diff;
    const calm = parseRun({ ...base, calm: true, hearts: 4 })!;
    expect(calm.diff).toBe('calm');
    expect(calm.calm).toBe(true);
    expect(calm.maxHearts).toBe(5);
    expect(calm.hearts).toBe(4);
    const normal = parseRun({ ...base, calm: false, hearts: 2 })!;
    expect(normal.diff).toBe('normal');
    expect(normal.maxHearts).toBe(3);
    expect(normal.hearts).toBe(2);
    for (const d of DIFFICULTIES) {
      const back = parseRun(JSON.parse(JSON.stringify(start(d))))!;
      expect(back.diff).toBe(d);
      expect(back.maxHearts).toBe(DIFFS[d].hearts);
      expect(back.calm).toBe(d === 'calm');
    }
    // a hearts count above the difficulty's most is cut down
    expect(parseRun({ ...JSON.parse(JSON.stringify(start('one'))), hearts: 5 })!.hearts).toBe(1);
  });

  it('asDifficulty reads the old boolean', () => {
    expect(asDifficulty(true)).toBe('calm');
    expect(asDifficulty(false)).toBe('normal');
    expect(asDifficulty(undefined)).toBe('normal');
    expect(asDifficulty('hard')).toBe('hard');
  });
});

describe('the heart rule on the pre-race card', () => {
  const ctx = { boss: false, arena: false, carnage: false };
  it('matches the difficulty', () => {
    expect(heartRuleText('calm', ctx)).toContain('Sist eller bryter');
    expect(heartRuleText('normal', ctx)).toContain('nedre halvan');
    expect(heartRuleText('normal', ctx)).toContain('−❤️❤️');
    expect(heartRuleText('normal', { ...ctx, boss: true })).toContain('Vinn och få ❤️ tillbaka');
    expect(heartRuleText('hard', { ...ctx, boss: true })).not.toContain('Vinn och få');
    expect(heartRuleText('hard', { ...ctx, boss: true })).toContain('tvåa');
    expect(heartRuleText('hard', { ...ctx, boss: true })).toContain('Inget hjärta tillbaka');
    for (const c of [ctx, { ...ctx, carnage: true }, { ...ctx, arena: true }, { ...ctx, boss: true }, { ...ctx, boss: true, arena: true }]) {
      const t = heartRuleText('one', c);
      expect(t).toContain('Ett liv');
      expect(t).toContain('slut');
    }
    expect(heartRuleText('one', { ...ctx, carnage: true })).toContain('på poäng');
    expect(heartRuleText('one', { ...ctx, arena: true })).toContain('åker du ut');
    expect(heartRuleText('hard', { ...ctx, carnage: true })).toContain('på poäng');
  });
});
