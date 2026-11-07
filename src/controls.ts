// The player's controls on this device, as pure data and maths: which scheme the touch buttons follow (Lätt, Pedaler,
// Proffs), manual or automatic shifting, how big and see-through the buttons are, left-handed mirroring, where the
// player dragged them, and where every button sits on a given screen. No DOM in here, so it is all tested.
import type { Button } from './arcade/types.ts';

export const SCHEMES = ['easy', 'pedals', 'pro'] as const;
export type Scheme = (typeof SCHEMES)[number];
export const isScheme = (s: unknown): s is Scheme => typeof s === 'string' && (SCHEMES as readonly string[]).includes(s);

export const SCHEME_NAMES: Record<Scheme, string> = { easy: 'Lätt', pedals: 'Pedaler', pro: 'Proffs' };
/** What each scheme is, in a sentence or two for the settings panel. */
export const SCHEME_TEXT: Record<Scheme, string> = {
  easy: 'Bilen gasar själv och bromsar lite i kurvorna. Du styr med ◀ ▶ och bromsar, sladdar och trycker nitro med högertummen.',
  pedals: 'Egen gas och broms: håll nere GAS för att köra, släpp för att rulla av. BROMS backar också. Växlarna sköter bilen själv.',
  pro: 'Pedaler, och du växlar själv med − och +. Skifta precis innan varvet tar slut för en liten extra spark.',
};

export const SIZES = ['s', 'm', 'l'] as const;
export type SizeKey = (typeof SIZES)[number];
export const SIZE_NAMES: Record<SizeKey, string> = { s: 'S', m: 'M', l: 'L' };
const SIZE_K: Record<SizeKey, number> = { s: 0.85, m: 1, l: 1.2 };

export type DeviceClass = 'phone' | 'tablet';
/** A phone is anything whose short side is under 600 css px. */
export const deviceClass = (w: number, h: number): DeviceClass => (Math.min(w, h) >= 600 ? 'tablet' : 'phone');

/** The buttons the layout knows. `ability` is the slot the vehicles' special move will use (hidden until a vehicle has one). */
export const BUTTON_IDS = ['left', 'right', 'hand', 'gas', 'brake', 'nitro', 'ability', 'shiftDn', 'shiftUp'] as const;
export type BtnId = (typeof BUTTON_IDS)[number];

/** Which controller button each on-screen button presses. */
export const BUTTON_MAP: Record<BtnId, Button> = { left: 'left', right: 'right', hand: 'a', gas: 'up', brake: 'down', nitro: 'c', ability: 'x', shiftDn: 'sd', shiftUp: 'su' };

export interface Pos {
  /** The centre of the button as a share of the screen, in the right-handed layout. */
  x: number;
  y: number;
}

export interface ControlPrefs {
  scheme: Scheme;
  /** Shift by hand (Q / E, LB / RB, the − and + buttons). The Proffs scheme on a touch screen always does. */
  manual: boolean;
  size: SizeKey;
  /** Button opacity 0.35 … 1. */
  opacity: number;
  /** Mirror the touch layout. */
  lefty: boolean;
  /** Buzz on shifts and hits (where the browser can). */
  haptics: boolean;
  /** Where the player dragged buttons: `${phone|tablet}:${scheme}` → button → centre. */
  pos: Record<string, Partial<Record<BtnId, Pos>>>;
}

export const defaultControls = (): ControlPrefs => ({ scheme: 'easy', manual: false, size: 'm', opacity: 0.8, lefty: false, haptics: true, pos: {} });

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const isId = (s: string): s is BtnId => (BUTTON_IDS as readonly string[]).includes(s);

