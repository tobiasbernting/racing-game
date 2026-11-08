// How a run moves: entering a node, finishing a race, picking rewards, leaving a node, the end of an act and
// of the run. Each function takes a RunState and returns a new one (the old one is left alone), so the app can
// save after every step and tests can walk a whole run.
import type { RallyResult } from '../rally/options.ts';
import { ACTS, NODE_NAMES, type MapNode } from './map.ts';
import { drawTrinkets, makeStock, rewardGrade, rewardOffer, workshopStock } from './economy.ts';
import { eventById, pickEventId, resolveChoice } from './events.ts';
import { BOSS_DEFS, goalMet, planRace, type RacePlan } from './plan.ts';
import { addRaceStats } from './stats.ts';
import { RALLY_COURSE_NAMES } from '../shared/names.ts';
import { ARENAS } from '../shared/derby.ts';
import { Rng } from './rng.ts';
import { DIFFS } from './difficulty.ts';
import { type RewardGrade, actScale, addKronor, addTrinket, addUp, ownedN, copyRun, heartsLost, healHeart, loseHeart, nodeOf, reachable, scrapHearts, type NodeLog, type RaceSummary, type RunState } from './state.ts';
import { available, interestOn, isUpgrade, runPerks } from './upgrades.ts';

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
      r.screen = { kind: 'workshop', nodeId: id, used: false, note: '', stock: workshopStock(r, id) };
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
  return Math.round(raw * actScale(run.act) * nodeMul * (run.calm ? 1.25 : 1) * (1 + runPerks(run.trinkets, run.up).kronor));
}

/** Applies a finished race to the run: hearts, kronor, stats, damage; sets the card that tells how it went. */
export function submitRace(run: RunState, res: RallyResult): RunState {
  if (run.screen?.kind !== 'prerace') return run;
  const r = copyRun(run);
  const node = nodeOf(r, run.screen.nodeId)!;
  const plan = planRace(node, r.calm);
  const lost = heartsLost(res.place, res.n, res.finished, r.diff, node.type === 'boss');
  const heartLost = lost > 0;
  const met = plan.goal ? goalMet(plan.goal, res) : null;
  const raw = res.kronor + res.coins + (res.bonus ?? 0);
  const total = scaleKronor(r, raw, plan.prize * (met ? 1.5 : 1));
  addKronor(r, total);
  for (let k = 0; k < lost; k++) loseHeart(r);
  // winning a boss race gives a heart back in Normal (Söndagsåkare: finishNode pays two whatever the placing; Hård and Ett liv: nothing)
  if (DIFFS[r.diff].bossHealWin > 0 && node.type === 'boss' && res.finished && res.place === 1 && r.status === 'running') healHeart(r, DIFFS[r.diff].bossHealWin);
  r.car.damage = Math.max(0, Math.round(res.damage * 0.85));
  const st = r.stats;
  st.races++;
  if (res.finished && res.place === 1) st.wins++;
  if (res.finished && (st.bestPlace === 0 || res.place < st.bestPlace)) st.bestPlace = res.place;
  const tdBefore = st.takedowns;
  addRaceStats(st, res);
  // the reward: after EVERY race a pick of three (talismans and upgrade nodes mixed), the quality set by where you ended up:
  // a win (in Blodbad and the derby: the rank on points) is better, the top half ordinary, the bottom half and a DNF plain
  let reward = false;
  let rewardKind: RaceSummary['rewardKind'];
  if (r.status === 'running') {
    rewardKind = rewardGrade({ place: res.place, n: res.n, finished: res.finished, nodeType: node.type, goalMet: met === true });
    reward = true;
  }
  // Skrotpant: the wrecks of a rammer buy hearts back (not on the run's last breath)
  let scrapBack = 0;
  const scrapEvery = DIFFS[r.diff].scrapEvery;
  const hurtNow = r.hearts < r.maxHearts;
  if (r.status === 'running' && hurtNow) {
    const want = scrapHearts(tdBefore, st.takedowns, scrapEvery);
    if (want > 0 && healHeart(r, want)) scrapBack = want;
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
    dealt: res.dealt,
    survival: res.survival,
    roadPlace: res.roadPlace,
    takedowns: res.takedowns,
    wrecked: res.wrecked,
    derby: plan.arena ? res.derby : undefined,
    scrapHearts: scrapBack || undefined,
    scrapCount: scrapEvery > 0 ? st.takedowns % scrapEvery : undefined,
  };
  r.screen = { kind: 'postrace', nodeId: node.id, summary };
  r.log.push({
    nodeId: node.id,
    act: node.act,
    row: node.row,
    type: node.type,
    kind: plan.kind,
    title: node.boss ? BOSS_DEFS[node.boss].name : plan.arena ? ARENAS[plan.arena].name : RALLY_COURSE_NAMES[plan.course],
    course: plan.arena ? ARENAS[plan.arena].name : RALLY_COURSE_NAMES[plan.course],
    place: res.place,
    n: res.n,
    finished: res.finished,
    points: res.points,
    time: res.finished ? res.time : undefined,
    lost,
    goalMet: met ?? undefined,
    takedowns: res.takedowns || undefined,
    boss: node.boss,
    arena: plan.arena,
    outAt: res.derby?.table.find((t) => t.me)?.outAt ?? undefined,
  });
  return r;
}

