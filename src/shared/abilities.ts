// The vehicles' own kit, like the characters in Tape to Tape: a lean (ram, race or mixed), a passive that is
// always on, an active ability on its own button with a cooldown, and a starting trinket that fits it.
// Pure data and a few formulas: the race (src/rally/index.ts) does what the ids say, the pick screen and the
// result screen only read the texts, and the balance simulation reads the pace numbers.
import type { CarBody } from './rally.ts';

export const LEANS = ['ram', 'race', 'mixed'] as const;
export type Lean = (typeof LEANS)[number];
export const LEAN_NAMES: Record<Lean, string> = { ram: 'Ram', race: 'Race', mixed: 'Blandat' };
export const LEAN_EMOJI: Record<Lean, string> = { ram: '🛡️', race: '🏎️', mixed: '⚖️' };
export const LEAN_TEXT: Record<Lean, string> = { ram: 'Bäst på att knuffa och krossa', race: 'Bäst på att köra fort', mixed: 'Lite av varje' };

export const PASSIVE_IDS = [
  'nitroTopUp', 'sandKing', 'loadDrop', 'windTunnel', 'squashSmall', 'softLanding', 'wheelieBoost', 'slim', 'shoveAll', 'chaosHeir',
  // phase 10
  'limiter', 'jingle', 'scavenger', 'allTerrain', 'draft', 'silent', 'grassHog', 'repair', 'longSlide', 'wobble',
] as const;
export type PassiveId = (typeof PASSIVE_IDS)[number];

export const ACTIVE_IDS = [
  'kickstart', 'hop', 'tailgate', 'slingshot', 'groundPound', 'pivot', 'wheelieRocket', 'dodge', 'rammer', 'cushionChaos',
  // phase 10
  'epaBurst', 'iceCannon', 'dump', 'powder', 'kartSlide', 'holeInOne', 'mow', 'awning', 'vip', 'rocket',
] as const;
export type ActiveId = (typeof ACTIVE_IDS)[number];

export interface PassiveDef {
  id: PassiveId;
  name: string;
  text: string;
}

export interface ActiveDef {
  id: ActiveId;
  name: string;
  emoji: string;
  /** One line, what it does. */
  text: string;
  /** Seconds before it can be used again. */
  cooldown: number;
  /** How a computer driver of this body uses it: a burst of speed, or a charge at whoever is close ahead. */
  ai: 'speed' | 'ram';
  /** Seconds a good human driver saves per use on a lap (0 = it does not make the lap faster). */
  save: number;
}

export interface VehicleKit {
  body: CarBody;
  lean: Lean;
  passive: PassiveDef;
  active: ActiveDef;
  /** The trinket the run starts with (an id from run/trinkets.ts). */
  trinket: string;
}

const kit = (body: CarBody, lean: Lean, trinket: string, passive: Omit<PassiveDef, 'id'> & { id: PassiveId }, active: ActiveDef): VehicleKit => ({ body, lean, trinket, passive, active });

