// What a map node means as a race: the rules, the rivals, the boss and its trick, the goal of a challenge.
// Pure data in, data out; the app turns a RacePlan into RallyOptions.
import { RALLY_COURSE_DEFS, defaultRules, type RaceRules, type RallyCourse, type RallyDifficulty } from '../shared/rally.ts';
import { RALLY_COURSE_NAMES } from '../shared/names.ts';
import type { RaceTwist } from '../rally/mods.ts';
import { skyFor, variationFor } from '../shared/variation.ts';
import { BOSS_COURSE, type BossId, type ChallengeKind, type MapNode } from './map.ts';
import type { RaceKind } from '../shared/kinds.ts';
import { buildField, type FieldPlan } from '../shared/field.ts';
import type { Archetype } from '../shared/rivals.ts';

export interface BossDef {
  id: BossId;
  name: string;
  emoji: string;
  course: RallyCourse;
  /** The boss's nickname, a few words. */
  nick: string;
  /** What the boss says at the start. */
  intro: string;
  /** The trick, in one line. */
  trick: string;
  twist: RaceTwist;
  /** How the boss drives. */
  archetype: Archetype;
}

export const BOSS_DEFS: Record<BossId, BossDef> = {
  bengt: {
    id: 'bengt',
    name: 'Sura Bengt',
    nick: 'Hatar rallyungar på sin grusväg',
    emoji: '🚜',
    course: BOSS_COURSE.bengt,
    archetype: 'rammer',
    intro: '“DET HÄR ÄR MIN GRUSVÄG! Ni rallyungar förstör gruset och skrämmer korna. Jag har traktor, hela dagen och inga vänner!”',
    trick: 'Bengt kör traktor och puttar undan dig. Höbalar ligger på vägen. Kör runt dem!',
    twist: { boss: { name: 'Sura Bengt', face: 'human', body: 'tractor', color: '#2fa84f', power: 1.04, skill: 0.98 }, hay: 6 },
  },
  ingrid: {
    id: 'ingrid',
    name: 'Ingrid Ingenväjning',
    nick: 'Älgen som aldrig ger företräde',
    emoji: '🦌',
    course: BOSS_COURSE.ingrid,
    archetype: 'mixed',
    intro: '“Jag väjer aldrig. Inte för bilar, inte för tåg, inte för dig. Flytta på dig, annars blir du älgkorv.”',
    trick: 'Ingrid kör fyrhjuling och hoppar tvärs över vägen utan förvarning. De andra gör likadant och drar på nitron.',
    twist: { boss: { name: 'Ingrid Ingenväjning', face: 'horse', body: 'atv', color: '#8c5a3c', power: 1.03, skill: 0.97 }, rivalHop: 7, rivalNitro: 12 },
  },
  isdrottningen: {
    id: 'isdrottningen',
    name: 'Frost-Frida',
    nick: 'Isdrottningen med fryst hjärta',
    emoji: '👸',
    course: BOSS_COURSE.isdrottningen,
    archetype: 'racer',
    intro: '“Mitt hjärta är kallare än din glass. Banan är is och du är i vägen. Brrr, älskling.”',
    trick: 'Vägen är blank is: halt för alla. Frida dundrar iväg med nitro.',
    twist: { boss: { name: 'Frost-Frida', face: 'cat', body: 'coupe', color: '#bfe9ff', power: 1.04, skill: 1.02 }, grip: 0.72, rivalNitro: 9 },
  },
  kanin: {
    id: 'kanin',
    name: 'Kapten Kanin',
    nick: 'Månens krigsherre, äter morötter och förlorare',
    emoji: '🐰',
    course: BOSS_COURSE.kanin,
    archetype: 'mixed',
    intro: '“Jag är Kapten Kanin, krigsherre över månen. Jag äter morötter och förlorare. Knäpp med öronen: ni är mina!”',
    trick: 'Månen har låg tyngdkraft. Kanin kör soffa och studsar i jättehopp. De andra gör likadant och drar på nitron.',
    twist: { boss: { name: 'Kapten Kanin', face: 'rabbit', body: 'sofa', color: '#6a4fd8', power: 1.05, skill: 1.0 }, rivalHop: 4.5, rivalNitro: 10 },
  },
};

export const CHALLENGE_NAMES: Record<ChallengeKind, string> = {
  win: 'Vinn eller skäms',
  toptwo: 'Topp 2 i spöregn',
  night: 'Mörkerrallyt',
  time: 'Slå klockan',
};

export type Goal =
  | { kind: 'place'; place: number; text: string }
  | { kind: 'time'; ms: number; text: string };

export interface RacePlan {
  node: MapNode;
  title: string;
  course: RallyCourse;
  rules: RaceRules;
  twist?: RaceTwist;
  goal?: Goal;
  boss?: BossDef;
  /** Pay multiplier for the node type. */
  prize: number;
  /** Rally, Blandat or Blodbad. */
  kind: RaceKind;
  /** The rivals, their kit and the hazards. */
  field: FieldPlan;
}

