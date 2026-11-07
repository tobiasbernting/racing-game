// Balance checks on the pure run logic: a made-up player of a given skill walks whole runs (no trinket help at
// all, which is the worst case), and the win rates must stay in the right ballpark.
import { describe, expect, it } from 'vitest';
import type { RallyResult } from '../rally/options.ts';
import { buyHeart, buyTrinket, healPrice, trinketPrice } from './economy.ts';
import { choiceAllowed, EVENTS } from './events.ts';
import { chooseEvent, continueAfterRace, currentPlan, enterNode, finishNode, pickReward, submitRace } from './flow.ts';
import { Rng } from './rng.ts';
import { costsHeart, newRun, reachable, type RunState } from './state.ts';
import { racePrize } from '../shared/rally.ts';

/** Placing from a skill exponent: 1 places at random, more piles up on first place, less on last. */
function place(skill: number, n: number, u: number): number {
  return 1 + Math.min(n - 1, Math.floor(n * Math.pow(u, skill)));
}

function playRun(seed: number, skill: number, calm: boolean): RunState {
  const rng = new Rng(seed * 7919 + 13);
  let run = newRun({ seed, calm, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 0 });
  for (let guard = 0; guard < 400 && run.status === 'running'; guard++) {
    if (!run.screen) {
      const opts = reachable(run);
      // prefer shops when hurt, otherwise anything
      const pick = (run.hearts < run.maxHearts ? opts.find((o) => o.type === 'shop') : undefined) ?? opts[Math.floor(rng.float() * opts.length)]!;
      run = enterNode(run, pick.id);
      continue;
    }
    const s = run.screen;
    switch (s.kind) {
      case 'prerace': {
        const plan = currentPlan(run)!;
        const n = plan.rules.ai + 1;
        const pl = place(skill, n, rng.float());
        const prize = racePrize(plan.rules, pl, n);
        const res: RallyResult = { place: pl, n, finished: true, time: 90000, laps: plan.rules.laps, kronor: prize, coins: 25, medal: null, damage: 0 };
        run = submitRace(run, res);
        break;
      }
      case 'postrace':
        run = continueAfterRace(run);
        break;
      case 'reward':
        run = pickReward(run, 0);
        break;
      case 'shop': {
        const c = structuredClone(run);
        if (c.hearts < c.maxHearts) buyHeart(c);
        for (let i = 0; i < 5; i++) if (c.kronor >= trinketPrice(c, c.screen && c.screen.kind === 'shop' ? (c.screen.stock[i]?.id ?? '') : '') + 60) buyTrinket(c, i);
        run = finishNode(c);
        break;
      }
      case 'event': {
        if (!s.outcome) {
          const ev = EVENTS.find((e) => e.id === s.eventId)!;
          const idx = ev.choices.findIndex((ch) => choiceAllowed(run, ch));
          run = chooseEvent(run, Math.max(0, idx));
        } else run = finishNode(run);
        break;
      }
      default:
        run = finishNode(run);
    }
  }
  return run;
}

const winRate = (skill: number, calm: boolean, runs = 150): number => {
  let w = 0;
  for (let i = 0; i < runs; i++) if (playRun(1000 + i, skill, calm).status === 'won') w++;
  return w / runs;
};

describe('balance', () => {
  it('a good player usually wins, one who places at random sometimes, a hopeless one almost never', () => {
    const good = winRate(2.2, false);
    const average = winRate(1, false);
    const poor = winRate(0.2, false);
    console.log('win rates (normal): good', good, 'average', average, 'poor', poor);
    expect(good).toBeGreaterThan(0.6);
    expect(average).toBeGreaterThan(0.3);
    expect(average).toBeLessThan(0.8);
    expect(poor).toBeLessThan(0.15);
    expect(good).toBeGreaterThan(average);
  });

  it('lugnt läge is very forgiving', () => {
    const avgNormal = winRate(1, false);
    const avgCalm = winRate(1, true);
    const poorCalm = winRate(0.2, true);
    console.log('win rates (calm): average', avgCalm, 'poor', poorCalm, 'vs normal average', avgNormal);
    expect(avgCalm).toBeGreaterThan(avgNormal);
    expect(avgCalm).toBeGreaterThan(0.75);
    expect(poorCalm).toBeGreaterThan(0.3);
  });

  it('calm only costs a heart for a DNF or dead last', () => {
    expect(costsHeart(5, 6, true, true)).toBe(false);
    expect(costsHeart(6, 6, true, true)).toBe(true);
    expect(costsHeart(2, 4, false, true)).toBe(true);
  });

  it('a heart costs about one race of pay, a quarter less on the last one, and prices grow slower than pay', () => {
    const run = newRun({ seed: 1, calm: false, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 0 });
    const mid = racePrize({ ...planRace(), laps: 2, ai: 3 } as never, 3, 4);
    expect(healPrice(run)).toBeLessThanOrEqual(mid * 1.6);
    const last = { ...run, hearts: 1 };
    expect(healPrice(last)).toBeLessThan(healPrice(run));
    const late = { ...run, act: 2 };
    expect(healPrice(late) / healPrice(run)).toBeLessThan(1.7);
  });
});

function planRace() {
  return { course: 'farm', laps: 2, ai: 3, difficulty: 'normal', damage: false, weather: 'clear', time: 'day' };
}
