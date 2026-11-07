// The same course should not play the same every time. From the node's seed (or a quick race's own) a race gets
// a few small changes: the track mirrored and/or driven the other way round, how thick the props stand, a tint on
// the land and the trees, and which time of day and weather the course tends to have. Pure and deterministic:
// the same course and seed always give the same variation, and a different seed usually a different one.
import type { RallyCourse, RallyTime, RallyWeather } from './rally.ts';

export interface Variation {
  /** The seed it came from. */
  seed: number;
  /** The whole course flipped left to right (the farm is never flipped: its farm and fields are fixed). */
  mirror: boolean;
  /** Driven the other way round. */
  reverse: boolean;
  /** Props per metre of road, 0.7 sparse .. 1.35 crowded. */
  density: number;
  /** Multipliers on red, green and blue for the ground and the trees (a little autumn, a little spring). */
  tint: [number, number, number];
  /** 0..1: how the day goes if the plan leaves it to the seed. */
  dayDice: number;
  /** 0..1: and the weather. */
  weatherDice: number;
}

/** A 32-bit mix of two numbers. */
function mix(a: number, b: number): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

const COURSE_NO = (c: string): number => {
  let h = 7;
  for (let i = 0; i < c.length; i++) h = Math.imul(h ^ c.charCodeAt(i), 0x01000193);
  return h;
};

/** Courses where the sky is never rainy (no air, or indoors, or a desert). */
export const DRY_COURSES: readonly RallyCourse[] = ['moon', 'kitchen', 'desert'];
/** Courses whose scenery is fixed to one layout and so cannot be flipped or reversed. */
export const FIXED_COURSES: readonly RallyCourse[] = ['farm'];

export function variationFor(course: RallyCourse, seed: number): Variation {
  const base = mix(seed, COURSE_NO(course));
  const u = (k: number): number => mix(base, k) / 4294967296;
  const fixed = FIXED_COURSES.includes(course);
  const tintK = (k: number): number => 1 + (u(k) - 0.5) * 0.22;
  return {
    seed: mix(base, 99),
    mirror: !fixed && u(1) < 0.5,
    reverse: !fixed && u(2) < 0.4,
    density: 0.7 + u(3) * 0.65,
    tint: [tintK(4), tintK(5), tintK(6)],
    dayDice: u(7),
    weatherDice: u(8),
  };
}

/** The time of day and the weather a variation suggests for a course (a plan may override both). */
export function skyFor(course: RallyCourse, v: Variation, act: number): { time: RallyTime; weather: RallyWeather } {
  // the first act is always a plain day
  if (act < 1) return { time: 'day', weather: 'clear' };
  const time: RallyTime = v.dayDice < 0.5 ? 'day' : v.dayDice < 0.75 ? 'sunset' : act >= 1 ? 'night' : 'day';
  const weather: RallyWeather = !DRY_COURSES.includes(course) && act >= 1 && v.weatherDice < 0.22 ? 'rain' : 'clear';
  return { time, weather };
}

/** The same variation, never rainy where the course is dry. */
export const canRain = (course: RallyCourse): boolean => !DRY_COURSES.includes(course);
