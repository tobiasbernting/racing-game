// The cast of computer drivers: friendly puns on famous rally drivers and sports stars (never mean about the real person),
// every one a person in a helmet of their own colours. Each has a name, a nickname, a line of trash talk for the pre-race
// card, a taunt for when they overtake you, and the livery and helmet design their portrait is drawn from.
import type { HelmetDesign } from './rally.ts';
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
  /** Which part of the grid they come from: the Swedish rally greats or the rest of the world's sports stars (all of it in good fun). */
  group: 'se' | 'int';
  /** The driving style. */
  type: Archetype;
  /** The nickname, one short line under the name. */
  nick: string;
  /** Trash talk on the pre-race card. */
  talk: string;
  /** Shouted when they pass you. */
  taunt: string;
  /** The livery: the main colour (car, helmet) and the trim (stripes, helmet pattern). */
  colors: [string, string];
  /** The pattern on their helmet. */
  helmet: HelmetDesign;
  /** The two letters on the helmet portrait. */
  initials: string;
}

export const RIVALS: readonly Rival[] = [
  // ---- the Swedish rally greats, as puns ----
  { id: 'stig', group: 'se', type: 'racer', name: 'Stig Blomgrus', nick: 'Den gamle mästaren', talk: 'Jag körde grus innan du hade tänder. Sitt still och lär dig något.', taunt: 'Så där gör man, unge man. Skriv upp det!', colors: ['#1f3a93', '#f2f2f2'], helmet: 'stripe', initials: 'SB' },
  { id: 'bjorn', group: 'se', type: 'mixed', name: 'Björn Waldegrus', nick: 'Safarilegenden', talk: 'Jag har kört genom Afrika. Din lilla bana är ett kafferep.', taunt: 'Safari, safari! Hälsa lejonen när du kommer ikapp.', colors: ['#c9a24b', '#2a2a2e'], helmet: 'twin', initials: 'BW' },
  { id: 'per', group: 'se', type: 'rammer', name: 'Per Ekgrus', nick: 'Knuffar hellre än han bromsar', talk: 'Bromsen är till för dem som saknar stötfångare. Jag har två.', taunt: 'Oj, var det du? Stötfångaren märkte ingenting.', colors: ['#2fa84f', '#ffd23f'], helmet: 'checker', initials: 'PE' },
  { id: 'kenneth', group: 'se', type: 'racer', name: 'Kenneth Grusiksson', nick: 'Gasen i botten sedan 1988', talk: 'Jag har bara en pedal. Den till höger. Jag trampar på den.', taunt: 'Titta, en bakruta! Den är min.', colors: ['#e8412c', '#f2f2f2'], helmet: 'flame', initials: 'KG' },
  { id: 'mattias', group: 'se', type: 'rammer', name: 'Mattias Eksprång', nick: 'Hoppar först, tittar sen', talk: 'Banan har hopp. Jag tar alla. Och lite av dig också.', taunt: 'Hoppla! Du var i landningsrutan.', colors: ['#ff8a1f', '#15171c'], helmet: 'star', initials: 'ME' },
  { id: 'pontus', group: 'se', type: 'racer', name: 'Pontus Tidsmand', nick: 'Klockan är hans bästa vän', talk: 'Jag kör efter klockan. Du kör efter humöret. Klockan vinner.', taunt: 'Tick tack! Du är sen.', colors: ['#18b7c9', '#1f3a93'], helmet: 'bolt', initials: 'PT' },
  { id: 'oliver', group: 'se', type: 'racer', name: 'Oliver Solgrus', nick: 'Den unga stjärnan', talk: 'Pappa lärde mig allt. Sedan lärde jag mig lite mer. Fort.', taunt: 'Hälsa pappa att jag körde om dig!', colors: ['#f4c20d', '#2f6fe0'], helmet: 'wing', initials: 'OS' },
  { id: 'johan', group: 'se', type: 'rammer', name: 'Johan Kristofferstorque', nick: 'Rallycrossens kung', talk: 'Jag kör rallycross. Där är grannen alltid i vägen. Så är det här också.', taunt: 'Kungen kommer! Ge plats åt kronan.', colors: ['#8a4fd8', '#ffd23f'], helmet: 'dots', initials: 'JK' },
  { id: 'harry', group: 'se', type: 'mixed', name: 'Harry Kallstart', nick: 'Motorn vaknar sist av alla', talk: 'Min bil behöver en minut på morgonen. Sedan blir den arg. På ett bra sätt.', taunt: 'Nu har motorn vaknat! God morgon, du!', colors: ['#6b7280', '#e8412c'], helmet: 'twin', initials: 'HK' },
  // ---- the rest of the world's sports stars, as puns ----
  { id: 'leo', group: 'int', type: 'racer', name: 'Leo Messimotor', nick: 'Dribblar mellan bilarna', talk: 'Jag slingrar mig förbi alla. Bilarna står helt still, tycker jag.', taunt: 'En liten finta, och borta var jag!', colors: ['#7fb8ff', '#f2f2f2'], helmet: 'stripe', initials: 'LM' },
  { id: 'rovolvodo', group: 'int', type: 'rammer', name: 'Rovolvodo', nick: 'Volvo i hjärtat, mål i blicken', talk: 'Min bil är stadig som en Volvo och snabb som en fotbollsstjärna. Mest stadig.', taunt: 'Siuu! ...Nej, det var motorn.', colors: ['#c0392b', '#2f9e44'], helmet: 'star', initials: 'RV' },
  { id: 'zlatan', group: 'int', type: 'rammer', name: 'Zlatan Grusimović', nick: 'Banan behöver honom, inte tvärtom', talk: 'Jag behöver ingen bana. Banan behöver mig.', taunt: 'Zlatan passerar. Applådera gärna.', colors: ['#f4c20d', '#1f3a93'], helmet: 'flame', initials: 'ZG' },
  { id: 'sebastien', group: 'int', type: 'racer', name: 'Sébastien Ogrus', nick: 'Alla vägar leder till pokalen', talk: 'Jag har vunnit så många gånger att pokalerna får dela rum.', taunt: 'Bonjour, och adjö!', colors: ['#2f6fe0', '#e8412c'], helmet: 'checker', initials: 'SO' },
  { id: 'kalle', group: 'int', type: 'racer', name: 'Kalle Rovanplåt', nick: 'Sladdar som på is, varje gång', talk: 'Jag sladdar för att det är roligt. Att jag vinner är en bonus.', taunt: 'Wiii! Fråga inte hur jag gjorde.', colors: ['#f2f2f2', '#18b7c9'], helmet: 'wing', initials: 'KR' },
  { id: 'petter', group: 'int', type: 'mixed', name: 'Petter Solbergsgrus', nick: 'Ler mest när det smäller', talk: 'Jag vinner med ett leende. Och ibland med en stötfångare.', taunt: 'Tjoho! Det där gick ju bra, tycker jag.', colors: ['#d63aa5', '#f2f2f2'], helmet: 'dots', initials: 'PS' },
  { id: 'usain', group: 'int', type: 'racer', name: 'Usain Boltdragare', nick: 'Går på blixtens ström', talk: 'Hundra meter på nio sekunder. Sedan tar jag bilen och blir snabbare.', taunt: 'Blixten slår ner! Och du hann inte ens blinka.', colors: ['#ffd23f', '#16a34a'], helmet: 'bolt', initials: 'UB' },
  { id: 'serena', group: 'int', type: 'racer', name: 'Serena Williamsväxel', nick: 'Slår i nästa växel, och bollen', talk: 'Jag servar fart i fyra växlar. Du hinner inte returnera.', taunt: 'Ess! Du var för långsam.', colors: ['#8bc34a', '#8a4fd8'], helmet: 'twin', initials: 'SW' },
  { id: 'borg', group: 'int', type: 'mixed', name: 'Björn Borgtorque', nick: 'Ishjärta, pannband och fullt drag', talk: 'Jag är lugn som en isbit. Med pannband. Och mycket vridmoment.', taunt: 'Vilka nerver. Mina. Inte dina.', colors: ['#1f3a93', '#f2f2f2'], helmet: 'stripe', initials: 'BB' },
  { id: 'ingemar', group: 'int', type: 'mixed', name: 'Ingemar Stenmotor', nick: 'Sicksack som i slalombacken', talk: 'Jag åker slalom på asfalt också. Stolparna heter nu bilar.', taunt: 'Slalom! Du var stolpe nummer tre.', colors: ['#e8412c', '#2f6fe0'], helmet: 'checker', initials: 'IS' },
  { id: 'tiger', group: 'int', type: 'rammer', name: 'Tiger Woodsvagn', nick: 'Slår långt, parkerar kort', talk: 'Jag slår bollen hundra meter och dig tre. Lagom på banan.', taunt: 'Fore! Ursäkta, jag menade förbi!', colors: ['#d97706', '#15171c'], helmet: 'flame', initials: 'TW' },
  { id: 'mika', group: 'int', type: 'racer', name: 'Mika Häkkikinen', nick: 'Den flygande finländaren', talk: 'Jag pratar inte mycket. Jag kör. Det räcker.', taunt: 'Hm. Ja. Hej då.', colors: ['#9aa5b1', '#e8412c'], helmet: 'wing', initials: 'MH' },
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
 * shuffle, so a Rally grid is mostly racers). Helmets and colours differ where they can.
 */
export function rivalCast(seed: number, n: number, kind?: RaceKind, exclude: readonly string[] = []): Rival[] {
  const rnd = mulberry(seed ^ 0x51ed);
  let pool = RIVALS.filter((r) => !exclude.includes(r.id));
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
  // helmets and main colours differ where they can
  const seen = new Set<string>();
  for (const r of pool) {
    if (out.length >= n) break;
    if (seen.has(r.helmet) || seen.has(r.colors[0])) continue;
    out.push(r);
    seen.add(r.helmet);
    seen.add(r.colors[0]);
  }
  for (const r of pool) {
    if (out.length >= n) break;
    if (!out.includes(r)) out.push(r);
  }
  return out;
}