/** Anything stored (or junk, or nothing from an older version) becomes valid control prefs. */
export function cleanControls(raw: unknown): ControlPrefs {
  const d = defaultControls();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const pos: ControlPrefs['pos'] = {};
  if (o.pos && typeof o.pos === 'object') {
    for (const [key, set] of Object.entries(o.pos as Record<string, unknown>)) {
      if (!/^(phone|tablet):(easy|pedals|pro)$/.test(key) || !set || typeof set !== 'object') continue;
      const out: Partial<Record<BtnId, Pos>> = {};
      for (const [id, p] of Object.entries(set as Record<string, unknown>)) {
        if (!isId(id) || !p || typeof p !== 'object') continue;
        const { x, y } = p as Record<string, unknown>;
        if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) out[id] = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
      }
      if (Object.keys(out).length > 0) pos[key] = out;
    }
  }
  return {
    scheme: isScheme(o.scheme) ? o.scheme : d.scheme,
    manual: typeof o.manual === 'boolean' ? o.manual : d.manual,
    size: (SIZES as readonly unknown[]).includes(o.size) ? (o.size as SizeKey) : d.size,
    opacity: typeof o.opacity === 'number' && Number.isFinite(o.opacity) ? Math.round(clamp(o.opacity, 0.35, 1) * 20) / 20 : d.opacity,
    lefty: typeof o.lefty === 'boolean' ? o.lefty : d.lefty,
    haptics: typeof o.haptics === 'boolean' ? o.haptics : d.haptics,
    pos,
  };
}

/** Is the gearbox in the player's hands? Proffs on a touch screen always is; elsewhere it is the setting. */
export const isManual = (c: ControlPrefs, touch: boolean): boolean => (touch && c.scheme === 'pro') || (c.manual && !(touch && c.scheme === 'easy'));

/** Does the scheme give the player the pedals (no auto-throttle)? Only on a touch screen. */
export const hasPedals = (c: ControlPrefs, touch: boolean): boolean => touch && c.scheme !== 'easy';

