import { rallyOptions } from './options.ts';

/** What this race gives the player's buttons: nitro when the car has some in this race, and a slot for the vehicle's ability (phase 8). */
export function rallyNeeds(options: unknown): { nitro: boolean; ability: boolean } {
  const o = rallyOptions(options);
  const nitro = !!o && o.rules.nitro && (o.rules.sameCars || (o.car.parts.turbo ?? 0) > 0 || (o.mods?.tune.charges ?? 0) > 0);
  // the ability button stays hidden until a vehicle has an ability: phase 8 sets this from the vehicle
  return { nitro, ability: false };
}