export const KITS: Record<CarBody, VehicleKit> = {
  hatch: kit(
    'hatch',
    'mixed',
    'tvattbjorn',
    { id: 'nitroTopUp', name: 'Perfekt sladd', text: 'Sladda länge: en lång sladd ger en extra nitro, två lite kortare ger en.' },
    { id: 'kickstart', name: 'Kickstart', emoji: '⚡', text: 'En kort rusning och extra grepp i en sekund eller två.', cooldown: 12, ai: 'speed', save: 0.12 },
  ),
  buggy: kit(
    'buggy',
    'race',
    'gummistovlar',
    { id: 'sandKing', name: 'Sandkungen', text: 'Sand, gräs och grus bromsar dig inte. Ta genvägen.' },
    { id: 'hop', name: 'Hopp', emoji: '🦘', text: 'Ett jättehopp rakt över det som ligger i vägen.', cooldown: 9, ai: 'speed', save: 0.05 },
  ),
  pickup: kit(
    'pickup',
    'ram',
    'kastrull',
    { id: 'loadDrop', name: 'Löst flak', text: 'Smäller du in i något tappar du hö på vägen bakom dig.' },
    { id: 'tailgate', name: 'Flaket', emoji: '🛻', text: 'Tippa flaket: olja och höbalar bakom dig. Följarna får skylla sig själva.', cooldown: 14, ai: 'ram', save: 0 },
  ),
  coupe: kit(
    'coupe',
    'race',
    'kaffekoppen',
    { id: 'windTunnel', name: 'Vindtunnel', text: 'Slipper luften lite bättre än de andra och drar iväg på raksträckan. Bromsa tidigt.' },
    { id: 'slingshot', name: 'Slipström-snärt', emoji: '🧲', text: 'Precis bakom en bil: du slungas förbi som en gummisnodd.', cooldown: 10, ai: 'speed', save: 0.2 },
  ),
  monster: kit(
    'monster',
    'ram',
    'jattehjul',
    { id: 'squashSmall', name: 'Småbilsätaren', text: 'Du kör över små bilar. De blir plattor en stund.' },
    { id: 'groundPound', name: 'Krossa', emoji: '💥', text: 'Ett dunder i marken: stötvåg som slungar bort alla nära.', cooldown: 15, ai: 'ram', save: 0 },
  ),
  atv: kit(
    'atv',
    'mixed',
    'hoppfjadrar',
    { id: 'softLanding', name: 'Mjuklandning', text: 'Landar du ett hopp får du en boost på köpet.' },
    { id: 'pivot', name: 'Bakhjulssväng', emoji: '🔄', text: 'Svänger 90 grader på stället, åt det håll du styr.', cooldown: 8, ai: 'speed', save: 0.08 },
  ),
  moto: kit(
    'moto',
    'race',
    'kanelbullar',
    { id: 'wheelieBoost', name: 'Wheelie på boost', text: 'Boostar du lyfter framhjulet och farten blir lite högre.' },
    { id: 'wheelieRocket', name: 'Wheelie-raket', emoji: '🚀', text: 'En lång raketboost på ett hjul. Rasande snabb, svår att styra.', cooldown: 16, ai: 'speed', save: 0.3 },
  ),
  moped: kit(
    'moped',
    'race',
    'ringklocka',
    { id: 'slim', name: 'Smal som en planka', text: 'Bilar missar dig, och halka och höbalar stör knappt.' },
    { id: 'dodge', name: 'Väj!', emoji: '💨', text: 'En sekund oberörbar. Åk rakt genom bilar, fällor och allt.', cooldown: 6, ai: 'speed', save: 0.12 },
  ),
  tractor: kit(
    'tractor',
    'ram',
    'alghorn',
    { id: 'shoveAll', name: 'Knuffar allt', text: 'Tung som ett hus: allt du rammar flyger iväg.' },
    { id: 'rammer', name: 'Rammbock', emoji: '🚜', text: 'Rusa fram och slunga bort bilarna. I Blodbad blir det skrot.', cooldown: 13, ai: 'ram', save: 0.05 },
  ),
  sofa: kit(
    'sofa',
    'mixed',
    'slumpvaxel',
    { id: 'chaosHeir', name: 'Kaosarvet', text: 'En slumpad talisman dimper ner varje akt. Ingen vet varför.' },
    { id: 'cushionChaos', name: 'Soffkudde-kaos', emoji: '🛋️', text: 'Slumpar en effekt: rusning, hopp, höbalar, pannkaka eller byte av plats.', cooldown: 11, ai: 'speed', save: 0.05 },
  ),
  epa: kit(
    'epa',
    'mixed',
    'kuponghafte',
    { id: 'limiter', name: 'Spärr 30', text: 'Skylten säger 30, men motorn håller inte med: spärren sitter högt och släpper helt på gräset. Gräs, lera, sand, olja och höbalar bromsar dig inte.' },
    { id: 'epaBurst', name: 'Gasa på EPA', emoji: '⚠️', text: 'Spärren åker av en lång stund: en rejäl fartstöt förbi allt som står på skylten.', cooldown: 6, ai: 'speed', save: 0.05 },
  ),
  icecream: kit(
    'icecream',
    'mixed',
    'godispasen',
    { id: 'jingle', name: 'Glassmelodin', text: 'Du spelar glassmelodin. Bilar nära dig blir sugna på glass och saktar ner.' },
    { id: 'iceCannon', name: 'Glasskanon', emoji: '🍦', text: 'Skjuter glasskulor framför dig. Där de landar blir vägen hal som en isbit.', cooldown: 13, ai: 'speed', save: 0.1 },
  ),
  garbage: kit(
    'garbage',
    'ram',
    'myntturbo',
    { id: 'scavenger', name: 'Plockar upp', text: 'Fällor på vägen plockas upp i stället för att stoppa dig. Varje bit ger lite pansar.' },
    { id: 'dump', name: 'Tömning', emoji: '🗑️', text: 'Tippar ut en hög skräp bakom dig. Ju mer du plockat upp, desto större hög.', cooldown: 10, ai: 'ram', save: 0 },
  ),
  snowmobile: kit(
    'snowmobile',
    'race',
    'dubbdack',
    { id: 'allTerrain', name: 'Allt grepp', text: 'Full grepp på is, snö och sand. Asfalt är bara lite tråkigt.' },
    { id: 'powder', name: 'Pudersvans', emoji: '❄️', text: 'En snömoln bakom dig. Bilarna bakom ser ingenting och tappar fart.', cooldown: 11, ai: 'speed', save: 0.06 },
  ),
  kart: kit(
    'kart',
    'race',
    'sladdgradde',
    { id: 'draft', name: 'Sugen i rygg', text: 'Ligger du tätt bakom en bil fylls slipströmmen dubbelt så fort. Fullt: en gratis fartstöt.' },
    { id: 'kartSlide', name: 'Gokartsladd', emoji: '🏁', text: 'En perfekt sladd direkt, åt det håll du styr. Ger nitro.', cooldown: 10, ai: 'speed', save: 0.3 },
  ),
  golf: kit(
    'golf',
    'mixed',
    'guldpokal',
    { id: 'silent', name: 'Tyst som en mus', text: 'Eldrift: ingen hör dig komma. Rivalerna går inte på dig och försöker inte blockera dig.' },
    { id: 'holeInOne', name: 'Hole in one', emoji: '⛳', text: 'Slår iväg en golfboll som träffar ledaren och knuffar honom åt sidan.', cooldown: 10, ai: 'speed', save: 0 },
  ),
  mower: kit(
    'mower',
    'mixed',
    'konmagnet',
    { id: 'grassHog', name: 'Gräsälskare', text: 'Snabbare på gräs än på vägen. Genvägen över ängen är din.' },
    { id: 'mow', name: 'Gräsklippning', emoji: '🌿', text: 'Ett gräsregn rakt fram som klipper bort allt farligt på vägen framför dig.', cooldown: 8, ai: 'speed', save: 0.12 },
  ),
  camper: kit(
    'camper',
    'ram',
    'pepparkaka',
    { id: 'repair', name: 'Hemma på hjul', text: 'Lagar sig själv medan du kör: plåten mår bättre och i Blodbad kommer hälsan tillbaka långsamt.' },
    { id: 'awning', name: 'Utfällt tält', emoji: '⛺', text: 'Fäller ut ett markis-tält bakom dig som blockerar vägen för alla följare.', cooldown: 11, ai: 'ram', save: 0 },
  ),
  limo: kit(
    'limo',
    'race',
    'discokula',
    { id: 'longSlide', name: 'Rutschkana', text: 'När bakdelen väl tappar greppet fortsätter sladden långt. Roligt, men ta det lugnt i kurvorna.' },
    { id: 'vip', name: 'VIP-fil', emoji: '🕶️', text: 'Du åker rakt genom bilar en stund. Ingen kan sätta stopp för en VIP.', cooldown: 10, ai: 'speed', save: 0.3 },
  ),
  cart: kit(
    'cart',
    'race',
    'raketkorv',
    { id: 'wobble', name: 'Skranglig', text: 'Vagnen vinglar slumpmässigt åt sidorna. Det är en kundvagn. Vad väntade du dig?' },
    { id: 'rocket', name: 'Raketen', emoji: '🛒', text: 'Tänder raketen: gigantisk fart i några sekunder, men den är svår att styra.', cooldown: 7, ai: 'speed', save: 0.05 },
  ),
};

