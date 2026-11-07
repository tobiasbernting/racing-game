import { kitOf } from '../shared/abilities.ts';
import { rallyOptions } from './options.ts';

/** What this race gives the player's buttons: nitro when the car has some in this race, and the vehicle's ability button. */
export function rallyNeeds(options: unknown): { nitro: boolean; ability: boolean } {
  const o = rallyOptions(options);
  // the hatchback fills its own nitro by drifting well, and the kart by its slide, so they have the button even with no turbo part
  const kit = o && !o.rules.sameCars ? kitOf(o.car.body) : null;
  const topUp = !!kit && (kit.passive.id === 'nitroTopUp' || kit.active.id === 'kartSlide');
  const nitro = !!o && o.rules.nitro && (o.rules.sameCars || (o.car.parts.turbo ?? 0) > 0 || (o.mods?.tune.charges ?? 0) > 0 || topUp);
  // every vehicle has an active ability, except in the levelled quick race
  return { nitro, ability: !!o && !o.rules.sameCars };
}