/** Where a reward came from, as the build section tells it ("Vann Sura Bengt"). */
function rewardFrom(r: RunState, nodeId: string, grade: RewardGrade): string {
  const node = nodeOf(r, nodeId);
  const course = node?.course ? RALLY_COURSE_NAMES[node.course] : 'banan';
  if (grade === 'boss') return `Vann ${node?.boss ? BOSS_DEFS[node.boss].name : 'bossen'}`;
  if (grade === 'elite') return `Vann dödsloppet: ${course}`;
  if (grade === 'plain') return `Skräp efter ${course}`;
  if (grade === 'normal') return `Byte efter ${course}`;
  return node?.type === 'challenge' ? `Utmaning: ${course}` : `Vann på ${course}`;
}

/** After the race card: the pick of three (every race gives one), otherwise on with the map. */
export function continueAfterRace(run: RunState): RunState {
  if (run.screen?.kind !== 'postrace') return run;
  if (run.status !== 'running') return run;
  const { nodeId, summary } = run.screen;
  if (!summary.reward) return finishNode(run);
  const r = copyRun(run);
  const node = nodeOf(r, nodeId)!;
  const grade: RewardGrade = summary.rewardKind ?? 'win';
  const { choices, ups } = rewardOffer(r, nodeId, grade, node.kind);
  // nothing left to offer (every talisman maxed and the trees full): a little kronor instead
  if (!choices.length && !ups.length) { addKronor(r, 40); return finishNode(r); }
  r.screen = { kind: 'reward', nodeId, choices, ups, grade };
  return r;
}

/** Takes one of the offered cards: an index into the talismans and then the upgrades, or none (-1: a few kronor instead). */
export function pickReward(run: RunState, index: number): RunState {
  if (run.screen?.kind !== 'reward') return run;
  const r = copyRun(run);
  const scr = run.screen;
  const id = [...scr.choices, ...(scr.ups ?? [])][index];
  const from = rewardFrom(r, scr.nodeId, scr.grade);
  if (id && isUpgrade(id)) addUp(r, id, { from, node: scr.nodeId });
  else if (id) addTrinket(r, id, { from, node: scr.nodeId });
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
  // Girig: the kronor in the purse earn interest after every node
  const rate = runPerks(r.trinkets, r.up).interest;
  r.interest = interestOn(r.kronor, rate);
  if (r.interest > 0) addKronor(r, r.interest);
  if (node && !r.log.some((l) => l.nodeId === node.id)) r.log.push(visitLog(r, node, scr));
  if (node?.type === 'boss') {
    r.stats.bossesBeaten++;
    // Söndagsåkare: a boss pays two hearts back, whatever the placing
    if (DIFFS[r.diff].bossHealAny > 0) healHeart(r, DIFFS[r.diff].bossHealAny);
    r.act++;
    r.at = null;
    r.path = [];
    if (r.act >= ACTS) {
      r.act = ACTS - 1;
      r.status = 'won';
    } else {
      if (r.car.body === 'sofa') chaosGift(r);
      toolboxGift(r);
    }
  } else {
    r.at = scr.nodeId;
    r.path.push(scr.nodeId);
  }
  return r;
}

/** The sofa's passive: a random talisman from the pool lands in the build at the start of each new act. */
export function chaosGift(r: RunState): string | null {
  const id = drawTrinkets(r, Rng.for(r.seed, 'sofa', r.act), 1, 'event')[0];
  if (!id) return null;
  addTrinket(r, id, { from: 'Kaosarvet: soffan hittade den', node: '' });
  return id;
}

/** Verktygslådan: at the start of each new act somebody bolts a random open upgrade node onto the car (one for each toolbox, none when the trees are full). */
export function toolboxGift(r: RunState): string[] {
  const got: string[] = [];
  for (let i = 0; i < ownedN(r, 'verktygslada'); i++) {
    const open = available(r.up, r.car.body).filter((u) => !u.cap);
    if (!open.length) break;
    const pick = Rng.for(r.seed, 'toolbox', r.act, i).pick(open);
    addUp(r, pick.id, { from: 'Verktygslådan: någon skruvade dit den', node: '' });
    got.push(pick.id);
  }
  return got;
}

/** Acts completed, for the trophies and the summary. */
export const actsReached = (r: RunState): number => Math.min(ACTS, r.act + 1);

/** The timeline line of a node without a race: a shop, the workshop or an event. */
function visitLog(r: RunState, node: NonNullable<ReturnType<typeof nodeOf>>, scr: NonNullable<RunState['screen']>): NodeLog {
  const title = scr.kind === 'event' ? (eventById(scr.eventId)?.title ?? 'Händelse') : NODE_NAMES[node.type];
  return { nodeId: node.id, act: node.act, row: node.row, type: node.type, title, lost: r.nodeLost };
}
