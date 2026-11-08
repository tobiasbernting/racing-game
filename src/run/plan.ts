// What a map node means as a race: the rules, the rivals, the boss and its trick, the goal of a challenge.
// Pure data in, data out; the app turns a RacePlan into RallyOptions.
import { RALLY_COURSE_DEFS, defaultRules, type RaceRules, type RallyCourse, type RallyDifficulty } from '../shared/rally.ts';
import { RALLY_COURSE_NAMES } from '../shared/names.ts';
import type { RaceTwist } from '../rally/mods.ts';
import { skyFor, variationFor } from '../shared/variation.ts';
import { BOSS_COURSE, type BossId, type ChallengeKind, type MapNode } from './map.ts';
import type { RaceKind } from '../shared/kinds.ts';
import { buildField, unit, type FieldPlan } from '../shared/field.ts';
import { BORROWED, GIMMICKS, type GimmickId } from '../shared/gimmicks.ts';
import type { Archetype } from '../shared/rivals.ts';
import { ARENAS, DERBY_NAME, type ArenaId } from '../shared/derby.ts';
import { asDifficulty, type Difficulty } from './difficulty.ts';

export interface BossDef {
  id: BossId;
  name: string;
  /** A title before the name on the card ("Världsmästaren"), if it has one. */
  title?: string;
  emoji: string;
  course: RallyCourse;
  /** Which act's pool the boss is in (0 = akt 1). */
  act: number;
  /** What it drives, in words (the table in the README and the card). */
  vehicle: string;
  /** The boss's nickname, a few words. */
  nick: string;
  /** What the trick is when the boss calls you to a Rivningsderby instead. */
  derbyTrick?: string;
  /** What the boss says at the start. */
  intro: string;
  /** The trick, in one line. */
  trick: string;
  twist: RaceTwist;
  /** How the boss drives. */
  archetype: Archetype;
  /** The rival (shared/rivals.ts) the boss is the same person as: that one stays off the grid in the boss race. */
  rivalId?: string;
  /** The world champions drive a perfect line with nitro on every straight, and borrow another boss's trick. */
  champion?: boolean;
}

