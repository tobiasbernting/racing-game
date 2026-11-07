// Swedish names for the things a player picks.
import type { CarBody, CarDriver, CarPart, RallyCourse } from './rally.ts';

export const CAR_BODY_NAMES: Record<CarBody, string> = {
  hatch: 'Rallybil',
  buggy: 'Sandbuggy',
  pickup: 'Pickup',
  coupe: 'Sportbil',
  monster: 'Monstertruck',
};

export const RALLY_COURSE_NAMES: Record<RallyCourse, string> = {
  farm: 'Gården',
  forest: 'Skogen',
  ice: 'Isbanan',
  beach: 'Stranden',
  city: 'Staden',
  meadow: 'Ängen',
  mountain: 'Fjället',
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
};

export const CAR_DRIVER_EMOJI: Record<CarDriver, string> = { human: '🧑', cow: '🐮', horse: '🐴', pig: '🐷', rooster: '🐓', sheep: '🐑', dog: '🐶', cat: '🐱' };

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
