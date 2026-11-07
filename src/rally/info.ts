import type { TouchLayout } from '../arcade/types.ts';
import { rallyOptions } from './options.ts';

/** The touch controls: ◀ ▶ on the left; ▼ brake, 🌀 handbrake and a third button (🔥 nitro when the car has some in this race, else 🎥 the camera). */
export function rallyTouch(options: unknown): TouchLayout {
  const o = rallyOptions(options);
  const nitro = !!o && o.rules.nitro && (o.rules.sameCars || (o.car.parts.turbo ?? 0) > 0 || (o.mods?.tune.charges ?? 0) > 0);
  return {
    pad: 'leftright',
    buttons: [
      { button: 'down', label: '▼' },
      { button: 'a', label: '🌀' },
      { button: 'c', label: nitro ? '🔥' : '🎥' },
    ],
  };
}

export const RALLY_HOW_TO = {
  keys: [
    '↑ / W gasar, ↓ / S bromsar och backar',
    '← → / A D styr · Mellanslag: handbroms. Sladda länge för turbo!',
    'L: nitro (om bilen har turbo) · H: tuta · C / Enter: kamera · R: tillbaka på vägen',
    'Handkontroll: RT gas, LT broms, A handbroms, X nitro, B tillbaka på vägen',
  ],
  touch: ['Bilen gasar själv. Du styr med ◀ ▶', '▼ bromsar. Håll kvar för att backa.', '🌀 handbroms. Sladda länge för turbo.', '🔥 nitro (om bilen har turbo) · 🎥 byter kamera', 'Moppen ringer i klockan själv bakom andra bilar. Terror.'],
};
