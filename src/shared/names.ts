// Swedish names for the things a player picks.
import type { CarBody, RallyCourse } from './rally.ts';

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
