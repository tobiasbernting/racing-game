// The cast of computer drivers. Each has a name, a nickname, a face (the animal or person in the helmet), a
// line of trash talk for the pre-race card and a taunt for when they overtake you.
import type { CarDriver } from './rally.ts';

export interface Rival {
  id: string;
  name: string;
  face: CarDriver;
  /** The nickname, one short line under the name. */
  nick: string;
  /** Trash talk on the pre-race card. */
  talk: string;
  /** Shouted when they pass you. */
  taunt: string;
}

export const RIVALS: readonly Rival[] = [
  { id: 'tord', name: 'Turbo-Tord', face: 'rooster', nick: 'Bromsen är bara ett förslag', talk: 'Jag har inte bromsat sedan 1994. Bromsen är borta. Jag saknar den inte.', taunt: 'Backspegeln är den lilla spegeln. Kolla in den!' },
  { id: 'gunnar', name: 'Grus-Gunnar', face: 'human', nick: 'Äter grus till frukost', talk: 'Du äter mitt grus i dag. Jag har extra.', taunt: 'Smaka på mitt grus, lilla vän!' },
  { id: 'lasse', name: 'Lasse Lågbudget', face: 'sheep', nick: 'Bilen kostade 900 kr på Blocket', talk: 'Min bil hålls ihop av tejp och trots. Den slår ändå dig.', taunt: 'Inte illa för en bil med tejp, va?' },
  { id: 'doris', name: 'Doris Däckdödare', face: 'cow', nick: 'Fyra däck i dag. Och en brevlåda', talk: 'Jag kör sönder däck. Och brevlådor. Och ditt självförtroende.', taunt: 'Hej då! Skicka vykort från diket.' },
  { id: 'kenta', name: 'Kenta Kebab', face: 'cat', nick: 'Kör på extra sås', talk: 'Jag kör på kebab. Du kör på hopp. Hopp tar slut.', taunt: 'Mmm, extra sås. Du lämnades i röken!' },
  { id: 'mans', name: 'Mullbänks-Måns', face: 'pig', nick: 'Dikeskung sedan födseln', talk: 'Jag kör bäst i diket. Eller i andras bil. Samma sak.', taunt: 'Hoppsan! Jag tittade inte. Jag tittar aldrig.' },
  { id: 'sixten', name: 'Svettiga Sixten', face: 'dog', nick: 'Duschade senast i midsommar', talk: 'Ingen vågar köra bredvid mig. Fråga inte varför.', taunt: 'Känner du doften av seger? Det är jag.' },
  { id: 'fartkvick', name: 'Fru Fartkvick', face: 'horse', nick: 'Körde före bilarna fanns', talk: 'Jag har kört längre än du har levt. Sitt still och titta.', taunt: 'Ursäkta, tanten har bråttom!' },
  { id: 'kjell', name: 'Radar-Kjell', face: 'human', nick: 'Lånade polisens bil', talk: 'Jag lånade polisens bil. Ingen frågade. Jag kör hur jag vill.', taunt: 'Du körde för fort! Det gjorde jag också. Jag vann.' },
  { id: 'roffe', name: 'Raggar-Roffe', face: 'cat', nick: 'Mustaschen väger mer än bilen', talk: 'Min V8 väger mer än din bil. Min mustasch också.', taunt: 'Vroom vroom, lillen. Det där var en V8.' },
  { id: 'mormor', name: 'Mormor Motorsåg', face: 'rabbit', nick: 'Stickar tröjor åt alla hon kör om', talk: 'Du får en tröja efteråt. Den passar perfekt till andraplatsen.', taunt: 'Tröjan blir klar när du är sist, gubben!' },
  { id: 'egon', name: 'Egon Ensam', face: 'rabbit', nick: 'Inga vänner, mycket träning', talk: 'Jag har inga vänner. Därför hinner jag träna. Mycket.', taunt: 'Ingen kramar. Bara fart.' },
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

/** `n` different rivals for a race, picked from the seed (the same seed always gives the same grid). Faces differ where they can. */
export function rivalCast(seed: number, n: number): Rival[] {
  const rnd = mulberry(seed ^ 0x51ed);
  const pool = [...RIVALS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
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
