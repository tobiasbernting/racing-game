// The cast of computer drivers. Each has a name, a nickname, a face (the animal or person in the helmet), a
// line of trash talk for the pre-race card and a taunt for when they overtake you.
import type { CarDriver } from './rally.ts';
import type { RaceKind } from './kinds.ts';

/** How a rival drives: a Rammer goes for you, a Racer keeps a clean line and brakes late, a Mixed does a bit of both. */
export const ARCHETYPES = ['rammer', 'racer', 'mixed'] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export const ARCHETYPE_NAMES: Record<Archetype, string> = { rammer: 'Rammare', racer: 'Racer', mixed: 'Blandad' };
export const ARCHETYPE_EMOJI: Record<Archetype, string> = { rammer: '🔨', racer: '⚡', mixed: '🔀' };
export const ARCHETYPE_TEXT: Record<Archetype, string> = {
  rammer: 'Sidosmäller, blockerar och jagar vrak. Krockar före kurvor.',
  racer: 'Ren linje, bromsar sent, drar nitron på raksträckor.',
  mixed: 'Kör rent tills du kommer för nära. Då blir det knuffar.',
};

export interface Rival {
  id: string;
  name: string;
  face: CarDriver;
  /** The driving style. */
  type: Archetype;
  /** The nickname, one short line under the name. */
  nick: string;
  /** Trash talk on the pre-race card. */
  talk: string;
  /** Shouted when they pass you. */
  taunt: string;
}

export const RIVALS: readonly Rival[] = [
  { id: 'tord', type: 'racer', name: 'Turbo-Tord', face: 'rooster', nick: 'Bromsen är bara ett förslag', talk: 'Jag har inte bromsat sedan 1994. Bromsen är borta. Jag saknar den inte.', taunt: 'Backspegeln är den lilla spegeln. Kolla in den!' },
  { id: 'gunnar', type: 'mixed', name: 'Grus-Gunnar', face: 'human', nick: 'Äter grus till frukost', talk: 'Du äter mitt grus i dag. Jag har extra.', taunt: 'Smaka på mitt grus, lilla vän!' },
  { id: 'lasse', type: 'mixed', name: 'Lasse Lågbudget', face: 'sheep', nick: 'Bilen kostade 900 kr på Blocket', talk: 'Min bil hålls ihop av tejp och trots. Den slår ändå dig.', taunt: 'Inte illa för en bil med tejp, va?' },
  { id: 'doris', type: 'rammer', name: 'Doris Däckdödare', face: 'cow', nick: 'Fyra däck i dag. Och en brevlåda', talk: 'Jag kör sönder däck. Och brevlådor. Och ditt självförtroende.', taunt: 'Hej då! Skicka vykort från diket.' },
  { id: 'kenta', type: 'racer', name: 'Kenta Kebab', face: 'cat', nick: 'Kör på extra sås', talk: 'Jag kör på kebab. Du kör på hopp. Hopp tar slut.', taunt: 'Mmm, extra sås. Du lämnades i röken!' },
  { id: 'mans', type: 'rammer', name: 'Mullbänks-Måns', face: 'pig', nick: 'Dikeskung sedan födseln', talk: 'Jag kör bäst i diket. Eller i andras bil. Samma sak.', taunt: 'Hoppsan! Jag tittade inte. Jag tittar aldrig.' },
  { id: 'sixten', type: 'mixed', name: 'Svettiga Sixten', face: 'dog', nick: 'Duschade senast i midsommar', talk: 'Ingen vågar köra bredvid mig. Fråga inte varför.', taunt: 'Känner du doften av seger? Det är jag.' },
  { id: 'fartkvick', type: 'racer', name: 'Fru Fartkvick', face: 'horse', nick: 'Körde före bilarna fanns', talk: 'Jag har kört längre än du har levt. Sitt still och titta.', taunt: 'Ursäkta, tanten har bråttom!' },
  { id: 'kjell', type: 'mixed', name: 'Radar-Kjell', face: 'human', nick: 'Lånade polisens bil', talk: 'Jag lånade polisens bil. Ingen frågade. Jag kör hur jag vill.', taunt: 'Du körde för fort! Det gjorde jag också. Jag vann.' },
  { id: 'roffe', type: 'rammer', name: 'Raggar-Roffe', face: 'cat', nick: 'Mustaschen väger mer än bilen', talk: 'Min V8 väger mer än din bil. Min mustasch också.', taunt: 'Vroom vroom, lillen. Det där var en V8.' },
  { id: 'mormor', type: 'rammer', name: 'Mormor Motorsåg', face: 'rabbit', nick: 'Stickar tröjor åt alla hon kör om', talk: 'Du får en tröja efteråt. Den passar perfekt till andraplatsen.', taunt: 'Tröjan blir klar när du är sist, gubben!' },
  { id: 'egon', type: 'racer', name: 'Egon Ensam', face: 'rabbit', nick: 'Inga vänner, mycket träning', talk: 'Jag har inga vänner. Därför hinner jag träna. Mycket.', taunt: 'Ingen kramar. Bara fart.' },
];

export const RIVAL_COUNT = RIVALS.length;

function mulberry(a: number): () => number {
  let t = a >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** The archetypes a race kind likes: Rally leans on racers, Blodbad on rammers, Blandat on all of them. */
export const KIND_ARCHETYPE_WEIGHT: Record<RaceKind, Record<Archetype, number>> = {
  rally: { racer: 3, mixed: 1.6, rammer: 0.45 },
  mixed: { racer: 1, mixed: 1.2, rammer: 1 },
  carnage: { racer: 0.45, mixed: 1.6, rammer: 3 },
};

export const rivalById = (id: string): Rival | undefined => RIVALS.find((r) => r.id === id);

/**
 * `n` different rivals for a race, picked from the seed (the same seed always gives the same grid, and a longer
 * grid starts with the shorter one). With a race kind the picks lean on the archetypes it likes (a weighted
 * shuffle, so a Rally grid is mostly racers). Faces differ where they can.
 */
export function rivalCast(seed: number, n: number, kind?: RaceKind): Rival[] {
  const rnd = mulberry(seed ^ 0x51ed);
  let pool = [...RIVALS];
  if (kind) {
    const w = KIND_ARCHETYPE_WEIGHT[kind];
    // weighted shuffle: the key is -ln(u)/weight, smallest first
    const keyed = pool.map((r) => ({ r, k: -Math.log(Math.max(1e-9, rnd())) / w[r.type] }));
    pool = keyed.sort((a, b) => a.k - b.k).map((x) => x.r);
  } else {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
  }
  const out: Rival[] = [];
  const faces = new Set<CarDriver>();
  for (const r of pool) {
    if (out.length >= n) break;
    if (faces.has(r.face)) continue;
    out.push(r);
    faces.add(r.face);
  }
  for (const r of pool) {
    if (out.length >= n) break;
    if (!out.includes(r)) out.push(r);
  }
  return out;
}
