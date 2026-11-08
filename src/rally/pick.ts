// What a tap on the garage's 3D car means: a sticker slot, the wheels, the spoiler, the plate, the driver's head, or just
// "the paint". Pure maths on the model's measurements, so it is tested without a browser.
import * as THREE from 'three';
import type { DecalSlot } from '../shared/rally.ts';

export type Hit = { kind: 'decal'; slot: DecalSlot } | { kind: 'wheels' | 'spoiler' | 'plate' | 'head' | 'body' };

/** The slice of a car model the picking needs (CarModel has all of it). */
export interface Pickable {
  slots: Record<DecalSlot | 'plate' | 'head' | 'spoiler', THREE.Vector3>;
  wheelPos: [number, number][];
  wheelRadii: number[];
  extent: { halfW: number; front: number; back: number; top: number };
}

/** `p` is a point on the car in the model root's frame (x to the left side, z forward). */
export function classifyHit(m: Pickable, p: THREE.Vector3, hasSpoiler: boolean): Hit {
  const big = Math.max(m.extent.front - m.extent.back, m.extent.top * 1.4, m.extent.halfW * 2);
  for (let i = 0; i < m.wheelPos.length; i++) {
    const [x, z] = m.wheelPos[i]!;
    const r = m.wheelRadii[i] ?? 0.35;
    if (Math.hypot(Math.abs(p.x) - Math.abs(x), p.y - r, p.z - z) < r * 1.35) return { kind: 'wheels' };
  }
  if (p.distanceTo(m.slots.head) < 0.3 + big * 0.04) return { kind: 'head' };
  if (hasSpoiler && p.distanceTo(m.slots.spoiler) < 0.25 + big * 0.1) return { kind: 'spoiler' };
  if (p.distanceTo(m.slots.plate) < 0.15 + big * 0.025) return { kind: 'plate' };
  let best: DecalSlot | null = null;
  let bestD = Infinity;
  for (const slot of ['hood', 'roof', 'doors', 'back'] as const) {
    const a = m.slots[slot];
    // the doors are on both sides
    const q = slot === 'doors' ? new THREE.Vector3(Math.abs(p.x), p.y, p.z) : p;
    const d = q.distanceTo(a);
    if (d < bestD) {
      bestD = d;
      best = slot;
    }
  }
  return best && bestD < big * 0.55 ? { kind: 'decal', slot: best } : { kind: 'body' };
}

/** The yaw that turns a point of the car (root frame) toward a camera on +z. */
export const yawToFace = (x: number, z: number): number => Math.atan2(-x, z);

/** Where to look for each part of the garage: the point on the car, in the root frame. */
export function focusPoint(m: Pickable, what: Hit['kind'] | DecalSlot): THREE.Vector3 {
  switch (what) {
    case 'wheels': {
      const [x, z] = m.wheelPos[0] ?? [0, 0];
      return new THREE.Vector3(Math.abs(x), 0.3, z);
    }
    case 'spoiler':
    case 'plate':
    case 'head':
    case 'hood':
    case 'roof':
    case 'doors':
    case 'back':
      return m.slots[what].clone();
    default:
      return new THREE.Vector3(m.extent.halfW, m.extent.top * 0.5, 0);
  }
}