export const BOSS_DEFS: Record<BossId, BossDef> = {
  torsten: {
    id: 'torsten',
    name: 'Tävlingsledaren Torsten',
    nick: 'Visselpipan är hans svärd',
    emoji: '🏁',
    course: BOSS_COURSE.torsten,
    act: 0,
    vehicle: 'Tävlingsbil med blinkande ljusramp',
    archetype: 'racer',
    intro: '“Alla in på ledet! Jag är tävlingsledare och jag har en visselpipa. Rött fält betyder att du gjorde fel. Det gör du alltid.”',
    trick: 'Torsten ritar straffzoner på vägen. Kör genom en och du bromsas och får 2 sekunders tillägg.',
    twist: { boss: { name: 'Tävlingsledaren Torsten', body: 'pickup', color: '#f4c20d', trim: '#15171c', helmet: 'checker', extras: ['lightbar'], power: 1.06, skill: 1.0 }, gimmicks: ['penalty'] },
  },
  goran: {
    id: 'goran',
    name: 'Golf-Göran',
    nick: 'Hole in one, helst i en annan bil',
    emoji: '⛳',
    course: BOSS_COURSE.goran,
    act: 0,
    vehicle: 'Golfbil',
    archetype: 'mixed',
    intro: '“Fore! Jag är proffs. På golf, alltså. Bilen är bara en golfbil med lite extra motor. Håll huvudet nere!”',
    trick: 'Göran slår ut golfbollar som studsar över banan. Blir du träffad snurrar du runt.',
    twist: { boss: { name: 'Golf-Göran', body: 'golf', color: '#f2f2f2', trim: '#2fa84f', helmet: 'dots', power: 1.1, skill: 1.0 }, gimmicks: ['golf'] },
  },
  tina: {
    id: 'tina',
    name: 'Tina Kartörner',
    nick: 'Hon har alltid rätt. Nästan alltid',
    emoji: '🗺️',
    course: BOSS_COURSE.tina,
    act: 0,
    vehicle: 'Rallybil med antenn',
    archetype: 'racer',
    intro: '“Vänster fyra, hopp, lita på mig! Jag har kartan. Jag har alltid kartan. Ibland har jag den upp och ner.”',
    trick: 'Tina sätter upp skyltar med pilar åt fel håll, och ibland snurrar hennes karta runt din minikarta. Hon menar väl.',
    twist: { boss: { name: 'Tina Kartörner', body: 'coupe', color: '#ff8a1f', trim: '#f2f2f2', helmet: 'star', extras: ['antenna'], power: 1.07, skill: 1.0 }, gimmicks: ['signs'] },
  },
  freddie: {
    id: 'freddie',
    name: 'Fotbolls-Freddie',
    nick: 'Skjuter först, frågar sen',
    emoji: '⚽',
    course: BOSS_COURSE.freddie,
    act: 1,
    vehicle: 'Sandbuggy i gräsgrönt',
    archetype: 'rammer',
    intro: '“MÅÅÅL! Jag skjuter från alla håll. Bollen är större än du trodde. Gör dig redo för straffläggning!”',
    trick: 'Freddie skjuter jättestora fotbollar tvärs över vägen. Du ser bollen ligga vid kanten precis innan.',
    twist: { boss: { name: 'Fotbolls-Freddie', body: 'buggy', color: '#2fa84f', trim: '#f2f2f2', helmet: 'wing', power: 1.1, skill: 1.035 }, gimmicks: ['football'] },
  },
  mats: {
    id: 'mats',
    name: 'Målvakten Mats',
    nick: 'Stoppar allt, utom sin ismaskin',
    emoji: '🏒',
    course: BOSS_COURSE.mats,
    act: 1,
    vehicle: 'Ismaskin (en traktor med blått skal)',
    archetype: 'mixed',
    intro: '“Jag har stoppat tusen skott. Nu stoppar jag dig. Min ismaskin gör banan blank. Jag kör sakta och skrattar.”',
    trick: 'Mats lämnar en hal isremsa efter sin ismaskin. Kör bredvid den, eller sladda och hoppas.',
    twist: { boss: { name: 'Målvakten Mats', body: 'tractor', color: '#bfe9ff', trim: '#1f3a93', helmet: 'stripe', power: 1.14, skill: 1.035 }, gimmicks: ['ice'] },
  },
  berit: {
    id: 'berit',
    name: 'Bowling-Berit',
    nick: 'Fäller allt som står i vägen',
    emoji: '🎳',
    course: BOSS_COURSE.berit,
    act: 1,
    vehicle: 'Limousin i bowlinglila',
    archetype: 'racer',
    intro: '“Strike! Jag rullar klot nerför backarna och ställer käglor på vägen. Du är nästa kägla, vännen.”',
    trick: 'Berit rullar tunga bowlingklot nerför backen mot dig och ställer upp käglor på vägen.',
    twist: { boss: { name: 'Bowling-Berit', body: 'limo', color: '#8a4fd8', trim: '#ffd23f', helmet: 'twin', power: 1.1, skill: 1.035 }, gimmicks: ['bowling'] },
  },
  loeb: {
    id: 'loeb',
    name: 'Sébastien Loebsedel',
    title: 'Världsmästaren',
    nick: 'Nio titlar, noll felbromsningar',
    emoji: '🏆',
    course: BOSS_COURSE.loeb,
    act: 2,
    vehicle: 'Rallybil, helt perfekt trimmad',
    archetype: 'racer',
    champion: true,
    intro: '“Bonjour. Nio titlar. Jag bromsar inte i kurvor, det är bara ett förslag. Vi ses i mål, om du hittar dit.”',
    trick: 'Perfekt kurvtagning och nitro på varje raksträcka. Dessutom lånar han ett trick av en annan boss.',
    twist: { boss: { name: 'Sébastien Loebsedel', body: 'coupe', color: '#1f3a93', trim: '#e8412c', helmet: 'bolt', power: 1.14, skill: 1.05 }, gimmicks: [] },
  },
  stig: {
    id: 'stig',
    name: 'Stig Blomgrus',
    title: 'Världsmästaren',
    nick: 'Mästaren som aldrig slutade',
    emoji: '🏆',
    course: BOSS_COURSE.stig,
    act: 2,
    vehicle: 'Klassisk rallybil, snyggt slitna däck',
    archetype: 'racer',
    rivalId: 'stig',
    champion: true,
    intro: '“Jag körde grus innan du var påtänkt. En perfekt linje är som en bra historia: den har ingen omväg. Sitt still och titta.”',
    trick: 'Perfekt kurvtagning och nitro på varje raksträcka. Dessutom lånar han ett trick av en annan boss.',
    twist: { boss: { name: 'Stig Blomgrus', body: 'hatch', color: '#1f3a93', trim: '#f2f2f2', helmet: 'stripe', power: 1.14, skill: 1.05 }, gimmicks: [] },
  },
  kanin: {
    id: 'kanin',
    name: 'Kapten Kanin',
    nick: 'Månens krigsherre, äter morötter och förlorare',
    emoji: '🚀',
    course: BOSS_COURSE.kanin,
    act: 2,
    vehicle: 'Soffa med långa öron på hjälmen',
    archetype: 'mixed',
    intro: '“Jag är Kapten Kanin, krigsherre över månen. Jag äter morötter och förlorare. Knäpp med öronen: ni är mina!”',
    trick: 'Månen har låg tyngdkraft. Kanin kör soffa och studsar i jättehopp. De andra gör likadant och drar på nitron.',
    derbyTrick: 'Kanin har byggt en rivningsarena med månens tyngdkraft. Ingen mållinje: mest poäng vinner. Soffan studsar och hoppar mellan hoppen.',
    twist: { boss: { name: 'Kapten Kanin', body: 'sofa', color: '#6a4fd8', trim: '#f4c20d', helmet: 'ears', power: 1.05, skill: 1.0 }, rivalHop: 4.5, rivalNitro: 10 },
  },
};

