// A made-up player who walks whole runs through the real run rules, building a car as they go. The balance tests use it;
// so can a throwaway script that wants to know where a build dies. Pure (no DOM, no clock): the dice are seeded.
import { racePrize, type CarBody } from '../shared/rally.ts';
import { type HumanSkill } from '../shared/pace.ts';
import { buyHeart, buyTrinket, trinketPrice, upgradePrice, workshopBuy, workshopFree } from './economy.ts';
import { choiceAllowed, EVENTS } from './events.ts';
import { chooseEvent, continueAfterRace, currentPlan, enterNode, finishNode, pickReward, submitRace } from './flow.ts';
import { asRallyResult, simulateRace, type PlayerModel } from './racesim.ts';
import { asDifficulty, type Difficulty } from './difficulty.ts';
import { Rng } from './rng.ts';
import { newRun, reachable, type RunState } from './state.ts';
import { trinketById } from './trinkets.ts';
import { available, isUpgrade, upgradeById } from './upgrades.ts';

export type Strategy = 'race' | 'ram' | 'mixed';
export interface Profile extends PlayerModel {
  strategy: Strategy;
}

export const profile = (skill: HumanSkill, strategy: Strategy = 'mixed', aggression = strategy === 'ram' ? 1 : strategy === 'race' ? 0.6 : 0.5): Profile => ({ skill, strategy, aggression });

/** The upgrade lines each kind of made-up player goes for, best first. */
const LINE_ORDER: Record<Strategy, string[]> = {
  race: ['race.grip', 'race.engine', 'race.nitro', 'race.long', 'race.drift', 'race.aero', 'race.cap', 'stunt.air', 'race.brakes', 'stunt.near', 'stunt.flip', 'ram.plates'],
  ram: ['ram.plates', 'ram.spikes', 'race.engine', 'ram.hammer', 'ram.ballast', 'ram.shock', 'race.grip', 'ram.boost', 'ram.cap', 'race.nitro', 'fuffens.mine', 'fuffens.oil'],
  mixed: ['race.grip', 'race.engine', 'ram.plates', 'race.nitro', 'ram.spikes', 'race.long', 'race.drift', 'ram.hammer', 'ram.shock', 'stunt.air', 'race.cap', 'ram.cap'],
};

/** How much a made-up player likes an upgrade card (trinkets use `like`). */
function likeUp(id: string, s: Strategy): number {
  const u = upgradeById(id)!;
  const idx = LINE_ORDER[s].indexOf(u.line);
  return idx < 0 ? (u.tree === 'car' ? 2.6 : 1.8) : 2.4 + 2.6 * (1 - idx / LINE_ORDER[s].length);
}

/** The next node of the strategy's list that is open, or any open one. */
function nextNode(run: RunState, s: Strategy, maxTier = 3): string | null {
  const open = available(run.up, run.car.body).filter((u) => u.tier <= maxTier && !u.cap);
  for (const line of LINE_ORDER[s]) {
    const hit = open.find((u) => u.line === line);
    if (hit) return hit.id;
  }
  return open[0]?.id ?? null;
}

/** How much a made-up player likes a trinket. */
function like(id: string, s: Strategy): number {
  const d = trinketById(id)!;
  const rar = { common: 1, rare: 2, legendary: 3 }[d.rarity];
  const path = d.path === s ? 2.5 : s === 'mixed' && (d.path === 'race' || d.path === 'ram') ? 1.5 : 0;
  const speed = d.tune ? 0.5 : 0;
  return rar + path + speed;
}

/** One whole run with a made-up player. */
export interface RaceLog {
  act: number;
  kind: string;
  place: number;
  lapped: boolean;
  roadPlace: number;
  boss: boolean;
  derby: boolean;
  elite: boolean;
  hearts: number;
}

/** `progress` is the meta's medal progress at the start: the only thing of the meta a run is given (it must not change the run). */
export function playRun(seed: number, p: Profile, mode: Difficulty | boolean, progress: Record<string, number> = {}): { run: RunState; races: RaceLog[] } {
  const rng = new Rng(seed * 7919 + 13);
  let run = newRun({ seed, diff: asDifficulty(mode), body: 'hatch', paint: '#e8412c', progress });
  const races: RaceLog[] = [];
  for (let guard = 0; guard < 600 && run.status === 'running'; guard++) {
    if (!run.screen) {
      const opts = reachable(run);
      const score = (n: (typeof opts)[number]): number => {
        let v = rng.float() * 0.5;
        if (run.hearts < run.maxHearts && n.type === 'shop') v += 2;
        if (n.type === 'workshop') v += 1.2;
        if (n.type === 'elite' && run.hearts <= 2) v -= 1.5;
        if (p.strategy === 'race' && n.kind === 'rally') v += 0.8;
        if (p.strategy === 'ram' && n.kind === 'carnage') v += 0.8;
        return v;
      };
      const pick = [...opts].sort((a, b) => score(b) - score(a))[0]!;
      run = enterNode(run, pick.id);
      continue;
    }
    const s = run.screen;
    switch (s.kind) {
      case 'prerace': {
        const plan = currentPlan(run)!;
        const r = simulateRace(plan, run, p, rng);
        const res = asRallyResult(plan, r);
        res.kronor = racePrize(plan.rules, res.place, res.n);
        const before = run.hearts;
        const actNow = run.act;
        run = submitRace(run, res);
        races.push({ act: actNow, kind: plan.kind, place: res.place, lapped: r.lapped, roadPlace: r.roadPlace, boss: !!plan.boss, derby: !!plan.arena, elite: plan.node.type === 'elite', hearts: before - run.hearts });
        break;
      }
      case 'postrace':
        run = continueAfterRace(run);
        break;
      case 'reward': {
        let best = 0;
        let bestV = -1;
        [...s.choices, ...(s.ups ?? [])].forEach((id, i) => {
          const v = isUpgrade(id) ? likeUp(id, p.strategy) : like(id, p.strategy);
          if (v > bestV) {
            bestV = v;
            best = i;
          }
        });
        run = pickReward(run, best);
        break;
      }
      case 'shop': {
        const c = structuredClone(run);
        if (c.hearts < c.maxHearts) buyHeart(c);
        const sh = c.screen as Extract<NonNullable<RunState['screen']>, { kind: 'shop' }>;
        const order = sh.stock.map((x, i) => ({ i, v: like(x.id, p.strategy) })).sort((a, b) => b.v - a.v);
        for (const { i } of order) if (c.kronor >= trinketPrice(c, sh.stock[i]!.id) + 60) buyTrinket(c, i);
        run = finishNode(c);
        break;
      }
      case 'workshop': {
        const c = structuredClone(run);
        const shelf = (c.screen as Extract<NonNullable<RunState['screen']>, { kind: 'workshop' }>).stock;
        // the free pick first (the best liked of the cheap ones), then whatever the purse allows (keeping a little for the kiosk)
        const ranked = [...shelf].sort((a, b) => likeUp(b, p.strategy) - likeUp(a, p.strategy));
        const free = ranked.find((id) => workshopFree(c, id));
        if (free) workshopBuy(c, free);
        for (const id of ranked) {
          if (c.up.includes(id) || c.kronor < upgradePrice(c, id) + 80) continue;
          workshopBuy(c, id);
        }
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
  return { run, races };
}

