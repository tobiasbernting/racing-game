// Haptics: a short buzz on a gear shift and on big hits, where the browser has navigator.vibrate (Android Chrome and
// Firefox). iPhones and iPads have no vibration in the browser and nothing is faked there: the sound and the shift
// light carry the same information. Everything is a quiet no-op when it cannot buzz or the player switched it off.
export type Buzz = 'shift' | 'perfect' | 'hit' | 'crash';

/** The patterns in milliseconds (a number is one buzz, an array alternates buzz and pause). */
export const PATTERNS: Record<Buzz, number | number[]> = { shift: 12, perfect: [14, 40, 22], hit: 28, crash: [45, 30, 60] };

export interface Buzzer {
  vibrate?(pattern: number | number[]): boolean;
}

/** Can this browser vibrate at all? */
export const canVibrate = (nav: Buzzer | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean => !!nav && typeof nav.vibrate === 'function';

let last = 0;

/** Buzz once. Rate-limited (a buzz every few frames would only feel like a hum). Returns whether the browser was asked. */
export function buzz(kind: Buzz, on: boolean, nav: Buzzer | undefined = typeof navigator === 'undefined' ? undefined : navigator, now: number = Date.now()): boolean {
  if (!on || !canVibrate(nav)) return false;
  if (now - last < 70 && kind !== 'crash') return false;
  last = now;
  try {
    nav!.vibrate!(PATTERNS[kind]);
    return true;
  } catch {
    return false;
  }
}

/** For tests: forget the rate limit. */
export const resetBuzz = (): void => {
  last = 0;
};
