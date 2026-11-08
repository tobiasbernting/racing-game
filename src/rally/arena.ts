// The derby arenas. An arena is a closed ring of very wide road (a track the physics, the computer cars and the
// minimap already understand) round a solid island in the middle: the outer fence is the tyre wall of the bowl, the
// inner one the island. Two layouts: the round Skrotskålen and the long Däckovalen. The seed sets the direction of the
// ring, the ramps on the floor, the colours and where the crowd cheers loudest. Plain data and maths, no Three.js.
import { ARENAS, type ArenaId } from '../shared/derby.ts';
import { DAY, DUSK, NIGHT, layout, sky, P } from './courses-base.ts';
import type { CourseDef } from './courses-base.ts';
import { FenceX, Track, type Ctrl } from './track.ts';
import { arenaRamps, type RampSpec } from './ramps.ts';
import { rng } from './util.ts';

export interface ArenaShape {
  /** Semi-axes of the centre line (m), half the width of the floor, and the number of control points. */
  a: number;
  b: number;
  hw: number;
  points: number;
  /** Ramps on the floor. */
  ramps: number;
}

export const ARENA_SHAPES: Record<ArenaId, ArenaShape> = {
  bowl: { a: 48, b: 48, hw: 39, points: 18, ramps: 6 },
  oval: { a: 86, b: 50, hw: 19, points: 24, ramps: 5 },
};

export interface ArenaCourse {
  id: ArenaId;
  def: CourseDef;
  /** The ring as a Track (a free-for-all: no racing line, a flat speed profile). */
  track: Track;
  shape: ArenaShape;
  /** The middle of the arena (the island). */
  cx: number;
  cz: number;
  ramps: RampSpec[];
  /** The colours of this evening's arena: tyre bands, banners, the glow of the floodlights. */
  paint: { band: string; accent: string; flood: string; crowd: string[] };
  /** The ring is driven this way round (1 or -1); the cars start facing the middle. */
  dir: 1 | -1;
}

const BANDS = ['#e8412c', '#ffcf1f', '#2a6fe0', '#f4f1ea', '#18a89a', '#f06ba8'];
const FLOODS = ['#fff1d0', '#dfe9ff', '#ffe2b0'];
const CROWD = ['#e8412c', '#ffcf1f', '#2a6fe0', '#f4f1ea', '#18a89a', '#f06ba8', '#8a4fd8', '#ff8a1f'];

/** The ring's control points (the first one is the start). */
export function arenaCtrl(shape: ArenaShape, dir: 1 | -1): Ctrl[] {
  const out: Ctrl[] = [];
  for (let k = 0; k < shape.points; k++) {
    const t = (k / shape.points) * Math.PI * 2 * dir;
    out.push(P(Math.cos(t) * shape.a, Math.sin(t) * shape.b, 0, { hw: shape.hw, runL: 2.2, runR: 2.2, fenceL: FenceX.Tyres, fenceR: FenceX.Tyres }));
  }
  return out;
}

export function arenaCourse(id: ArenaId, seed: number, gravity = 1): ArenaCourse {
  const shape = ARENA_SHAPES[id];
  const r = rng(Math.imul(seed | 0, 374761393) ^ (id === 'bowl' ? 0x1234 : 0x4321));
  const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
  const info = ARENAS[id];
  const def: CourseDef = {
    id: info.course,
    name: info.name,
    ctrl: arenaCtrl(shape, dir),
    surface: 'gravel',
    fence: FenceX.Tyres,
    hw: shape.hw,
    run: 2.2,
    theme: {
      sky: {
        day: sky(DAY, { zenith: '#24407a', horizon: '#c98a6a', haze: '#a9657a', elev: 6, sunI: 1.4, hemiI: 1.05, fog: 0.0011, night: 0.1, exposure: 1.0 }),
        sunset: sky(DUSK, { zenith: '#20285a', horizon: '#ff8a52', haze: '#a8507a', sunI: 1.5, hemiI: 1.7, fog: 0.0012, night: 0.35 }),
        night: sky(NIGHT, { zenith: '#070d26', horizon: '#3a3068', haze: '#5a4488', sunI: 1.1, hemiI: 2.1, hemiSky: '#8a96d8', hemiGround: '#6a5e72', fog: 0.0011, exposure: 1.2 }),
      },
      ground: {
        grassA: '#4a4234',
        grassB: '#544a3a',
        grassDark: '#342e26',
        dry: '#5a5040',
        floor: '#3a3226',
        sand: '#8a7a5a',
        mud: '#3c3024',
        verge: '#6a5e4a',
        mowA: '#6a5e4a',
        mowB: '#62564a',
        farTint: '#2a2a3a',
      },
      scenery: 'city',
      snow: false,
      lit: true,
      alwaysNight: false,
      verge: '#6a5e4a',
      vergeGrass: '#5a5040',
      gravity: gravity === 1 ? undefined : gravity,
    },
    layout: layout({ natural: () => 0, farForest: 0, farBirch: 0 }),
  };
  const track = new Track(def);
  // the floor is a free-for-all: no racing line to speak of, and the touch drive never slows for a bend that is not there
  track.line.fill(0);
  track.vmax.fill(40);
  const cx = def.ctrl.reduce((a, c) => a + c.x, 0) / def.ctrl.length;
  const cz = def.ctrl.reduce((a, c) => a + c.z, 0) / def.ctrl.length;
  const starts = Array.from({ length: 8 }, (_, k) => (k / 8) * track.length);
  const ramps = arenaRamps(track, seed, shape.hw, shape.ramps, starts);
  return {
    id,
    def,
    track,
    shape,
    cx,
    cz,
    ramps,
    paint: { band: BANDS[Math.floor(r() * BANDS.length)]!, accent: BANDS[Math.floor(r() * BANDS.length)]!, flood: FLOODS[Math.floor(r() * FLOODS.length)]!, crowd: [...CROWD].sort(() => r() - 0.5).slice(0, 5) },
    dir,
  };
}

/** Where car number `i` of `n` starts: on the outer edge of the floor, evenly round, facing the middle. */
export function arenaStart(track: Track, shape: ArenaShape, cx: number, cz: number, i: number, n: number, phase = 0): { s: number; d: number; heading: number } {
  const s = ((i / n + phase) % 1) * track.length;
  const reach = shape.hw - 5;
  // the outer side is the one further from the middle
  const a = track.point(s, reach);
  const b = track.point(s, -reach);
  const outer = Math.hypot(a.x - cx, a.z - cz) > Math.hypot(b.x - cx, b.z - cz) ? 1 : -1;
  const p = outer > 0 ? a : b;
  return { s, d: outer * reach, heading: Math.atan2(cx - p.x, cz - p.z) };
}