const DIFFS: RallyDifficulty[] = ['easy', 'normal', 'hard'];
const stepDiff = (d: RallyDifficulty, by: number): RallyDifficulty => DIFFS[Math.max(0, Math.min(2, DIFFS.indexOf(d) + by))]!;

/** The time to beat in a "slå tiden" challenge (a little slower than gold). */
export function targetTimeMs(course: RallyCourse, laps: number, act = 0): number {
  // tighter later: act 1 a little slower than gold, act 3 right on gold
  const slack = [1.12, 1.06, 1.0][Math.min(2, Math.max(0, act))]!;
  return Math.round(RALLY_COURSE_DEFS[course].gold * laps * 1000 * slack + [3000, 2000, 1000][Math.min(2, Math.max(0, act))]!);
}

export function planRace(node: MapNode, calm: boolean): RacePlan {
  const act = node.act;
  const course = node.course ?? 'farm';
  const kind: RaceKind = node.kind ?? 'rally';
  // the last act is run over three laps, like the bosses
  let rules: RaceRules = { ...defaultRules(), course, laps: act >= 2 ? 3 : 2, ai: [3, 4, 5][act] ?? 5, difficulty: act >= 2 ? 'hard' : 'normal', kind };
  // Blandat and Blodbad have contact; Rally only for the tough ones (below)
  if (kind !== 'rally') rules.damage = true;
  // later acts: weather and the time of day come from the node's seed (and never rain on the moon)
  const sky = skyFor(course, variationFor(course, node.seed), act);
  rules.time = sky.time;
  rules.weather = sky.weather;
  let prize = 1;
  let title = `${RALLY_COURSE_NAMES[course]}-loppet`;
  let twist: RaceTwist | undefined;
  let goal: Goal | undefined;
  let boss: BossDef | undefined;

  if (node.type === 'elite') {
    title = `Dödslopp på ${RALLY_COURSE_NAMES[course].toLowerCase()}`;
    rules.ai = Math.min(5, rules.ai + 1);
    rules.difficulty = stepDiff(rules.difficulty, 1);
    rules.damage = true;
    prize = 1.5;
  } else if (node.type === 'boss' && node.boss) {
    boss = BOSS_DEFS[node.boss];
    title = boss.name;
    twist = boss.twist;
    rules.course = boss.course;
    rules.laps = 3;
    // a boss race is a smaller field, so the boss is the fight and the heart rule for losing it is fair
    rules.ai = Math.max(3, rules.ai - 1);
    rules.difficulty = stepDiff(rules.difficulty, 1);
    rules.damage = true;
    if (node.boss === 'isdrottningen') rules.time = 'night';
    if (node.boss === 'kanin') rules = { ...rules, time: 'day', weather: 'clear' };
    prize = 2;
  } else if (node.type === 'challenge' && node.challenge) {
    title = CHALLENGE_NAMES[node.challenge];
    prize = 1.2;
    switch (node.challenge) {
      case 'win':
        rules.laps = act >= 2 ? 3 : 2;
        goal = { kind: 'place', place: 1, text: 'Vinn! Silver är bara första förloraren.' };
        break;
      case 'toptwo':
        rules.weather = 'rain';
        goal = { kind: 'place', place: 2, text: 'Topp 2, och det spöregnar!' };
        break;
      case 'night':
        rules.time = 'night';
        goal = { kind: 'place', place: 3, text: 'Topp 3 i becksvart natt!' };
        break;
      case 'time': {
        const ms = targetTimeMs(course, rules.laps, act);
        const m = Math.floor(ms / 60000);
        const sec = ((ms % 60000) / 1000).toFixed(1).replace('.', ',');
        goal = { kind: 'time', ms, text: `Klara ${rules.laps} varv på under ${m}:${sec.padStart(4, '0')}` };
        break;
      }
    }
  }
  if (calm) {
    rules.ai = Math.max(2, rules.ai - 1);
    rules.difficulty = stepDiff(rules.difficulty, -1);
  }
  const field = buildField({
    seed: node.seed,
    kind,
    act,
    row: node.row,
    role: node.type === 'elite' ? 'elite' : boss ? 'boss' : 'rival',
    calm,
    ai: rules.ai,
    boss: boss ? { id: boss.id, archetype: boss.archetype, power: boss.twist.boss?.power, skill: boss.twist.boss?.skill } : undefined,
  });
  return { node, title, course: rules.course, rules, twist, goal, boss, prize, kind, field };
}

/** Did the result meet the challenge's goal? */
export function goalMet(goal: Goal, r: { finished: boolean; place: number; time: number }): boolean {
  if (!r.finished) return false;
  return goal.kind === 'place' ? r.place <= goal.place : r.time > 0 && r.time <= goal.ms;
}
