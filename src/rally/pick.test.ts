import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { classifyHit, focusPoint, yawToFace, type Pickable } from './pick.ts';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const car: Pickable = {
  slots: { hood: V(0, 0.9, 1.1), roof: V(0, 1.4, -0.2), doors: V(0.95, 0.8, -0.1), back: V(0, 0.9, -2), plate: V(0, 0.6, -2.1), head: V(0.3, 1.2, 0.1), spoiler: V(0, 1.2, -1.9) },
  wheelPos: [[0.8, 1.15], [-0.8, 1.15], [0.8, -1.35], [-0.8, -1.35]],
  wheelRadii: [0.34, 0.34, 0.34, 0.34],
  extent: { halfW: 0.95, front: 2.1, back: -2.1, top: 1.5 },
};

describe('tapping the 3D car', () => {
  it('finds the wheels on both sides', () => {
    expect(classifyHit(car, V(0.85, 0.3, 1.15), false)).toEqual({ kind: 'wheels' });
    expect(classifyHit(car, V(-0.85, 0.3, -1.3), false)).toEqual({ kind: 'wheels' });
  });
  it('finds the sticker slots, the doors on both sides', () => {
    expect(classifyHit(car, V(0, 0.9, 1.0), false)).toEqual({ kind: 'decal', slot: 'hood' });
    expect(classifyHit(car, V(0, 1.45, -0.3), false)).toEqual({ kind: 'decal', slot: 'roof' });
    expect(classifyHit(car, V(0.95, 0.8, 0), false)).toEqual({ kind: 'decal', slot: 'doors' });
    expect(classifyHit(car, V(-0.95, 0.8, 0), false)).toEqual({ kind: 'decal', slot: 'doors' });
    expect(classifyHit(car, V(0, 0.9, -1.9), false)).toEqual({ kind: 'decal', slot: 'back' });
  });
  it('finds the head, the plate and (only when there is one) the spoiler', () => {
    expect(classifyHit(car, V(0.3, 1.25, 0.1), false)).toEqual({ kind: 'head' });
    expect(classifyHit(car, V(0, 0.6, -2.15), false)).toEqual({ kind: 'plate' });
    expect(classifyHit(car, V(0, 1.2, -1.9), true)).toEqual({ kind: 'spoiler' });
    expect(classifyHit(car, V(0, 1.2, -1.9), false).kind).not.toBe('spoiler');
  });
  it('turns a part toward the camera', () => {
    // yaw rotates a point about the y axis; the result should point along +z
    for (const [x, z] of [[0.95, 0], [-0.95, 0], [0, -2], [0, 1.1], [0.8, 1.15]] as const) {
      const yaw = yawToFace(x, z);
      const px = x * Math.cos(yaw) + z * Math.sin(yaw);
      const pz = -x * Math.sin(yaw) + z * Math.cos(yaw);
      expect(Math.abs(px)).toBeLessThan(1e-9);
      expect(pz).toBeGreaterThan(0);
    }
    expect(focusPoint(car, 'wheels').x).toBeGreaterThan(0);
  });
});
