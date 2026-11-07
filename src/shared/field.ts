// The field: who you race against and how good they are. Rivals are Rammers, Racers or Mixed, they grow through
// a run (upgrades like the player's, modifiers of their own, sharper driving, a catch-up when they fall behind),
// and the roguelite layer turns a map node into a FieldPlan that the race reads. Pure data and formulas.
import { KIND_AGGRO, type RaceKind } from './kinds.ts';
import { PART_EFFECTS } from './rally.ts';
import { ARCHETYPES, rivalCast, type Archetype } from './rivals.ts';

export type RivalRole = 'rival' | 'elite' | 'boss';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** A deterministic 0..1 from a seed and any number of slots. */
export function unit(seed: number, ...k: number[]): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  for (const x of k) {
    h = Math.imul(h ^ (x + 0x7f4a7c15), 0x85ebca6b);
    h ^= h >>> 15;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 13;
  }
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// How far into the run
// ---------------------------------------------------------------------------

/** Nodes per act along a path: five rows and the boss row. */
const ACT_SPAN = 6;
/** 0 at the very first row, 1 at the last boss. */
export const runProgress = (act: number, row: number): number => clamp((act * ACT_SPAN + Math.min(ACT_SPAN - 1, Math.max(0, row))) / (3 * ACT_SPAN - 1), 0, 1);

// ---------------------------------------------------------------------------
// Archetypes
// ---------------------------------------------------------------------------

export interface ArchetypeDef {
  /** How hungry for contact (0..1) before the race kind scales it. */
  aggro: number;
  /** Share of the racing line used (1 = the full line). */
  lineUse: number;
  /** How late they brake (0..1). */
  late: number;
  /** How readily they fire a nitro (1 = whenever there is a straight). */
  nitro: number;
  skill: number;
  mass: number;
  ram: number;
  hp: number;
  /** Their own appetite for each modifier (see RIVAL_MODS). */
}

export const ARCHETYPE_DEFS: Record<Archetype, ArchetypeDef> = {
  racer: { aggro: 0.08, lineUse: 1, late: 0.7, nitro: 1, skill: 0.02, mass: 0.95, ram: 0.8, hp: 0.9 },
  mixed: { aggro: 0.5, lineUse: 0.9, late: 0.45, nitro: 0.65, skill: 0, mass: 1.05, ram: 1.1, hp: 1 },
  rammer: { aggro: 1, lineUse: 0.8, late: 0.2, nitro: 0.35, skill: -0.02, mass: 1.2, ram: 1.5, hp: 1.25 },
};

// ---------------------------------------------------------------------------
// Rival modifiers: trinkets of their own
// ---------------------------------------------------------------------------

export interface RivalFx {
  power: number;
  grip: number;
  brakes: number;
  /** Damage taken is multiplied by this. */
  dmgTaken: number;
  hp: number;
  ram: number;
  mass: number;
  /** 1 spins fully on oil, hay and slime; below 1 hardly notices. */
  slip: number;
  /** Seconds between nitro bursts (0 = none) and between oil slicks dropped behind (0 = none). */
  nitroEvery: number;
  oilEvery: number;
  late: number;
}

const noFx = (): RivalFx => ({ power: 1, grip: 1, brakes: 1, dmgTaken: 1, hp: 1, ram: 1, mass: 1, slip: 1, nitroEvery: 0, oilEvery: 0, late: 0 });

export interface RivalModDef {
  id: string;
  name: string;
  emoji: string;
  text: string;
  /** How often each archetype picks it. */
  weight: Record<Archetype, number>;
  apply(fx: RivalFx): void;
}

