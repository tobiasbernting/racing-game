// Swedish names for the things a player picks.
import type { CarBody, CarDriver, CarPart, RallyCourse } from './rally.ts';

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
};

/** One cheerful line on how each body drives. */
export const CAR_BODY_TEXT: Record<CarBody, string> = {
  hatch: 'En vanlig, go rallybil.',
  buggy: 'Lätt och grepp i sanden.',
  pickup: 'Stark och tålig.',
  coupe: 'Snabb men skör.',
  monster: 'Enorma hjul, enorm tyngd.',
  atv: 'Lätt och yr. Älskar hopp och grus!',
  moto: 'Rasande snabb. Lutar sig i kurvorna!',
  moped: 'Långsam men spänstig. Ring-ring!',
  tractor: 'Tung som en björn. Puttrar fram och puffar bort alla.',
  sofa: 'En soffa på hjul. Helt galen.',
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

export const CAR_DRIVER_NAMES: Record<CarDriver, string> = {
  human: 'Du själv',
  cow: 'Kossan',
  horse: 'Hästen',
  pig: 'Grisen',
  rooster: 'Tuppen',
  sheep: 'Fåret',
  dog: 'Hunden',
  cat: 'Katten',
  rabbit: 'Kaninen',
};

export const CAR_DRIVER_EMOJI: Record<CarDriver, string> = { human: '🧑', cow: '🐮', horse: '🐴', pig: '🐷', rooster: '🐓', sheep: '🐑', dog: '🐶', cat: '🐱', rabbit: '🐰' };

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
  engine: 'Mer kraft',
  tyres: 'Mer grepp',
  suspension: 'Mjukare landningar, lättare att styra',
  brakes: 'Bromsar bättre',
  turbo: 'En nitro till i varje lopp',
  armour: 'Tål smällar',
};

/** The computer drivers in grid order (a boss takes the first one's place). */
export const RIVAL_NAMES = ['Kossan Mu', 'Hästen Blixt', 'Grisen Kurre', 'Tuppen Kuckeli', 'Fåret Ull'] as const;