export const kitOf = (body: CarBody): VehicleKit => KITS[body];

// ---------------------------------------------------------------------------
// The numbers the race and the balance simulation share
// ---------------------------------------------------------------------------

/** Passives that change the lap time of a human driver (a multiplier on the lap), fitted by hand: the goal is "noticeable, never decisive". */
export const PASSIVE_LAP: Partial<Record<CarBody, number>> = { coupe: 0.994, buggy: 0.997, atv: 0.999, moto: 0.998, hatch: 0.999, kart: 0.996, limo: 0.998 };

/** The ram power a passive gives before trinkets (1 = a plain bumper). */
export const PASSIVE_RAM: Partial<Record<CarBody, number>> = { tractor: 1.8, pickup: 1.25, garbage: 1.5, camper: 1.35 };

/** Seconds of boost and their strength for the actives that are a boost; the race reads these. */
export const KICKSTART = { boost: 1.1, strength: 1.4, grip: 1.15, gripSeconds: 2 };
export const WHEELIE_ROCKET = { boost: 2.2, strength: 1.6, steer: 0.7 };
export const SLINGSHOT = { reach: 18, lane: 4.5, kick: 7, boost: 1.1, strength: 1.45, miss: 2 };
export const POUND = { radius: 15, push: 9, squash: 1.1, damage: 20 };
export const RAMMER = { seconds: 1.8, ram: 2, maxRam: 3.4, strength: 1.5, damage: 30 };
export const DODGE = { seconds: 1.0 };
export const HOP = { vy: 10.5, kick: 1.5 };
export const SOFTLAND = { boost: 0.9, strength: 1.3, min: 2.5 };

