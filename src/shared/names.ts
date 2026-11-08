// Swedish names for the things a player picks.
import type { CarBody, CarPart, RallyCourse } from './rally.ts';

export const CAR_BODY_NAMES: Record<CarBody, string> = {
  hatch: 'Rallybil',
  buggy: 'Sandbuggy',
  pickup: 'Pickup',
  coupe: 'Sportbil',
  monster: 'Monstertruck',
  atv: 'Fyrhjuling',
  moto: 'Motorcykel',
  moped: 'Moppe',
  tractor: 'Traktor',
  sofa: 'Soffbil',
  epa: 'EPA-traktor',
  icecream: 'Glassbil',
  garbage: 'Sopbil',
  snowmobile: 'Snöskoter',
  kart: 'Gokart',
  golf: 'Golfbil',
  mower: 'Åkgräsklippare',
  camper: 'Husbil',
  limo: 'Limousin',
  cart: 'Raketvagnen',
};

/** One cheeky line on how each body drives. */
export const CAR_BODY_TEXT: Record<CarBody, string> = {
  hatch: 'En hederlig rallybil. Rostig i själen.',
  buggy: 'Lätt, sandig och livsfarlig.',
  pickup: 'Stark som en oxe, luktar som en.',
  coupe: 'Snabb som attan, skör som en kaka.',
  monster: 'Enorma hjul, enorm tyngd, noll skam.',
  atv: 'Lätt och yr. Älskar hopp och grus.',
  moto: 'Rasande snabb. Lutar sig i kurvorna och ber.',
  moped: 'Långsam men spänstig. Ring-ring, flytta på dig.',
  tractor: 'Tung som en björn. Puttrar fram och puttar bort alla.',
  sofa: 'En soffa på hjul. Mamma skulle aldrig tillåta det.',
  epa: 'En gammal bil som blivit traktor. Skylten säger 30. Gasen säger något annat.',
  icecream: 'Glassbilen kommer! Alla stannar. Alla utom du.',
  garbage: 'Hämtar allt som ligger i vägen. Och lite till.',
  snowmobile: 'Fräser över snö och sand. Asfalt är bara tråkigt.',
  kart: 'Liten som en skoask, snabb som en fnatt. Varje gupp känns.',
  golf: 'Tyst, lugn och farligt. Fore!',
  mower: 'Älskar gräs. Allt annat är en omväg.',
  camper: 'Ett hem på hjul. Tungt, stabilt och aldrig sist hem.',
  limo: 'Lång. Rakt fram är det en dröm. I kurvan blir det en rutschkana.',
  cart: 'En kundvagn med en raket på. Vad kan gå fel?',
};

export const RALLY_COURSE_NAMES: Record<RallyCourse, string> = {
  farm: 'Gården',
  forest: 'Skogen',
  ice: 'Isbanan',
  beach: 'Stranden',
  city: 'Staden',
  meadow: 'Ängen',
  mountain: 'Fjället',
  desert: 'Öknen',
  volcano: 'Vulkanen',
  candy: 'Godislandet',
  moon: 'Månen',
  kitchen: 'Köket',
};

export const CAR_PART_NAMES: Record<CarPart, string> = {
  engine: 'Motor',
  tyres: 'Däck',
  suspension: 'Fjädring',
  brakes: 'Bromsar',
  turbo: 'Turbo',
  armour: 'Skydd',
};

export const CAR_PART_EMOJI: Record<CarPart, string> = { engine: '⚙️', tyres: '🛞', suspension: '🪀', brakes: '🛑', turbo: '🔥', armour: '🛡️' };

export const CAR_PART_TEXT: Record<CarPart, string> = {
  engine: 'Mer kraft. Mer oljud.',
  tyres: 'Mer grepp. Mindre gråt.',
  suspension: 'Mjukare landningar, lättare styrning',
  brakes: 'Bromsar bättre. I teorin.',
  turbo: 'En nitro till i varje lopp. FSSS!',
  armour: 'Tål smällar. Nästan som du.',
};
