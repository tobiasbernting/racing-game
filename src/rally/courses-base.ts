// What the courses are made of: the types (sky, ground, theme, course), the sky presets for the times of day
// and the little helpers for drawing a course's centre line and land. courses.ts has the farm and the six
// courses of the countryside, courses-wild.ts the five of the wild and the crazy.
import type { RallyCourse, RallyTime } from '../shared/rally.ts';
import type { Layout } from './layout.ts';
import type { Ctrl, TrackDef } from './track.ts';
import { fbm, smooth } from './util.ts';

/** A sky: the sun (or moon) and the colours of the dome, the lights and the haze. */
export interface SkyPreset {
  /** Sun elevation (degrees) and azimuth (radians, as atan2(x, z)). */
  elev: number;
  az: number;
  zenith: string;
  horizon: string;
  haze: string;
  sunCol: string;
  cloud: string;
  /** Cloud cover: 0.5 a few, 0.3 overcast. */
  cover: number;
  sunLight: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  fog: number;
  /** Stars and a moon instead of the sun disc (0..1). */
  night: number;
  exposure: number;
  /** Space (the moon): stars all the time, the sun's disc stays, and the Earth hangs in the sky. */
  earth?: { az: number; elev: number; size: number };
}

/** Ground colours (see terrain.ts). */
export interface GroundColors {
  grassA: string;
  grassB: string;
  grassDark: string;
  dry: string;
  floor: string;
  sand: string;
  mud: string;
  verge: string;
  mowA: string;
  mowB: string;
  farTint: string;
  /** A gingham tablecloth over the ground (the kitchen): two colours and the size of a square in metres. */
  check?: { a: string; b: string; size: number };
}

export type ScenerySet = 'farm' | 'forest' | 'ice' | 'beach' | 'city' | 'desert' | 'volcano' | 'candy' | 'moon' | 'kitchen';

export interface Theme {
  sky: Record<RallyTime, SkyPreset>;
  ground: GroundColors;
  scenery: ScenerySet;
  /** Snow always falls here. */
  snow: boolean;
  /** Street lights and signs lit whatever the time (the city). */
  lit: boolean;
  /** The time of day that is always night-like (headlights on). */
  alwaysNight: boolean;
  /** The verge next to the road: dirt, snow, sand or kerbstone. */
  verge: string;
  vergeGrass: string;
  /** Multiplies the colour of the road surface (chocolate asphalt, a red table runner). */
  roadTint?: string;
  /** Gravity for every car on the course (the moon is low), 1 when left out. */
  gravity?: number;
}

export interface CourseDef extends TrackDef {
  id: RallyCourse;
  /** Shown on the start banner. */
  name: string;
  theme: Theme;
  layout: Layout;
}

// ---------------------------------------------------------------------------
// Skies
// ---------------------------------------------------------------------------

export const GOLDEN: SkyPreset = {
  elev: 13,
  az: Math.atan2(-0.62, 0.78),
  zenith: '#4382d6',
  horizon: '#f4c99c',
  haze: '#ffa05a',
  sunCol: '#ffc274',
  cloud: '#f3dccb',
  cover: 0.5,
  sunLight: '#ffd09a',
  sunI: 2.7,
  hemiSky: '#b3cdf5',
  hemiGround: '#7a6b48',
  hemiI: 1.35,
  fog: 0.00062,
  night: 0,
  exposure: 1.02,
};

export const DUSK: SkyPreset = {
  elev: 4,
  az: Math.atan2(-0.62, 0.78),
  zenith: '#3b4f9a',
  horizon: '#f59a6a',
  haze: '#ff7a45',
  sunCol: '#ff9a5a',
  cloud: '#d99aa0',
  cover: 0.48,
  sunLight: '#ff9d6a',
  sunI: 1.8,
  hemiSky: '#8f8fd0',
  hemiGround: '#5a4a3a',
  hemiI: 1.15,
  fog: 0.0009,
  night: 0.15,
  exposure: 1.0,
};

export const NIGHT: SkyPreset = {
  elev: 32,
  az: Math.atan2(0.5, -0.8),
  zenith: '#0b1330',
  horizon: '#24325a',
  haze: '#3a4a7a',
  sunCol: '#c8d6ff',
  cloud: '#2a3352',
  cover: 0.55,
  sunLight: '#8ea6e6',
  sunI: 0.55,
  hemiSky: '#46588c',
  hemiGround: '#1c1a24',
  hemiI: 0.75,
  fog: 0.0011,
  night: 1,
  exposure: 1.05,
};

export const DAY: SkyPreset = {
  elev: 48,
  az: Math.atan2(-0.4, 0.9),
  zenith: '#2f7fe0',
  horizon: '#bfe0f5',
  haze: '#fff2d6',
  sunCol: '#fff1cc',
  cloud: '#ffffff',
  cover: 0.55,
  sunLight: '#fff3dc',
  sunI: 2.9,
  hemiSky: '#cfe4ff',
  hemiGround: '#a89a6a',
  hemiI: 1.25,
  fog: 0.00045,
  night: 0,
  exposure: 1.0,
};

export const sky = (p: SkyPreset, o: Partial<SkyPreset>): SkyPreset => ({ ...p, ...o });

// ---------------------------------------------------------------------------
// Shared bits for the new courses
// ---------------------------------------------------------------------------

/** A plain land of swells, one or two big hills, and mountains round the edge. */
export function land(base: number, swell: number, hills: [number, number, number, number, number][], rim: number, far: number): Layout['natural'] {
  return (x, z, cx, cz, ex, ez) => {
    let h = base + swell * fbm(x / 170 + 1.3, z / 170 - 2.1, 4) + swell * 0.35 * fbm(x / 50, z / 50, 2);
    for (const [hx, hz, hh, rx, rz] of hills) h += hh * Math.exp(-(((x - hx) / rx) ** 2) - ((z - hz) / rz) ** 2);
    const r = Math.hypot((x - cx) / (ex + 150), (z - cz) / (ez + 150));
    h += smooth(1.0, 3.4, r) * rim * (fbm(x / 520 + 9, z / 520 - 4, 3) + 0.7);
    h += smooth(2.6, 7, r) * far * (fbm(x / 1100 - 3, z / 1100 + 6, 3) + 0.6);
    return h;
  };
}

export const layout = (o: Partial<Layout> & Pick<Layout, 'natural'>): Layout => ({
  waterY: 0.55,
  lake: null,
  lakeKind: 'water',
  stream: null,
  fields: [],
  forests: [],
  farForest: 1,
  farBirch: 0.3,
  farCx: 0,
  farCz: 0,
  shoreTrees: false,
  ...o,
});

export const P = (x: number, z: number, y: number, o: Partial<Ctrl> = {}): Ctrl => ({ x, z, y, ...o });
/** The courses are drawn small and scaled up to size (bends keep their shape, roads their width). */
export const grow = (ctrl: Ctrl[], k: number): Ctrl[] => ctrl.map((c) => ({ ...c, x: c.x * k, z: c.z * k }));