// ---- phase 10 ----
/** Gasa på EPA: the limiter comes off (boost lifts the top speed with it) and a thrust along the nose takes it up to the cap (m/s). */
export const EPA_BURST = { boost: 4, strength: 1.6, thrust: 9, cap: 56 };
/** Glasskanon: scoops land this far ahead (m) and make the road slippery for a while. */
export const ICE_CANNON = { range: [16, 26, 36], spread: 2.4 };
/** Glassmelodin: cars this close (m) slow down; the share of their speed they lose per second; seconds between jingles. */
export const JINGLE = { radius: 15, slow: 0.35, every: 9 };
/** Plockar upp: pieces held at most, armour per piece (share less damage) and what Tömning drops. */
export const SCAVENGE = { max: 6, armour: 0.05, base: 0.9 };
/** Pudersvans: the cloud reaches this far behind (m), how wide, and how long it blinds. */
export const POWDER = { reach: 34, width: 7, blind: 2.6 };
/** Sugen i rygg: closeness (m), seconds of drafting to fill the meter (a plain driver would need twice that), and the pop. */
export const DRAFT = { reach: 17, lane: 2.8, fill: 1.5, boost: 0.9, strength: 1.3 };
/** Gokartsladd: how hard it kicks the tail round (rad/s), the boost it gives and the nitro charge. */
export const KART_SLIDE = { yaw: 1.7, side: 3.5, boost: 1.0, strength: 1.3 };
/** Hole in one: the ball's flight time (s) and how hard it shoves the leader sideways (m/s). */
export const HOLE_IN_ONE = { flight: 1.1, push: 13, squash: 0.8, reach: 130 };
/** Gräsklippning: how far ahead (m) and how wide it clears. */
export const MOW = { reach: 34, width: 4.6, boost: 1.0, strength: 1.25 };
/** Hemma på hjul: damage points healed per second (plating) and health per second (Blodbad). */
export const REPAIR = { plating: 0.9, hp: 1.6, minSpeed: 6 };
/** Utfällt tält: seconds it stays up. */
export const AWNING = { life: 13 };
/** VIP-fil: seconds through the cars, and the little push. */
export const VIP = { seconds: 3.2, boost: 1.0, strength: 1.2 };
/** Raketen: seconds, strength, how hard the steering is to hold, the random kicks to the side, and the thrust (m/s², along the nose) up to a speed cap (m/s). */
export const ROCKET = { boost: 3.0, strength: 2.5, steer: 0.75, kick: 0.5, thrust: 14, cap: 58 };
/** Skranglig: the cart's steering noise (share of the wheel). */
export const WOBBLE = { amp: 0.08 };

