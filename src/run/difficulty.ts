// The four ways to play a run, chosen on the pick screen: how many hearts, what the hearts rules are, what the kiosk
// and the bosses give back, and how much more the trophies pay. Pure data and a few helpers; the rules themselves are
// applied in state.ts (hearts), flow.ts (heals, Skrotpant), economy.ts (the kiosk) and giveup.ts (trophies).
// Rivals only differ for Söndagsåkare (the `calm` flag everywhere in src/shared/field.ts); Hård and Ett liv fight like Normal.

export const DIFFICULTIES = ['calm', 'normal', 'hard', 'one'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface DiffDef {
  id: Difficulty;
  emoji: string;
  name: string;
  /** One line for the pick screen. */
  blurb: string;
  /** Hearts at the start (and the most, before trinkets). */
  hearts: number;
  /** Rivals take it easy (the old calm mode). */
  gentleRivals: boolean;
  /** The kiosk sells hearts, and what it asks compared with normal. */
  shopHearts: boolean;
  healMul: number;
  /** Hearts a boss gives back: for any finish (calm) and for a win (normal). */
  bossHealAny: number;
  bossHealWin: number;
  /** Skrotpant: a heart back for this many wrecks; 0 = never. */
  scrapEvery: number;
  /** Trinkets that add a heart work (otherwise they pay kronor and are left out of the pools). */
  heartPerks: boolean;
  /** Trophy multiplier for a finished run. */
  trophyMul: number;
}

export const DIFFS: Record<Difficulty, DiffDef> = {
  calm: { id: 'calm', emoji: '🛋️', name: 'Söndagsåkare', blurb: '5 hjärtan och rivaler som tar det lugnt. För yngre förare.', hearts: 5, gentleRivals: true, shopHearts: true, healMul: 1, bossHealAny: 2, bossHealWin: 0, scrapEvery: 4, heartPerks: true, trophyMul: 1 },
  normal: { id: 'normal', emoji: '🏁', name: 'Normal', blurb: '3 hjärtan. Nedre halvan kostar ett, bryter du två. Så är spelet tänkt.', hearts: 3, gentleRivals: false, shopHearts: true, healMul: 1, bossHealAny: 0, bossHealWin: 1, scrapEvery: 4, heartPerks: true, trophyMul: 1 },
  hard: { id: 'hard', emoji: '🔥', name: 'Hård', blurb: '2 hjärtan, dyrare hjärtan, ingen hjälp av bossar och tvåa mot bossen är ändå −❤️. 1,5× troféer.', hearts: 2, gentleRivals: false, shopHearts: true, healMul: 1.5, bossHealAny: 0, bossHealWin: 0, scrapEvery: 6, heartPerks: true, trophyMul: 1.5 },
  one: { id: 'one', emoji: '💀', name: 'Ett liv', blurb: '1 hjärta, inga påfyllningar. Ett dåligt lopp och det är slut. 2× troféer.', hearts: 1, gentleRivals: false, shopHearts: false, healMul: 1, bossHealAny: 0, bossHealWin: 0, scrapEvery: 0, heartPerks: false, trophyMul: 2 },
};

export const isDifficulty = (v: unknown): v is Difficulty => typeof v === 'string' && (DIFFICULTIES as readonly string[]).includes(v);

/** Old code and old saves say `calm: boolean`; a boolean is read as Söndagsåkare or Normal. */
export const asDifficulty = (v: Difficulty | boolean | undefined | null): Difficulty => (v === true ? 'calm' : isDifficulty(v) ? v : 'normal');

export const diffOf = (v: Difficulty | boolean | undefined | null): DiffDef => DIFFS[asDifficulty(v)];

/** "💀 Ett liv" */
export const diffLabel = (v: Difficulty | boolean): string => `${diffOf(v).emoji} ${diffOf(v).name}`;

/** Trophies for a finished run at this difficulty (whole numbers; a run that earned something never rounds to nothing). */
export const trophyScale = (v: Difficulty | boolean, base: number): number => (base <= 0 ? 0 : Math.max(1, Math.round(base * diffOf(v).trophyMul)));

/** The heart rule shown on the pre-race card, matched to the difficulty and the kind of race. */
export function heartRuleText(v: Difficulty | boolean, o: { boss: boolean; arena: boolean; carnage: boolean }): string {
  const d = asDifficulty(v);
  const byPoints = o.carnage ? ' på poäng' : '';
  if (d === 'calm') return '❤️ Sist eller bryter: −❤️';
  if (d === 'one') {
    if (o.boss) return `💀 Ett liv: ${o.arena ? 'vinner du inte derbyt' : `förlorar du${byPoints}`} mot bossen är rundan slut.`;
    if (o.arena) return '💀 Ett liv: åker du ut bland de första (nedre halvan) eller bryter är rundan slut.';
    return `💀 Ett liv: hamnar du på nedre halvan${byPoints} eller bryter är rundan slut.`;
  }
  if (o.boss && d === 'hard') return `❤️ Bossen: ${o.arena ? 'tvåa i derbyt' : `tvåa${byPoints}`} är −❤️, sämre än så −❤️❤️. Inget hjärta tillbaka för segern.`;
  const back = d === 'normal' ? ' Vinn och få ❤️ tillbaka.' : ' Inget hjärta tillbaka för segern.';
  if (o.boss) return `❤️ Bossen: ${o.arena ? 'vinner du inte derbyt' : `förlorar du${byPoints}`} är det −❤️❤️.${back}`;
  if (o.arena) return '❤️ Åker du ut bland de första (nedre halvan): −❤️. Bryter du: −❤️❤️.';
  return `❤️ Hamnar du på nedre halvan${byPoints}: −❤️. Bryter du: −❤️❤️.`;
}
