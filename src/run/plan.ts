// What a map node means as a race: the rules, the rivals, the boss and its trick, the goal of a challenge.
// Pure data in, data out; the app turns a RacePlan into RallyOptions.
import { RALLY_COURSE_DEFS, defaultRules, type RaceRules, type RallyCourse, type RallyDifficulty } from '../shared/rally.ts';
import { RALLY_COURSE_NAMES } from '../shared/names.ts';
import type { RaceTwist } from '../rally/mods.ts';
import { skyFor, variationFor } from '../shared/variation.ts';
import { BOSS_COURSE, type BossId, type ChallengeKind, type MapNode } from './map.ts';

export interface BossDef {
  id: BossId;
  name: string;
  emoji: string;
  course: RallyCourse;
  /** What the boss says at the start. */
  intro: string;
  /** The trick, in one line. */
  trick: string;
  twist: RaceTwist;
}

export const BOSS_DEFS: Record<BossId, BossDef> = {
  bengt: {
    id: 'bengt',
    name: 'Bonden Bengt',
    emoji: '🚜',
    course: BOSS_COURSE.bengt,
    intro: '“Ingen kör förbi mig på min gård! Nu ska ni få se hur man kör traktor!”',
    trick: 'Bengt kör traktor och puttar undan dig, och höbalar ligger på vägen. Kör runt dem!',
    twist: { boss: { name: 'Bonden Bengt', face: 'human', body: 'tractor', color: '#2fa84f', power: 1.04, skill: 0.98 }, hay: 6 },
  },
  ingrid: {
    id: 'ingrid',
    name: 'Älgen Ingrid',
    emoji: '🦌',
    course: BOSS_COURSE.ingrid,
    intro: '“Hoppla! Jag älskar att hoppa över vägen. Kan du hänga med?”',
    trick: 'Ingrid kör fyrhjuling och hoppar tvärs över vägen, och de andra gör likadant och får fart i nitron.',
    twist: { boss: { name: 'Älgen Ingrid', face: 'horse', body: 'atv', color: '#8c5a3c', power: 1.03, skill: 0.97 }, rivalHop: 7, rivalNitro: 12 },
  },
  isdrottningen: {
    id: 'isdrottningen',
    name: 'Isdrottningen',
    emoji: '👸',
    course: BOSS_COURSE.isdrottningen,
    intro: '“Brrr! Min bana är min. Här blir det halt för alla!”',
    trick: 'Vägen är is: det är halt för alla, och Isdrottningen dundrar iväg med nitro.',
    twist: { boss: { name: 'Isdrottningen', face: 'cat', body: 'coupe', color: '#bfe9ff', power: 1.04, skill: 1.02 }, grip: 0.72, rivalNitro: 9 },
  },
  kanin: {
    id: 'kanin',
    name: 'Kapten Kanin',
    emoji: '🐰',
    course: BOSS_COURSE.kanin,
    intro: '“Hopp hopp! På månen väger man ingenting. Fånga mig om ni kan, jag kör soffa!”',
    trick: 'Månen har låg tyngdkraft: Kapten Kanin och de andra studsar i jättehopp och drar på nitron.',
    twist: { boss: { name: 'Kapten Kanin', face: 'rabbit', body: 'sofa', color: '#6a4fd8', power: 1.05, skill: 1.0 }, rivalHop: 4.5, rivalNitro: 10 },
  },
};

export const CHALLENGE_NAMES: Record<ChallengeKind, string> = {
  win: 'Vinn på 2 varv',
  toptwo: 'Topp 2 i regnet',
  night: 'Nattrace',
  time: 'Slå tiden',
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
}

const DIFFS: RallyDifficulty[] = ['easy', 'normal', 'hard'];
const stepDiff = (d: RallyDifficulty, by: number): RallyDifficulty => DIFFS[Math.max(0, Math.min(2, DIFFS.indexOf(d) + by))]!;

/** The time to beat in a "slå tiden" challenge (a little slower than gold). */
export function targetTimeMs(course: RallyCourse, laps: number): number {
  return Math.round(RALLY_COURSE_DEFS[course].gold * laps * 1000 * 1.12 + 3000);
}

export function planRace(node: MapNode, calm: boolean): RacePlan {
  const act = node.act;
  const course = node.course ?? 'farm';
  let rules: RaceRules = { ...defaultRules(), course, laps: 2, ai: [3, 4, 5][act] ?? 5, difficulty: act >= 2 ? 'hard' : 'normal' };
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
    title = `Elitlopp på ${RALLY_COURSE_NAMES[course].toLowerCase()}`;
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
    rules.ai = Math.min(5, rules.ai + 1);
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
        rules.laps = 2;
        goal = { kind: 'place', place: 1, text: 'Vinn loppet!' };
        break;
      case 'toptwo':
        rules.weather = 'rain';
        goal = { kind: 'place', place: 2, text: 'Kom topp 2 – det regnar!' };
        break;
      case 'night':
        rules.time = 'night';
        goal = { kind: 'place', place: 3, text: 'Kom topp 3 i mörkret!' };
        break;
      case 'time': {
        const ms = targetTimeMs(course, rules.laps);
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
  return { node, title, course: rules.course, rules, twist, goal, boss, prize };
}

/** Did the result meet the challenge's goal? */
export function goalMet(goal: Goal, r: { finished: boolean; place: number; time: number }): boolean {
  if (!r.finished) return false;
  return goal.kind === 'place' ? r.place <= goal.place : r.time > 0 && r.time <= goal.ms;
}
