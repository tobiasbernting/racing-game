import { describe, expect, it } from 'vitest';
import { CAR_BODIES } from '../shared/rally.ts';
import { actMap } from './map.ts';
import { playRun, profile } from './bot.ts';
import { cleanMeta, defaultMeta } from './meta.ts';
import { MEDALS } from './medals.ts';
import { drawTrinkets, makeStock, rewardOffer } from './economy.ts';
import { Rng, newSeed } from './rng.ts';
import { SEED_COUNT, SEED_WORDS, parseSeedCode, randomSeed, seedCode, seedFromParts, seedLabelOf } from './seedcode.ts';
import { newRun } from './state.ts';
import { TRINKETS } from './trinkets.ts';

describe('seed codes', () => {
  it('the words are plain A-Z, unique and plenty', () => {
    expect(SEED_WORDS.length).toBeGreaterThanOrEqual(64);
    expect(new Set(SEED_WORDS).size).toBe(SEED_WORDS.length);
    for (const w of SEED_WORDS) expect(w, w).toMatch(/^[A-Z]{3,9}$/);
    expect(SEED_COUNT).toBe(SEED_WORDS.length * 10000);
  });

  it('has the format WORD-1234 and round-trips every word at the edges and at random', () => {
    expect(seedCode(seedFromParts(0, 4821))).toBe('KOSSA-4821');
    expect(seedCode(1)).toBe('KOSSA-0000');
    expect(seedCode(SEED_COUNT)).toBe(`${SEED_WORDS[SEED_WORDS.length - 1]}-9999`);
    for (let w = 0; w < SEED_WORDS.length; w++) for (const d of [0, 7, 4821, 9999]) {
      const seed = seedFromParts(w, d);
      const code = seedCode(seed)!;
      expect(code).toMatch(/^[A-Z]+-\d{4}$/);
      const back = parseSeedCode(code);
      expect(back).toEqual({ ok: true, seed, code });
    }
    const rg = new Rng(5);
    for (let i = 0; i < 500; i++) {
      const seed = randomSeed(rg.float());
      expect(parseSeedCode(seedCode(seed)!)).toMatchObject({ ok: true, seed });
    }
  });

  it('every new run gets a seed that has a code', () => {
    for (let i = 0; i < 50; i++) expect(seedCode(newSeed())).not.toBeNull();
    expect(randomSeed(0)).toBe(1);
    expect(randomSeed(0.999999999)).toBeLessThanOrEqual(SEED_COUNT);
  });

  it('reads what people type: any case, any separator, spaces round it', () => {
    for (const t of ['kossa-4821', 'KOSSA 4821', '  Kossa–4821 ', 'kossa4821', 'KOSSA_4821']) expect(parseSeedCode(t), t).toMatchObject({ ok: true, code: 'KOSSA-4821' });
  });

  it('turns wrong input into a friendly message, never a run', () => {
    for (const t of ['', '   ', '4821', 'KOSSA', 'KOSSA-48', 'KOSSA-48211', 'NOSUCHWORD-1234', '!!!', 'KOSSA-12ab']) {
      const r = parseSeedCode(t);
      expect(r.ok, t).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(10);
    }
    const unknown = parseSeedCode('ZZZZZ-1234');
    expect(!unknown.ok && unknown.message).toContain('ZZZZZ');
  });

  it('a seed from before the codes (or out of range) has no code and keeps the old label', () => {
    expect(seedCode(0)).toBeNull();
    expect(seedCode(SEED_COUNT + 1)).toBeNull();
    expect(seedCode(2.5)).toBeNull();
    expect(seedLabelOf(3_000_000_000)).toBe((3_000_000_000).toString(36).toUpperCase());
  });
});

/** A meta as a player who has done everything, and one who has done nothing. */
const richMeta = () => {
  const m = cleanMeta({ trophies: 9999, runs: 500, wins: 200, bestAct: 3, seen: TRINKETS.map((t) => t.id), body: 'sofa', progress: Object.fromEntries(MEDALS.map((x) => [x.id, x.goal])) });
  return m;
};

describe('the same code and difficulty make the same run, whatever the meta', () => {
  const seed = parseSeedCode('TRAKTOR-0042');
  if (!seed.ok) throw new Error('bad test seed');

  it('maps, courses and variants do not depend on the meta (nothing in the meta goes into a map)', () => {
    for (let act = 0; act < 3; act++) expect(actMap(seed.seed, act)).toEqual(actMap(seed.seed, act));
  });

  it('a new run, its shop stock, rewards, upgrade offers and event come out identical for two very different metas', () => {
    const poor = defaultMeta();
    const rich = richMeta();
    for (const diff of ['calm', 'normal', 'hard', 'one'] as const) {
      const mk = (m: typeof poor) => newRun({ seed: seed.seed, diff, body: 'hatch', paint: '#e8412c', progress: m.progress });
      const a = mk(poor);
      const b = mk(rich);
      // the one thing of the meta a run keeps is the medal snapshot, only to tell afterwards what the run moved
      const { chal0: _a, ...ra } = a;
      const { chal0: _b, ...rb } = b;
      expect(rb).toEqual(ra);
      expect(makeStock(b, 'n1', 0)).toEqual(makeStock(a, 'n1', 0));
      expect(rewardOffer(b, 'n1', 'boss')).toEqual(rewardOffer(a, 'n1', 'boss'));
      expect(rewardOffer(b, 'n1', 'normal')).toEqual(rewardOffer(a, 'n1', 'normal'));
      expect(drawTrinkets(b, new Rng(9), 6, 'shop')).toEqual(drawTrinkets(a, new Rng(9), 6, 'shop'));
    }
  });

  it('a whole played run is identical for two metas (races, hearts, kronor, the build, the log)', () => {
    for (const diff of ['normal', 'hard'] as const) {
      const a = playRun(seed.seed, profile('good', 'mixed'), diff, defaultMeta().progress);
      const b = playRun(seed.seed, profile('good', 'mixed'), diff, richMeta().progress);
      const strip = (r: typeof a.run) => ({ ...r, chal0: undefined });
      expect(strip(b.run)).toEqual(strip(a.run));
      expect(b.races).toEqual(a.races);
    }
  });

  it('every vehicle starts a run from a typed code, nothing is locked', () => {
    for (const body of CAR_BODIES) {
      const r = newRun({ seed: seed.seed, diff: 'normal', body, paint: '#e8412c' });
      expect(r.car.body).toBe(body);
      expect(r.trinkets.length).toBe(1);
    }
  });

  it('different codes make different runs', () => {
    const other = parseSeedCode('TRAKTOR-0043');
    if (!other.ok) throw new Error('bad');
    expect(actMap(other.seed, 0)).not.toEqual(actMap(seed.seed, 0));
  });
});