/** Uses of the active per lap, for a human who presses it whenever it is ready (never more than two and a half a lap: a driver is busy driving). */
export const usesPerLap = (lapSeconds: number, cooldown: number): number => Math.min(2.5, lapSeconds / (cooldown + 8));

/** Seconds per lap the active saves a driver of this skill (0..1 of "uses it well"). */
export function activeLapSave(body: CarBody, lapSeconds: number, skill: number): number {
  const a = KITS[body].active;
  return usesPerLap(lapSeconds, a.cooldown) * a.save * Math.max(0, Math.min(1, skill));
}

/** The random effects of Soffkudde-kaos, in a fixed order so a seed can pick one. */
export const CHAOS_EFFECTS = ['boost', 'hop', 'hay', 'pancake', 'swap', 'cannon', 'slime', 'ghost'] as const;
export type ChaosEffect = (typeof CHAOS_EFFECTS)[number];
export const CHAOS_TEXT: Record<ChaosEffect, string> = {
  boost: 'Soffan fick fnatt: rusning!',
  hop: 'Fjädrarna i soffan: hopp!',
  hay: 'Höbalar föll ner framför någon!',
  pancake: 'En pannkaka landade på ledaren!',
  swap: 'Soffan bytte plats åt dig!',
  cannon: 'Kuddarna small ut: korvkanon!',
  slime: 'Du tappade slem bakom dig.',
  ghost: 'Soffan blev ett spöke en stund.',
};
export const chaosPick = (r: number): ChaosEffect => CHAOS_EFFECTS[Math.min(CHAOS_EFFECTS.length - 1, Math.max(0, Math.floor(r * CHAOS_EFFECTS.length)))]!;

// ---------------------------------------------------------------------------
// Little formulas the race uses (pure, so they can be tested)
// ---------------------------------------------------------------------------

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Which way the pivot turns: the way the player is steering (positive steer = left), or, with the wheel
 * straight, whichever way brings the nose closer to the road (heading error = road heading − car heading).
 */
export function pivotDir(steer: number, headingErr: number): 1 | -1 {
  if (Math.abs(steer) > 0.15) return steer > 0 ? 1 : -1;
  return wrap(headingErr) >= 0 ? 1 : -1;
}

/** A car on the road ahead and close enough to slingshot off, from where the player is: the nearest one in the lane. */
export interface DraftCar {
  fwd: number;
  lat: number;
}
export function draftTarget(cars: readonly DraftCar[], reach = SLINGSHOT.reach, lane = SLINGSHOT.lane): DraftCar | null {
  let best: DraftCar | null = null;
  for (const c of cars) if (c.fwd > 1 && c.fwd < reach && Math.abs(c.lat) < lane && (!best || c.fwd < best.fwd)) best = c;
  return best;
}

/** Seconds left on the cooldown as a 0..1 charge (1 = ready). */
export const chargeOf = (left: number, cooldown: number): number => (cooldown <= 0 ? 1 : Math.max(0, Math.min(1, 1 - left / cooldown)));