/** The trick a world champion borrows in this race: one of the other bosses' gimmicks, picked from the node's seed. */
export const borrowedGimmick = (seed: number): GimmickId => BORROWED[Math.floor(unit(seed, 91) * BORROWED.length) % BORROWED.length]!;

/** A boss's twist for this node: the same for every boss but the champions, who add a borrowed gimmick. */
export function twistFor(def: BossDef, seed: number): RaceTwist {
  if (!def.champion) return def.twist;
  return { ...def.twist, gimmicks: [borrowedGimmick(seed)] };
}

/** What the boss's trick reads like in this race (a champion's line names the borrowed one). */
export function trickFor(def: BossDef, seed: number): string {
  if (!def.champion) return def.trick;
  const g = GIMMICKS[borrowedGimmick(seed)];
  return `${def.trick.replace(' Dessutom lånar han ett trick av en annan boss.', '')} Lånat trick: ${g.emoji} ${g.name}. ${g.text}`;
}

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
  /** A Rivningsderby in this arena: no laps, the last car running wins. */
  arena?: ArenaId;
}

const DIFFS: RallyDifficulty[] = ['easy', 'normal', 'hard'];
const stepDiff = (d: RallyDifficulty, by: number): RallyDifficulty => DIFFS[Math.max(0, Math.min(2, DIFFS.indexOf(d) + by))]!;

/** The time to beat in a "slå tiden" challenge (a little slower than gold). */
export function targetTimeMs(course: RallyCourse, laps: number, act = 0): number {
  // tighter later: act 1 a little slower than gold, act 3 right on gold
  const slack = [1.12, 1.06, 1.0][Math.min(2, Math.max(0, act))]!;
  return Math.round(RALLY_COURSE_DEFS[course].gold * laps * 1000 * slack + [3000, 2000, 1000][Math.min(2, Math.max(0, act))]!);
}

export function planRace(node: MapNode, difficulty: Difficulty | boolean): RacePlan {
  const diff = asDifficulty(difficulty);
  const calm = diff === 'calm';
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
    twist = twistFor(boss, node.seed);
    rules.course = boss.course;
    rules.laps = 3;
    // a boss race is a smaller field, so the boss is the fight and the heart rule for losing it is fair
    rules.ai = Math.max(3, rules.ai - 1);
    rules.difficulty = stepDiff(rules.difficulty, 1);
    rules.damage = true;
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
  // a Rivningsderby: an arena instead of a course, no laps, wrecks out for good (the elites and the odd last boss)
  const arena = node.derby;
  if (arena) {
    rules.arena = arena;
    rules.kind = 'carnage';
    rules.damage = true;
    rules.course = ARENAS[arena].course;
    // the laps are only for the prize, which reads them as "how long a race": a derby counts as three
    rules.laps = 3;
    rules.ai = Math.min(5, Math.max(4, rules.ai + (boss ? 1 : 0)));
    rules.weather = 'clear';
    // floodlit: night, or dusk now and then (from the node's seed)
    rules.time = node.seed % 3 === 0 ? 'sunset' : 'night';
    if (!boss) title = `${DERBY_NAME}: ${ARENAS[arena].name}`;
    prize = boss ? 2 : 1.55;
  }
  if (calm) {
    rules.ai = Math.max(2, rules.ai - 1);
    rules.difficulty = stepDiff(rules.difficulty, -1);
  }
  const field = buildField({
    seed: node.seed,
    kind: rules.kind,
    act,
    row: node.row,
    role: node.type === 'elite' ? 'elite' : boss ? 'boss' : 'rival',
    calm,
    diff,
    ai: rules.ai,
    boss: boss ? { id: boss.id, archetype: boss.archetype, power: boss.twist.boss?.power, skill: boss.twist.boss?.skill, rivalId: boss.rivalId, perfect: boss.champion } : undefined,
  });
  return { node, title, course: rules.course, rules, twist, goal, boss, prize, kind: rules.kind, field, arena };
}

/** Did the result meet the challenge's goal? */
export function goalMet(goal: Goal, r: { finished: boolean; place: number; time: number }): boolean {
  if (!r.finished) return false;
  return goal.kind === 'place' ? r.place <= goal.place : r.time > 0 && r.time <= goal.ms;
}
