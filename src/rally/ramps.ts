// Stunt ramps. A ramp is a bump in the ground laid over the road in the road's own coordinates (s along the
// centre line, d sideways), so the physics (car.ts groundAt) and the mesh (rampmesh.ts) read the same numbers.
// A kicker is a wedge that rises towards its lip and drops away at once; a hump is a crest that works from both
// ways; the shortcut jump is one big kicker: clean over it and land beyond it and you are credited a stretch of road.
// Placement is seeded and checked against the track (straight, flat, wide enough, away from the line the computer
// cars drive) so a ramp never sits in a bend, on the bridge or in a tunnel, or on the start line.
import type { Track } from './track.ts';
import { rng } from './util.ts';

export type RampKind = 'kicker' | 'hump' | 'shortcut';

export interface RampSpec {
  kind: RampKind;
  /** Centre along the road (m) and across it (d, positive to the left). */
  s: number;
  d: number;
  /** Direction of the rise in the (s, d) plane: 0 rises along the road (towards +s), π against it, ±π/2 across it. */
  ang: number;
  /** Length along the rise, width across it, and height at the lip (m). */
  len: number;
  width: number;
  height: number;
}

/** The sizes: a kicker throws a car about 0.9 s, the shortcut jump about 1.8 s. */
export const KICKER = { len: 7, width: 4, height: 1.25 } as const;
export const HUMP = { len: 10, width: 5, height: 0.8 } as const;
export const SHORTCUT = { len: 10, width: 4.6, height: 2.7 } as const;
/** Metres of road credited for a clean shortcut jump, and the window beyond the lip it must land in. */
export const SHORTCUT_SKIP = 45;
export const SHORTCUT_LAND: readonly [number, number] = [14, 105];
/** The slowest a car can be to still clear the shortcut (m/s). */
export const SHORTCUT_MIN_SPEED = 21;

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Height of one ramp at a spot, given the spot's offset from the ramp centre along the road and across it. */
export function rampHeight(r: RampSpec, ds: number, dd: number): number {
  const c = Math.cos(r.ang);
  const s = Math.sin(r.ang);
  const u = ds * c + dd * s;
  const v = -ds * s + dd * c;
  const half = r.len / 2;
  if (u < -half || u > half) return 0;
  // the sides are not a cliff: a car clipping the edge climbs a little instead of being thrown
  const side = smoothstep(r.width / 2 + 0.7, r.width / 2, Math.abs(v));
  if (side <= 0) return 0;
  if (r.kind === 'hump') return r.height * 0.5 * (1 + Math.cos((Math.PI * u) / half)) * side;
  // a wedge: up from nothing at the back to the full height at the lip, then the ground is gone
  return r.height * ((u + half) / r.len) * side;
}

/** The ramps as a ground lift: the height they add at road position (s, d). */
export function liftFor(ramps: readonly RampSpec[], track: Track): (s: number, d: number) => number {
  if (ramps.length === 0) return () => 0;
  return (s, d) => {
    let h = 0;
    for (const r of ramps) {
      const ds = track.wrapDist(s - r.s);
      const dd = d - r.d;
      const reach = Math.max(r.len, r.width) * 0.75 + 1;
      if (ds > reach || ds < -reach || dd > reach || dd < -reach) continue;
      h += rampHeight(r, ds, dd);
    }
    return h;
  };
}

/** Where the lip of a wedge is (the take-off), in road coordinates. */
export function lipOf(r: RampSpec): { s: number; d: number } {
  return { s: r.s + Math.cos(r.ang) * (r.len / 2), d: r.d + Math.sin(r.ang) * (r.len / 2) };
}

/** How bendy the road may be at a ramp (1/radius, per metre) and how far past the lip it must stay sound, by kind. */
const BEND: Record<RampKind, { curv: number; ahead: number }> = {
  kicker: { curv: 1 / 240, ahead: 22 },
  hump: { curv: 1 / 240, ahead: 12 },
  shortcut: { curv: 1 / 280, ahead: 60 },
};

/** The narrowest a ramp is made (a car is 1.9 m wide). */
const MIN_WIDTH: Record<RampKind, number> = { kicker: 2.8, hump: 3, shortcut: 3.4 };

/** Is this spot of the road a sound place for a ramp: straight enough, flat, plain, wide enough, not near the start? */
function sound(track: Track, i: number, kind: RampKind, len: number, hwMin: number, relax = false): boolean {
  const bend = relax ? { curv: 1 / 100, ahead: 28 } : BEND[kind];
  // (a winding course gets its ramps on the best stretch there is: `relax` takes a bendier one)
  const n = track.n;
  const s = i * track.ds;
  // the start line, and the grid before it
  const fromStart = Math.min(s, track.length - s);
  if (fromStart < 70) return false;
  const back = Math.ceil((len / 2 + 10) / track.ds);
  const fwd = Math.ceil((len / 2 + bend.ahead) / track.ds);
  for (let k = -back; k <= fwd; k++) {
    const j = (i + k + n) % n;
    if (Math.abs(track.curv[j]!) > bend.curv) return false;
    if (track.bridge[j] || track.tunnel[j]) return false;
    if (k >= -Math.ceil(len / 2 / track.ds) - 2 && track.hw[j]! < hwMin) return false;
    if (track.surf[j] === 4) return false;
    // a flat stretch: a ramp on a slope would be a different jump
    const slope = (track.py[(j + 1) % n]! - track.py[(j - 1 + n) % n]!) / (2 * track.ds);
    if (Math.abs(slope) > 0.07) return false;
  }
  return true;
}

