// How a run moves: entering a node, finishing a race, picking rewards, leaving a node, the end of an act and
// of the run. Each function takes a RunState and returns a new one (the old one is left alone), so the app can
// save after every step and tests can walk a whole run.
import type { RallyResult } from '../rally/options.ts';
import { ACTS, type MapNode } from './map.ts';
import { makeStock, rewardChoices } from './economy.ts';
import { eventById, pickEventId, resolveChoice } from './events.ts';
import { goalMet, planRace, type RacePlan } from './plan.ts';
import { Rng } from './rng.ts';
import { actScale, addKronor, addTrinket, copyRun, costsHeart, healHeart, loseHeart, nodeOf, reachable, type RaceSummary, type RunState } from './state.ts';
import { perksOf } from './trinkets.ts';

/** Trophies and the end screen come from here when status is not 'running'. */
export const isOver = (r: RunState): boolean => r.status !== 'running';

export function currentNode(r: RunState): MapNode | undefined {
  return r.screen ? nodeOf(r, r.screen.nodeId) : undefined;
}

/** The race the pre-race card or the race itself is about. */
export function currentPlan(r: RunState): RacePlan | null {
  const n = currentNode(r);
  return n ? planRace(n, r.calm) : null;
}

/** Go to a node on the map. Returns the same run when the node cannot be entered. */
export function enterNode(run: RunState, id: string): RunState {
  if (run.screen || run.status !== 'running') return run;
  const node = reachable(run).find((n) => n.id === id);
  if (!node) return run;
  const r = copyRun(run);
  switch (node.type) {
    case 'shop':
      r.screen = { kind: 'shop', nodeId: id, stock: makeStock(r, id, 0), rerolls: 0, healed: false, repaired: false };
      break;
    case 'workshop':
      r.screen = { kind: 'workshop', nodeId: id, used: false, note: '' };
      break;
    case 'event':
      r.screen = { kind: 'event', nodeId: id, eventId: pickEventId(r, id), outcome: null };
      break;
    default:
      r.screen = { kind: 'prerace', nodeId: id };
  }
  return r;
}

/** Back to the map from a pre-race card without racing. */
export function backToMap(run: RunState): RunState {
  if (run.screen?.kind !== 'prerace') return run;
  const r = copyRun(run);
  r.screen = null;
  return r;
}

/** The kronor a race pays: prize, coins and trinket bonus, scaled for the act, the node, the mode and trinkets. */
export function scaleKronor(run: RunState, raw: number, nodeMul: number): number {
  return Math.round(raw * actScale(run.act) * nodeMul * (run.calm ? 1.25 : 1) * (1 + perksOf(run.trinkets).kronor));
}

/** Applies a finished race to the run: hearts, kronor, stats, damage; sets the card that tells how it went. */
export function submitRace(run: RunState, res: RallyResult): RunState {
  if (run.screen?.kind !== 'prerace') return run;
  const r = copyRun(run);
  const node = nodeOf(r, run.screen.nodeId)!;
  const plan = planRace(node, r.calm);
  const heartLost = costsHeart(res.place, res.n, res.finished, r.calm);
  const met = plan.goal ? goalMet(plan.goal, res) : null;
  const raw = res.kronor + res.coins + (res.bonus ?? 0);
  const total = scaleKronor(r, raw, plan.prize * (met ? 1.5 : 1));
  addKronor(r, total);
  if (heartLost) loseHeart(r);
  r.car.damage = Math.max(0, Math.round(res.damage * 0.85));
  const st = r.stats;
  st.races++;
  if (res.finished && res.place === 1) st.wins++;
  if (res.finished && (st.bestPlace === 0 || res.place < st.bestPlace)) st.bestPlace = res.place;
  if (res.stats) {
    st.bounces += res.stats.bounces;
    st.driftSeconds += res.stats.driftSeconds;
    st.bananas += res.stats.bananas;
    st.bananaHits += res.stats.bananaHits;
    st.boosts += res.stats.boosts;
    st.coins += res.stats.coins;
    st.squashed += res.stats.squashed;
    st.quacks += res.stats.quacks;
    st.jumps += res.stats.jumps;
  }
  // a trinket to pick: always after an elite or a boss, after a good race now and then, after a met challenge
  let reward = false;
  if (r.status === 'running') {
    if (node.type === 'elite' || node.type === 'boss') reward = true;
    else if (node.type === 'challenge') reward = met === true;
    else {
      const good = res.finished && res.place <= Math.ceil(res.n / 2);
      reward = Rng.for(r.seed, node.id, 'bonus').chance(good ? 0.4 : 0.15) && res.finished;
    }
  }
  const summary: RaceSummary = {
    place: res.place,
    n: res.n,
    finished: res.finished,
    time: res.time,
    heartLost,
    prize: res.kronor,
    coins: res.coins,
    bonus: res.bonus ?? 0,
    total,
    goal: plan.goal && met !== null ? { text: plan.goal.text, met } : undefined,
    medal: res.medal,
    reward,
  };
  r.screen = { kind: 'postrace', nodeId: node.id, summary };
  return r;
}

/** After the race card: the trinket pick if there is one, otherwise on with the map. */
export function continueAfterRace(run: RunState): RunState {
  if (run.screen?.kind !== 'postrace') return run;
  if (run.status !== 'running') return run;
  const { nodeId, summary } = run.screen;
  if (!summary.reward) return finishNode(run);
  const r = copyRun(run);
  const node = nodeOf(r, nodeId)!;
  const source = node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'race';
  r.screen = { kind: 'reward', nodeId, choices: rewardChoices(r, nodeId, source), source };
  return r;
}

/** Takes one of the offered trinkets (an index), or none (-1: a few kronor instead). */
export function pickReward(run: RunState, index: number): RunState {
  if (run.screen?.kind !== 'reward') return run;
  const r = copyRun(run);
  const scr = run.screen;
  const id = scr.choices[index];
  if (id) addTrinket(r, id);
  else addKronor(r, 30);
  return finishNode(r);
}

/** Plays an event choice; the card then shows what came of it (continue with `finishNode`). */
export function chooseEvent(run: RunState, choiceIdx: number): RunState {
  if (run.screen?.kind !== 'event' || run.screen.outcome) return run;
  const r = copyRun(run);
  const scr = r.screen as Extract<typeof r.screen, { kind: 'event' }>;
  const ev = eventById(scr.eventId);
  if (!ev) return finishNode(r);
  const out = resolveChoice(r, ev, choiceIdx, scr.nodeId);
  if (!out) return run;
  scr.outcome = out;
  return r;
}

/** Leaves the node: it counts as done, a boss ends the act (and the last one ends the run in victory). */
export function finishNode(run: RunState): RunState {
  const scr = run.screen;
  if (!scr) return run;
  const r = copyRun(run);
  const node = nodeOf(r, scr.nodeId);
  r.screen = null;
  r.nodesDone++;
  if (node?.type === 'boss') {
    r.stats.bossesBeaten++;
    // a boss pays one heart back (two in lugnt läge)
    healHeart(r, r.calm ? 2 : 1);
    r.act++;
    r.at = null;
    r.path = [];
    if (r.act >= ACTS) {
      r.act = ACTS - 1;
      r.status = 'won';
    }
  } else {
    r.at = scr.nodeId;
    r.path.push(scr.nodeId);
  }
  return r;
}

/** Acts completed, for the trophies and the summary. */
export const actsReached = (r: RunState): number => Math.min(ACTS, r.act + 1);
