// A course with a variation applied (shared/variation.ts): mirrored left to right, driven the other way round,
// the land's colours tinted. Everything the track and the scenery read comes out consistently flipped: the
// centre line, the fences, the lake and the forests, and the ground itself.
import { variationFor, type Variation } from '../shared/variation.ts';
import type { RallyCourse } from '../shared/rally.ts';
import type { CourseDef, GroundColors } from './courses-base.ts';
import { COURSES } from './courses.ts';
import type { Layout } from './layout.ts';
import type { Ctrl } from './track.ts';

/** Left and right swapped: used when the course is mirrored or reversed. */
function swapSides(c: Ctrl): Ctrl {
  return { ...c, runL: c.runR, runR: c.runL, fenceL: c.fenceR, fenceR: c.fenceL };
}

/** x → −x, and what was on the left is now on the right. */
export function mirrorCtrl(ctrl: Ctrl[]): Ctrl[] {
  return ctrl.map((c) => ({ ...swapSides(c), x: -c.x }));
}

/**
 * The other way round: the start stays, the points come in reverse order. What a control point says about "the
 * road from here to the next" (surface, run-off, fences, tunnel, deck) belongs to the segment, so it moves with
 * the segment: the point before it in the original order. Left and right swap.
 */
export function reverseCtrl(ctrl: Ctrl[]): Ctrl[] {
  const m = ctrl.length;
  return ctrl.map((_, k) => {
    const at = ctrl[(m - k) % m]!;
    const seg = ctrl[(m - k - 1 + m) % m]!;
    return {
      x: at.x,
      z: at.z,
      y: at.y,
      hw: at.hw,
      bump: at.bump,
      bw: at.bw,
      bridge: at.bridge,
      gravel: seg.gravel,
      surface: seg.surface,
      tunnel: seg.tunnel,
      deck: seg.deck,
      runL: seg.runR,
      runR: seg.runL,
      fenceL: seg.fenceR,
      fenceR: seg.fenceL,
    };
  });
}

/** The land flipped left to right. */
export function mirrorLayout(L: Layout): Layout {
  const nat = L.natural;
  return {
    ...L,
    lake: L.lake ? { ...L.lake, cx: -L.lake.cx, rot: -L.lake.rot } : null,
    stream: L.stream ? L.stream.map(([x, z]) => [-x, z] as [number, number]) : null,
    fields: L.fields.map((f) => ({ ...f, x: -f.x, rot: -f.rot })),
    forests: L.forests.map((f) => ({ ...f, x: -f.x })),
    farCx: -L.farCx,
    vent: L.vent ? [-L.vent[0], L.vent[1]] : undefined,
    natural: (x, z, cx, cz, ex, ez) => nat(-x, z, -cx, cz, ex, ez),
  };
}

const tinted = (hex: string, t: [number, number, number]): string => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[((n >> 16) & 255) * t[0], ((n >> 8) & 255) * t[1], (n & 255) * t[2]].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`;
};

/** The ground colours tinted (the check colours of a cloth too). */
export function tintGround(g: GroundColors, t: [number, number, number]): GroundColors {
  const out = { ...g };
  for (const k of Object.keys(g) as (keyof GroundColors)[]) {
    const v = g[k];
    if (typeof v === 'string' && v.startsWith('#')) (out as Record<string, unknown>)[k] = tinted(v, t);
  }
  return out;
}

/** The course for a race: the plain course with the seed's variation applied. */
export function courseFor(id: RallyCourse, v: Variation | null, narrow = 1): CourseDef {
  const base = COURSES[id];
  if (!v) return narrowCourse(base, narrow);
  let ctrl = base.ctrl;
  let layout = base.layout;
  if (v.mirror) {
    ctrl = mirrorCtrl(ctrl);
    layout = mirrorLayout(layout);
  }
  if (v.reverse) ctrl = reverseCtrl(ctrl);
  const ground = tintGround(base.theme.ground, v.tint);
  return narrowCourse({ ...base, ctrl, layout, theme: { ...base.theme, ground } }, narrow);
}

/** The same course on a narrower road (later acts): every half width scaled, never below 5 m. */
export function narrowCourse(c: CourseDef, k: number): CourseDef {
  if (k >= 0.999) return c;
  const hw = (w: number): number => Math.max(5, w * k);
  return { ...c, hw: hw(c.hw), ctrl: c.ctrl.map((p) => (p.hw === undefined ? p : { ...p, hw: hw(p.hw) })) };
}

export { variationFor };