export const posKey = (device: DeviceClass, scheme: Scheme): string => `${device}:${scheme}`;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface Safe {
  t: number;
  r: number;
  b: number;
  l: number;
}
export interface Rect {
  id: BtnId;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A button's place in the right-handed layout: from which side, how far in and up (in units u), and how big (in units). */
interface Spot {
  side: 'L' | 'R';
  dx: number;
  dy: number;
  s: number;
  /** Smallest size in css px (a shift button stays big enough for a thumb). */
  min?: number;
}

const GAP = 0.18;

const STEER: Partial<Record<BtnId, Spot>> = {
  left: { side: 'L', dx: 0, dy: 0, s: 1.3 },
  right: { side: 'L', dx: 1.3 + GAP, dy: 0, s: 1.3 },
};

/** The default places per scheme (research layouts A, B and C in docs/mobile-controls-research.md). */
const SPOTS: Record<Scheme, Partial<Record<BtnId, Spot>>> = {
  // A: the old layout: steer left; the big brake, the handbrake beside it, nitro and the ability slot above
  easy: {
    ...STEER,
    brake: { side: 'R', dx: 0, dy: 0, s: 1.4 },
    hand: { side: 'R', dx: 1.4 + GAP, dy: 0.1, s: 1.1 },
    nitro: { side: 'R', dx: 0.25, dy: 1.4 + GAP, s: 1.0 },
    ability: { side: 'R', dx: 1.6, dy: 1.55, s: 1.0 },
  },
  // B and C: steer and the handbrake left; the big GAS under the right thumb, BROMS beside it, nitro and the ability in an arc above
  pedals: {
    ...STEER,
    hand: { side: 'L', dx: 2.6 + 2 * GAP, dy: 0.1, s: 1.05 },
    gas: { side: 'R', dx: 0, dy: 0, s: 1.55 },
    brake: { side: 'R', dx: 1.55 + GAP, dy: 0, s: 1.1 },
    nitro: { side: 'R', dx: 0.3, dy: 1.55 + GAP, s: 1.0 },
    ability: { side: 'R', dx: 1.75, dy: 1.45, s: 1.0 },
    shiftDn: { side: 'R', dx: 2.85 + 2 * GAP, dy: 0, s: 0.9, min: 56 },
    shiftUp: { side: 'R', dx: 2.85 + 2 * GAP, dy: 1.2, s: 0.9, min: 56 },
  },
  pro: {},
};
SPOTS.pro = SPOTS.pedals;

/** Which buttons a scheme shows on this car. `ability` stays hidden until a vehicle has one (phase 8). */
export function visibleButtons(scheme: Scheme, o: { nitro: boolean; ability: boolean; manual: boolean }): BtnId[] {
  const ids: BtnId[] = ['left', 'right', 'hand'];
  if (scheme === 'easy') ids.push('brake');
  else ids.push('gas', 'brake');
  // in Lätt the nitro slot is also the camera button when the car has no nitro
  if (o.nitro || scheme === 'easy') ids.push('nitro');
  if (o.ability) ids.push('ability');
  if (scheme !== 'easy' && o.manual) ids.push('shiftDn', 'shiftUp');
  return ids;
}

/** The size of one unit (css px), from the screen, the device class and the size setting. */
export function unitSize(w: number, h: number, device: DeviceClass, size: SizeKey): number {
  const base = clamp(Math.min(w, h) * 0.17, 52, 80) * SIZE_K[size];
  return Math.min(base, device === 'tablet' ? 96 : 92);
}

export interface LayoutIn {
  w: number;
  h: number;
  safe?: Safe;
  scheme: Scheme;
  size: SizeKey;
  lefty: boolean;
  /** The player's dragged positions for this device class and scheme. */
  pos?: Partial<Record<BtnId, Pos>>;
  show: readonly BtnId[];
}

const NO_SAFE: Safe = { t: 0, r: 0, b: 0, l: 0 };
/** Buttons are never dragged higher than this share of the screen: the top belongs to the HUD. */
export const MIN_Y = 0.36;

/** Pulls a rectangle back inside the screen (inside the safe area, below the HUD's part of it). */
export function clampRect(r: Rect, w: number, h: number, safe: Safe = NO_SAFE): Rect {
  const m = 4;
  const x = clamp(r.x, safe.l + m, Math.max(safe.l + m, w - safe.r - m - r.w));
  const y = clamp(r.y, Math.max(safe.t + m, h * MIN_Y), Math.max(h * MIN_Y, h - safe.b - m - r.h));
  return { ...r, x, y };
}

/** Mirrors a rectangle about the middle of the usable screen (left-handed play); mirroring twice gives the original back. */
export function mirrorRect(r: Rect, w: number, safe: Safe = NO_SAFE): Rect {
  return { ...r, x: w + safe.l - safe.r - r.x - r.w };
}

/** Where every visible button sits, in css px, mirrored for left-handers and clamped on screen. */
export function layoutRects(o: LayoutIn): Rect[] {
  const safe = o.safe ?? NO_SAFE;
  const device = deviceClass(o.w, o.h);
  const spots = SPOTS[o.scheme];
  const edgeX = device === 'tablet' ? o.w * 0.09 : 16;
  const edgeB = device === 'tablet' ? o.h * 0.07 : 12;
  const boxL = safe.l + edgeX;
  const boxR = o.w - safe.r - edgeX;
  const bottom = o.h - safe.b - edgeB;
  let u = unitSize(o.w, o.h, device, o.size);
  // both thumbs' clusters must fit side by side: shrink the unit on narrow screens (a tablet held upright)
  const reach = { L: 0, R: 0 };
  let high = 0;
  for (const id of o.show) {
    const sp = spots[id];
    if (!sp) continue;
    reach[sp.side] = Math.max(reach[sp.side], sp.dx + sp.s);
    high = Math.max(high, sp.dy + sp.s);
  }
  // ... and the speedometer between them stays free, and the stack on the right stays under the minimap
  const hud = hudZones(o.w, o.h, safe);
  u = Math.min(u, (boxR - boxL - hud.speedo.w - 12) / (reach.L + reach.R + 0.3), (bottom - hud.minimap.y - hud.minimap.h - 8) / high);
  const out: Rect[] = [];
  for (const id of o.show) {
    const sp = spots[id];
    if (!sp) continue;
    const size = Math.max(sp.s * u, Math.min(sp.min ?? 0, sp.s * u * 1.4));
    let r: Rect = { id, x: sp.side === 'L' ? boxL + sp.dx * u : boxR - sp.dx * u - size, y: bottom - sp.dy * u - size, w: size, h: size };
    const p = o.pos?.[id];
    if (p) r = { id, w: size, h: size, x: p.x * o.w - size / 2, y: p.y * o.h - size / 2 };
    r = clampRect(r, o.w, o.h, safe);
    out.push(o.lefty ? mirrorRect(r, o.w, safe) : r);
  }
  // mirrored, ◀ must still be the left one of the pair (unless the player placed either of them)
  const l = out.find((r) => r.id === 'left');
  const rt = out.find((r) => r.id === 'right');
  if (o.lefty && l && rt && !o.pos?.left && !o.pos?.right) [l.x, rt.x] = [rt.x, l.x];
  return out;
}

/** The place to remember for a button that was dragged to this rectangle (in the layout as it is shown). */
export function posFromRect(r: Rect, w: number, h: number, lefty: boolean, safe: Safe = NO_SAFE): Pos {
  const un = clampRect(lefty ? mirrorRect(r, w, safe) : r, w, h, safe);
  return { x: (un.x + un.w / 2) / w, y: (un.y + un.h / 2) / h };
}

/** The HUD's own parts that the buttons must stay clear of: the minimap (top right) and the speedometer (bottom middle). */
export function hudZones(w: number, h: number, safe: Safe = NO_SAFE): { minimap: Rect; speedo: Rect } {
  const s = clamp(Math.min(w / 980, h / 620), 0.58, 1.25);
  const msize = 156 * s;
  const sw = 190 * s;
  const sh = 128 * s;
  return {
    minimap: { id: 'left', x: w - Math.max(12 * s, safe.r) - msize, y: Math.max(62 * s, 54), w: msize, h: msize },
    speedo: { id: 'left', x: (w - sw) / 2, y: h - Math.max(4 * s, safe.b) - sh, w: sw, h: sh },
  };
}

export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------

/** The controls help for what is chosen (touch screens). */
export function touchHowTo(c: ControlPrefs): string[] {
  const manual = isManual(c, true);
  if (c.scheme === 'easy') {
    return ['Bilen gasar själv. Du styr med ◀ ▶', '▼ bromsar. Håll kvar för att backa.', '🌀 handbroms. Sladda länge för turbo.', '🔥 nitro (om bilen har turbo) · 🎥 byter kamera', 'Knappen med bilens egen symbol är förmågan. Ringen fylls på, tryck när den lyser gult.', 'Moppen ringer i klockan själv bakom andra bilar. Terror.'];
  }
  const lines = ['Håll GAS för att köra, släpp för att rulla av. BROMS bromsar och backar.', 'Styr med ◀ ▶. 🌀 är handbroms: sladda länge för turbo.', '🔥 nitro (om bilen har turbo). 🎥 byter kamera, uppe i hörnet.', 'Knappen med bilens egen symbol är förmågan. Ringen fylls på, tryck när den lyser gult.'];
  if (manual) lines.push('Växla själv med + och −. Skifta när lampan blir röd för en liten spark. Dra upp eller ned på GAS går också.', 'För tidigt skifte gör motorn seg, för sent studsar den i begränsaren.');
  else lines.push('Växlarna sköter bilen själv.');
  return lines;
}

/** The controls help for the keyboard and the gamepad. */
export function keyHowTo(manual: boolean): string[] {
  const lines = [
    '↑ / W gasar, ↓ / S bromsar och backar',
    '← → / A D styr · Mellanslag: handbroms. Sladda länge för turbo!',
    'L: nitro (om bilen har turbo) · F: bilens förmåga · H: tuta · C / Enter: kamera · R: tillbaka på vägen',
    'Handkontroll: RT gas, LT broms, A handbroms, X nitro, Y förmåga, B tillbaka på vägen',
  ];
  if (manual) lines.push('Växla själv: E upp, Q ned (handkontroll: RB upp, LB ned). Skifta när lampan blir röd.');
  else lines.push('Vill du växla själv? Slå på Manuell växling i inställningarna (Q / E eller LB / RB).');
  return lines;
}