export const RIVAL_MODS: readonly RivalModDef[] = [
  { id: 'nitro', name: 'Chilikorv', emoji: '🔥', text: 'Drar nitron på raksträckorna.', weight: { racer: 3, mixed: 1.6, rammer: 1 }, apply: (f) => (f.nitroEvery = f.nitroEvery ? f.nitroEvery * 0.7 : 11) },
  { id: 'plate', name: 'Plåtkostym', emoji: '🛡️', text: 'Tål smällar: 25 % mindre skada.', weight: { racer: 0.6, mixed: 1.4, rammer: 2 }, apply: (f) => (f.dmgTaken *= 0.75) },
  { id: 'spikes', name: 'Spikfälgar', emoji: '🔩', text: 'Rammar 50 % hårdare.', weight: { racer: 0.3, mixed: 1.2, rammer: 3 }, apply: (f) => (f.ram *= 1.5) },
  { id: 'heavy', name: 'Gjutjärnsmotor', emoji: '🏋️', text: 'Väger som en bastu. Svår att putta.', weight: { racer: 0.3, mixed: 1.2, rammer: 2.5 }, apply: (f) => (f.mass *= 1.35) },
  { id: 'studs', name: 'Dubbdäck', emoji: '🛞', text: 'Mer grepp i kurvorna (8 %).', weight: { racer: 2.5, mixed: 1.5, rammer: 0.6 }, apply: (f) => (f.grip *= 1.08) },
  { id: 'motor', name: 'Raggarmotorn', emoji: '💪', text: 'Tio procent mer kraft.', weight: { racer: 2.5, mixed: 1.5, rammer: 1 }, apply: (f) => (f.power *= 1.1) },
  { id: 'oil', name: 'Oljeläckan', emoji: '🛢️', text: 'Släpper oljefläckar bakom sig.', weight: { racer: 1, mixed: 1.3, rammer: 1 }, apply: (f) => (f.oilEvery = 16) },
  { id: 'clover', name: 'Fyrklöver', emoji: '🍀', text: 'Halkar nästan aldrig på olja, hö och slem.', weight: { racer: 1, mixed: 1, rammer: 1 }, apply: (f) => (f.slip *= 0.25) },
  { id: 'tank', name: 'Extra liv', emoji: '🩹', text: '50 % mer hälsa i Blodbad.', weight: { racer: 0.6, mixed: 1.2, rammer: 2 }, apply: (f) => (f.hp *= 1.5) },
  { id: 'brakes', name: 'Racerbromsar', emoji: '🛑', text: 'Bromsar senare och hårdare.', weight: { racer: 2.5, mixed: 1.2, rammer: 0.3 }, apply: (f) => ((f.brakes *= 1.2), (f.late += 0.2)) },
];
export const rivalModById = (id: string): RivalModDef | undefined => RIVAL_MODS.find((m) => m.id === id);

/** Extra rules some bosses play by in the later acts. */
export const BOSS_RULES = {
  lastlap: { name: 'Sista varvet', emoji: '🔥', text: 'Sista varvet kör bossen 6 % fortare.' },
  regen: { name: 'Läker sig själv', emoji: '🩹', text: 'I Blodbad läker bossen när ingen har smällt in på 3 sekunder.' },
} as const;
export type BossRule = keyof typeof BOSS_RULES;
/** The extra speed of a boss on its last lap. */
export const LASTLAP_BOOST = 0.06;

/** How many modifiers a rival of this role has at this point of the run (ordinary rivals 1-2 from act 2, elites 3, bosses more). */
export function modCount(act: number, row: number, role: RivalRole, calm: boolean, u: number): number {
  let n: number;
  if (role === 'boss') n = [1, 3, 5][Math.min(2, act)]!;
  else if (role === 'elite') n = act === 0 ? 1 : 3;
  else if (act === 0) n = 0;
  else if (act === 1) n = 1 + (row >= 3 && u < 0.4 ? 1 : 0);
  else n = 1 + (row >= 1 || u < 0.5 ? 1 : 0);
  if (calm) n = role === 'boss' ? Math.ceil(n / 2) : role === 'elite' ? (act === 0 ? 0 : 1) : act >= 2 ? 1 : 0;
  return n;
}

// ---------------------------------------------------------------------------
// The scaling curve
// ---------------------------------------------------------------------------

/** Part level (0..3, fractional) rivals have by now: roughly what a good player has bought, all of it from act 3 row 2. */
export function partLevel(t: number, role: RivalRole, calm: boolean): number {
  // 3 is a full set; the last stretch of the run goes a notch past it (a tuned car, no more than the player's caps allow)
  let lv = 4.2 * Math.pow(clamp((t - 0.03) / 0.8, 0, 1), 1.8);
  if (role === 'elite') lv += 0.35;
  if (role === 'boss') lv += 0;
  if (calm) lv *= 0.35;
  return clamp(lv, 0, 4.4);
}

/** Rivals' courage, as a share of the corner speed they dare (the driving ceiling is about 1.06). */
export function rivalSkill(t: number, role: RivalRole, calm: boolean): number {
  const bump = role === 'boss' ? -0.015 : role === 'elite' ? 0.006 : 0;
  if (calm) return 0.8 + 0.07 * t + bump * 0.5;
  return 0.85 + 0.21 * Math.pow(t, 2.0) + bump;
}
export const SKILL_CEILING = 1.06;

/** Each grid slot drives a little differently (the front of the grid is better). */
const SLOT_SKILL = [0.04, 0.02, 0, -0.02, -0.04];
const SLOT_POWER = [1, 0.99, 0.98, 0.97, 0.96];

