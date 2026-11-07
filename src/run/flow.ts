// How a run moves: entering a node, finishing a race, picking rewards, leaving a node, the end of an act and
// of the run. Each function takes a RunState and returns a new one (the old one is left alone), so the app can
// save after every step and tests can walk a whole run.
import type { RallyResult } from '../rally/options.ts';
import { ACTS, NODE_NAMES, type MapNode } from './map.ts';
import { canUpgrade, makeStock, partOfChoice, rewardChoices } from './economy.ts';
import { eventById, pickEventId, resolveChoice } from './events.ts';
import { BOSS_DEFS, goalMet, planRace, type RacePlan } from './plan.ts';
import { addRaceStats } from './stats.ts';
import { RALLY_COURSE_NAMES } from '../shared/names.ts';
import { Rng } from './rng.ts';
import { actScale, addKronor, addTrinket, copyRun, heartsLost, healHeart, loseHeart, nodeOf, noteGot, reachable, type NodeLog, type RaceSummary, type RunState } from './state.ts';
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
  r.nodeLost = 0;
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
  const lost = heartsLost(res.place, res.n, res.finished, r.calm, node.type === 'boss');
  const heartLost = lost > 0;
  const met = plan.goal ? goalMet(plan.goal, res) : null;
  const raw = res.kronor + res.coins + (res.bonus ?? 0);
  const total = scaleKronor(r, raw, plan.prize * (met ? 1.5 : 1));
  addKronor(r, total);
  for (let k = 0; k < lost; k++) loseHeart(r);
  // winning a boss race gives a heart back (in lugnt läge finishNode pays two whatever the placing)
  if (!r.calm && node.type === 'boss' && res.finished && res.place === 1 && r.status === 'running') healHeart(r, 1);
  r.car.damage = Math.max(0, Math.round(res.damage * 0.85));
  const st = r.stats;
  st.races++;
  if (res.finished && res.place === 1) st.wins++;
  if (res.finished && (st.bestPlace === 0 || res.place < st.bestPlace)) st.bestPlace = res.place;
  addRaceStats(st, res);
  // the reward: every win (in Blodbad: most points) is a pick of three, second place a smaller pick of two, an
  // elite or a boss always pays, and a challenge pays when its goal is met
  let reward = false;
  let rewardKind: RaceSummary['rewardKind'];
  if (r.status === 'running') {
    const won = res.finished && res.place === 1 && res.n > 1;
    const second = res.finished && res.place === 2 && res.n > 2;
    if (won) rewardKind = 'win';
    else if (node.type === 'boss') rewardKind = 'boss';
    else if (node.type === 'elite') rewardKind = 'elite';
    else if (node.type === 'challenge' && met === true) rewardKind = 'win';
    else if (second) rewardKind = 'second';
    reward = !!rewardKind;
  }
  const summary: RaceSummary = {
    place: res.place,
    n: res.n,
    finished: res.finished,
    time: res.time,
    heartLost,
    hearts: lost,
    prize: res.kronor,
    coins: res.coins,
    bonus: res.bonus ?? 0,
    total,
    goal: plan.goal && met !== null ? { text: plan.goal.text, met } : undefined,
    medal: res.medal,
    reward,
    rewardKind,
    kind: plan.kind,
    points: res.points,
    roadPlace: res.roadPlace,
    takedowns: res.takedowns,
    wrecked: res.wrecked,
  };
  r.screen = { kind: 'postrace', nodeId: node.id, summary };
  r.log.push({
    nodeId: node.id,
    act: node.act,
    row: node.row,
    type: node.type,
    kind: plan.kind,
    title: node.boss ? BOSS_DEFS[node.boss].name : RALLY_COURSE_NAMES[plan.course],
    course: RALLY_COURSE_NAMES[plan.course],
    place: res.place,
    n: res.n,
    finished: res.finished,
    points: res.points,
    time: res.finished ? res.time : undefined,
    lost,
    goalMet: met ?? undefined,
    takedowns: res.takedowns || undefined,
  });
  return r;
}

/** Where a reward came from, as the build section tells it ("Vann Sura Bengt"). */
function rewardFrom(r: RunState, nodeId: string, source: 'race' | 'elite' | 'boss' | 'event' | 'consolation'): string {
  const node = nodeOf(r, nodeId);
  const course = node?.course ? RALLY_COURSE_NAMES[node.course] : 'banan';
  if (source === 'boss') return `Vann ${node?.boss ? BOSS_DEFS[node.boss].name : 'bossen'}`;
  if (source === 'elite') return `Dödslopp: ${course}`;
  if (source === 'consolation') return `Tvåa på ${course}`;
  return node?.type === 'challenge' ? `Utmaning: ${course}` : `Vann på ${course}`;
}

/** After the race card: the trinket pick if there is one, otherwise on with the map. */
export function continueAfterRace(run: RunState): RunState {
  if (run.screen?.kind !== 'postrace') return run;
  if (run.status !== 'running') return run;
  const { nodeId, summary } = run.screen;
  if (!summary.reward) return finishNode(run);
  const r = copyRun(run);
  const node = nodeOf(r, nodeId)!;
  const source = summary.rewardKind === 'second' ? 'consolation' : node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'race';
  const choices = rewardChoices(r, nodeId, source, node.kind);
  // nothing left to offer (every trinket maxed): a little kronor instead
  if (!choices.length) { addKronor(r, 40); return finishNode(r); }
  r.screen = { kind: 'reward', nodeId, choices, source };
  return r;
}

/** Takes one of the offered trinkets (an index), or none (-1: a few kronor instead). */
export function pickReward(run: RunState, index: number): RunState {
  if (run.screen?.kind !== 'reward') return run;
  const r = copyRun(run);
  const scr = run.screen;
  const id = scr.choices[index];
  const part = id ? partOfChoice(id) : null;
  const from = rewardFrom(r, scr.nodeId, scr.source);
  if (part) {
    if (canUpgrade(r, part)) {
      r.car.parts[part] = (r.car.parts[part] ?? 0) + 1;
      noteGot(r, 'part', part, from, scr.nodeId);
    } else addKronor(r, 40);
  } else if (id) addTrinket(r, id, { from, node: scr.nodeId });
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
  if (node && !r.log.some((l) => l.nodeId === node.id)) r.log.push(visitLog(r, node, scr));
  if (node?.type === 'boss') {
    r.stats.bossesBeaten++;
    // a boss pays one heart back (two in lugnt läge)
    if (r.calm) healHeart(r, 2);
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

/** The timeline line of a node without a race: a shop, the workshop or an event. */
function visitLog(r: RunState, node: NonNullable<ReturnType<typeof nodeOf>>, scr: NonNullable<RunState['screen']>): NodeLog {
  const title = scr.kind === 'event' ? (eventById(scr.eventId)?.title ?? 'Händelse') : NODE_NAMES[node.type];
  return { nodeId: node.id, act: node.act, row: node.row, type: node.type, title, lost: r.nodeLost };
}
