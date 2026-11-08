// Helpers for the tests of hooks: an api that records what a hook asked for, and a plain car state.
import type { RaceApi, TickState } from '../rally/mods.ts';

/** An api that writes down every call ("kronor:12", "shock:9,6,9"); `dropAhead` and `swapAhead` succeed. */
export function recorder(): { api: RaceApi; calls: string[] } {
  const calls: string[] = [];
  const log = (name: string) => (...a: unknown[]) => void calls.push(`${name}:${a.join(',')}`);
  const names = ['say', 'fart', 'burp', 'gas', 'boing', 'party', 'bounce', 'kick', 'boost', 'ghost', 'banana', 'cannon', 'squashLeader', 'swapVehicle', 'slowBehind', 'shove', 'kronor', 'sparkle', 'stat', 'oil', 'mine', 'fakeCoin', 'smoke', 'shock', 'ramUp', 'nitro', 'flame', 'heal', 'rerollAbility', 'abilityCooldown', 'repeatAbility'] as const;
  const api = Object.fromEntries(names.map((n) => [n, log(n)])) as unknown as RaceApi;
  api.swapAhead = () => (calls.push('swapAhead'), true);
  api.dropAhead = (k: string) => (calls.push(`dropAhead:${k}`), true);
  api.copyLeaderAbility = () => (calls.push('copyLeaderAbility'), true);
  return { api, calls };
}

/** A car going 30 m/s down the middle of the road. */
export const tickState = (o: Partial<TickState> = {}): TickState => ({ speed: 30, steer: 0, handbrake: false, handbrakePressed: false, straight: true, air: false, drifting: false, boosting: false, lap: 1, place: 1, racing: true, time: 10, braking: false, wheelie: false, carnage: false, derby: false, ...o });

export const count = (calls: string[], prefix: string): number => calls.filter((c) => c.startsWith(prefix)).length;