// ---------------------------------------------------------------------------
// Catch-up
// ---------------------------------------------------------------------------

export interface CatchUp {
  /** A rival this far behind the player (m) starts to get help, in full at start + ramp. */
  start: number;
  ramp: number;
  /** The most extra speed (a share, 0.1 = 10 %) it ever gets. */
  max: number;
  /** A rival ahead of the player by more than 20 m eases off by up to this much, over `easeRamp` m. */
  easeMax: number;
  easeRamp: number;
}

export function catchUpFor(act: number, calm: boolean): CatchUp {
  const max = [0.05, 0.08, 0.14][Math.min(2, Math.max(0, act))]!;
  return calm ? { start: 40, ramp: 260, max: max * 0.45, easeMax: 0.2, easeRamp: 500 } : { start: 40, ramp: 260, max, easeMax: [0.12, 0.09, 0.04][Math.min(2, Math.max(0, act))]!, easeRamp: 800 };
}

/** Extra speed (a share) for a rival `gap` metres behind the player (gap > 0 means behind). Never for one in front. */
export function catchUpBoost(gap: number, c: CatchUp): number {
  if (gap <= c.start) return 0;
  return c.max * clamp((gap - c.start) / c.ramp, 0, 1);
}

/** A rival `ahead` metres in front of the player eases off a little (never the other way round). */
export function easeOff(ahead: number, c: CatchUp): number {
  if (ahead <= 20) return 0;
  return Math.min(c.easeMax, ((ahead - 20) / c.easeRamp) * c.easeMax * 2.2);
}

// ---------------------------------------------------------------------------
// The plan for a race
// ---------------------------------------------------------------------------

export interface RivalSpec {
  slot: number;
  /** A rival's id (shared/rivals.ts) or `boss`. */
  id: string;
  boss: boolean;
  role: RivalRole;
  archetype: Archetype;
  /** Part level they were given (0..3). */
  level: number;
  skill: number;
  power: number;
  grip: number;
  brakes: number;
  dmgTaken: number;
  /** Health in Blodbad as a multiplier on the car's own. */
  hp: number;
  ram: number;
  mass: number;
  slip: number;
  nitroEvery: number;
  oilEvery: number;
  late: number;
  /** 0..1 appetite for contact, already scaled by the race kind. */
  aggro: number;
  lineUse: number;
  /** Nitro appetite 0..1. */
  nitro: number;
  mods: string[];
  rules: BossRule[];
}

export interface Hazards {
  /** Per lap. */
  hay: number;
  oil: number;
  pothole: number;
}

export interface FieldPlan {
  kind: RaceKind;
  act: number;
  row: number;
  calm: boolean;
  /** How far into the run, 0..1. */
  t: number;
  rivals: RivalSpec[];
  catchUp: CatchUp;
  /** 0..1: how sharp the driving is (racing line, braking points). */
  sharp: number;
  hazards: Hazards;
  /** The road is this much of its normal width. */
  narrow: number;
}

export interface FieldInput {
  seed: number;
  kind: RaceKind;
  act: number;
  row: number;
  role: RivalRole;
  calm: boolean;
  /** Computer cars. */
  ai: number;
  boss?: { id: string; archetype: Archetype; power?: number; skill?: number };
}

/** Hazards on the road per lap: more of everything later in the run, more oil in Blodbad, fewer in Rally. */
export function hazardsFor(act: number, kind: RaceKind, calm: boolean): Hazards {
  const a = Math.min(2, Math.max(0, act));
  const h: Hazards = { hay: [0, 2, 4][a]!, oil: [0, 1, 3][a]!, pothole: [0, 2, 4][a]! };
  if (kind === 'carnage') {
    h.hay += a > 0 ? 1 : 0;
    h.oil += a > 0 ? 1 : 0;
  } else if (kind === 'rally') h.oil = Math.max(0, h.oil - 1);
  if (calm) return { hay: Math.floor(h.hay / 2), oil: Math.floor(h.oil / 2), pothole: Math.floor(h.pothole / 2) };
  return h;
}

export const narrowFor = (act: number, calm: boolean): number => (calm ? 1 : [1, 0.95, 0.9][Math.min(2, Math.max(0, act))]!);