export interface RampOpts {
  kickers?: number;
  shortcuts?: number;
}

/**
 * A few kicker ramps and one shortcut jump for a course, spread round the lap, each at the road's edge on the side
 * furthest from the racing line. `bumps` are the arc lengths of the course's own crests, which a ramp keeps clear of.
 */
export function placeRamps(track: Track, seed: number, bumps: readonly number[] = [], opts: RampOpts = {}): RampSpec[] {
  const r = rng(Math.imul(seed | 0, 2654435761) ^ 0x51ed270b);
  const out: RampSpec[] = [];
  const kickers = opts.kickers ?? 3;
  const shortcuts = opts.shortcuts ?? 1;
  const kinds: RampKind[] = [...Array<RampKind>(shortcuts).fill('shortcut'), ...Array<RampKind>(kickers).fill('kicker')];
  // the shortcut goes first so it gets the best stretch of road, then the kickers in between
  const slots = kinds.length;
  const order = kinds.map((_, k) => k);
  const phase = r();
  order.forEach((k, idx) => {
    const kind = kinds[k]!;
    const dims = kind === 'shortcut' ? SHORTCUT : KICKER;
    const target = ((idx + 0.5 + (r() - 0.5) * 0.5) / slots + phase) % 1;
    // walk outwards from the target until a sound spot turns up
    let best: { i: number; side: 1 | -1; d: number; width: number } | null = null;
    const span = Math.floor(track.n * 0.5);
    // a winding course gets its shortcut on the best stretch there is: strict first, then a little bendier
    for (const relax of [false, true]) {
    for (let off = 0; off < span && !best; off += 2) {
      for (const sg of [1, -1]) {
        const i = (Math.floor(target * track.n) + sg * off + track.n) % track.n;
        const s = i * track.ds;
        if (!sound(track, i, kind, dims.len, MIN_WIDTH[kind] + 3.2, relax)) continue;
        if (bumps.some((b) => Math.abs(track.wrapDist(s - b)) < 80)) continue;
        if (out.some((o) => Math.abs(track.wrapDist(s - o.s)) < (o.kind === 'shortcut' || kind === 'shortcut' ? 120 : 70))) continue;
        // which edge: the one further from the racing line, and a ramp as wide as the road lets it be (a narrow road gets a narrower ramp)
        const hw = track.hw[i]!;
        const line = track.line[i]!;
        const side: 1 | -1 = line > 0 ? -1 : 1;
        const width = Math.floor(Math.min(dims.width, hw - 3.2 + Math.abs(line) - 0.05) * 10) / 10;
        if (width < MIN_WIDTH[kind]) continue;
        const d = side * (hw - width / 2 - 1.0);
        if (Math.abs(d - line) < width / 2 + 2.2) continue;
        best = { i, side, d, width };
        break;
      }
    }
    }
    if (!best) return;
    out.push({ kind, s: best.i * track.ds, d: best.d, ang: 0, len: dims.len, width: best.width, height: dims.height });
  });
  return out.sort((a, b) => a.s - b.s);
}

/** Ramps for the arena: scattered over the floor, pointing every way, kickers and humps, away from where cars start. */
export function arenaRamps(track: Track, seed: number, hw: number, count: number, avoidS: readonly number[] = []): RampSpec[] {
  const r = rng(Math.imul(seed | 0, 2246822519) ^ 0x2545f491);
  const out: RampSpec[] = [];
  const angs = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
  for (let tries = 0; out.length < count && tries < 200; tries++) {
    const s = r() * track.length;
    const kind: RampKind = out.length % 3 === 2 ? 'hump' : 'kicker';
    const dims = kind === 'hump' ? HUMP : KICKER;
    const d = (r() * 2 - 1) * (hw - dims.len / 2 - 6);
    if (Math.abs(d) > hw * 0.62) continue;
    if (avoidS.some((a) => Math.abs(track.wrapDist(s - a)) < 14 && Math.abs(d) > hw * 0.45)) continue;
    // not on top of another ramp
    const here = track.point(s, d);
    if (out.some((o) => {
      const p = track.point(o.s, o.d);
      return Math.hypot(p.x - here.x, p.z - here.z) < 22;
    })) continue;
    out.push({ kind, s, d, ang: angs[Math.floor(r() * angs.length)]!, len: dims.len, width: dims.width, height: dims.height });
  }
  return out;
}

/** Has a car that took off at `from` landed in the shortcut's window? (The ramp's lip is the take-off point.) */
export function shortcutLanded(r: RampSpec, landS: number, track: Track): boolean {
  const lip = lipOf(r);
  const gap = track.wrapDist(landS - lip.s);
  return gap >= SHORTCUT_LAND[0] && gap <= SHORTCUT_LAND[1];
}