/** The kit a rival has: its part levels, modifiers and temper, from where the run has got to. */
export function buildField(i: FieldInput): FieldPlan {
  const t = runProgress(i.act, i.row);
  const cast = rivalCast(i.seed, Math.max(i.ai, 1), i.kind);
  const rivals: RivalSpec[] = [];
  for (let slot = 0; slot < i.ai; slot++) {
    const boss = slot === 0 && i.boss ? i.boss : undefined;
    const rv = cast[slot]!;
    const archetype: Archetype = boss ? boss.archetype : rv.type;
    const role: RivalRole = boss ? 'boss' : i.role === 'elite' ? 'elite' : 'rival';
    const def = ARCHETYPE_DEFS[archetype];
    // the boss's company is a step behind it
    const lv = partLevel(role === 'boss' || !i.boss ? t : Math.max(0, t - 0.12), role, i.calm);
    // archetypes put their money in different parts
    const engine = lv * (archetype === 'racer' ? 1 : archetype === 'rammer' ? 0.9 : 0.95);
    const tyres = lv * (archetype === 'racer' ? 1 : archetype === 'rammer' ? 0.7 : 0.9);
    const brakes = lv * (archetype === 'racer' ? 1 : 0.7);
    const armour = Math.min(3, lv * (archetype === 'rammer' ? 1 : archetype === 'racer' ? 0.5 : 0.75));
    const fx = noFx();
    // modifiers: seeded picks without repeats, by the archetype's taste
    const n = modCount(i.act, i.row, role, i.calm, unit(i.seed, slot, 7));
    const mods: string[] = [];
    const left = [...RIVAL_MODS];
    for (let k = 0; k < n && left.length; k++) {
      const total = left.reduce((a, m) => a + m.weight[archetype], 0);
      let x = unit(i.seed, slot, 100 + k) * total;
      let pick = left[left.length - 1]!;
      for (const m of left) {
        x -= m.weight[archetype];
        if (x < 0) {
          pick = m;
          break;
        }
      }
      left.splice(left.indexOf(pick), 1);
      pick.apply(fx);
      mods.push(pick.id);
    }
    if (fx.nitroEvery > 0) fx.nitroEvery = fx.nitroEvery / (0.6 + 0.6 * def.nitro);
    const rules: BossRule[] = boss ? (i.act >= 2 ? ['lastlap', 'regen'] : i.act >= 1 ? ['lastlap'] : []) : [];
    const skill = clamp(rivalSkill(t, role, i.calm) + def.skill + (boss ? 0 : (SLOT_SKILL[slot] ?? -0.04) * 0.7), 0.6, SKILL_CEILING);
    const bossSkill = boss?.skill ?? 0;
    rivals.push({
      slot,
      id: boss ? 'boss' : rv.id,
      boss: !!boss,
      role,
      archetype,
      level: Math.round(lv * 100) / 100,
      skill: boss && i.act >= 1 ? clamp(Math.max(skill, i.calm ? 0 : bossSkill - 0.02), 0.6, SKILL_CEILING) : skill,
      power: (1 + PART_EFFECTS.enginePower * engine) * (SLOT_POWER[slot] ?? 0.96) * fx.power * (boss?.power ?? 1),
      grip: (1 + PART_EFFECTS.tyresGrip * tyres) * fx.grip,
      brakes: (1 + PART_EFFECTS.brakesForce * brakes) * fx.brakes,
      dmgTaken: Math.max(0.2, (1 - PART_EFFECTS.armourShield * armour) * fx.dmgTaken),
      hp: def.hp * fx.hp * (role === 'boss' ? 1.3 : role === 'elite' ? 1.1 : 1),
      ram: def.ram * fx.ram,
      mass: def.mass * fx.mass,
      slip: fx.slip,
      nitroEvery: fx.nitroEvery,
      oilEvery: fx.oilEvery,
      late: clamp(def.late + fx.late + 0.3 * t, 0, 1),
      aggro: clamp(def.aggro * KIND_AGGRO[i.kind] * (role === 'boss' ? 1.15 : 1), 0, 1),
      lineUse: def.lineUse + (1 - def.lineUse) * t * 0.8,
      nitro: def.nitro,
      mods,
      rules,
    });
  }
  return { kind: i.kind, act: i.act, row: i.row, calm: i.calm, t, rivals, catchUp: catchUpFor(i.act, i.calm), sharp: i.calm ? 0.3 * t : 0.2 + 0.8 * t, hazards: hazardsFor(i.act, i.kind, i.calm), narrow: narrowFor(i.act, i.calm) };
}

export const archetypeCounts = (f: FieldPlan): Record<Archetype, number> => {
  const out = { rammer: 0, racer: 0, mixed: 0 } as Record<Archetype, number>;
  for (const r of f.rivals) out[r.archetype]++;
  return out;
};
void ARCHETYPES;
