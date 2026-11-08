// Every styling option on every body: building the 3D car must never throw, whatever the kid picks. Runs without a
// browser: a stand-in canvas swallows the drawing, so what is checked is the geometry (attach points) and the code paths.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CAR_BODIES, CAR_DECALS, CAR_EXTRAS, CAR_FINISHES, CAR_LIVERIES, CAR_SMOKES, CAR_SPOILERS, CAR_WHEELS, DECAL_SLOTS, HELMET_DESIGNS, defaultStyle, type CarStyle } from '../shared/rally.ts';

/** A drawing context that accepts any call (gradients and patterns included). */
function fakeContext(): CanvasRenderingContext2D {
  const handler: ProxyHandler<object> = {
    get(target, key) {
      if (key in target) return (target as Record<string | symbol, unknown>)[key];
      return (..._a: unknown[]) => new Proxy({}, handler);
    },
    set(target, key, v) {
      (target as Record<string | symbol, unknown>)[key] = v;
      return true;
    },
  };
  return new Proxy({}, handler) as CanvasRenderingContext2D;
}

let build: typeof import('./models.ts').carModel;
const tex = new THREE.Texture();

beforeAll(async () => {
  const canvas = (): unknown => {
    const ctx = fakeContext();
    return { width: 0, height: 0, getContext: () => ctx, style: {} };
  };
  vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'canvas' ? canvas() : {}) });
  // three wants a real image for a canvas texture only when it uploads; building never does
  build = (await import('./models.ts')).carModel;
});
afterAll(() => vi.unstubAllGlobals());

const make = (body: (typeof CAR_BODIES)[number], style: CarStyle, quality: 'high' | 'low' = 'high') => build({ body, style, shadowTex: tex, envMap: null, quality });

describe('the styling options on all twenty bodies', () => {
  it('builds every body with the default style', () => {
    for (const body of CAR_BODIES) {
      const m = make(body, defaultStyle());
      expect(m.wheels.length).toBeGreaterThanOrEqual(2);
      m.dispose();
    }
  });

  // One test per body: a single test that builds all twenty bodies with every option blocks the test worker for over a
  // minute on a slow CI runner, long enough for vitest's worker RPC to time out.
  it.each([...CAR_BODIES])('builds the %s with every single option', (body) => {
    {
      const one = (patch: Partial<CarStyle>): void => {
        const m = make(body, { ...defaultStyle(), ...patch }, 'low');
        expect(m.root.children.length).toBeGreaterThan(0);
        m.dispose();
      };
      for (const finish of CAR_FINISHES) one({ finish });
      for (const livery of CAR_LIVERIES) one({ livery });
      for (const wheels of CAR_WHEELS) one({ wheels });
      for (const spoiler of CAR_SPOILERS) one({ spoiler });
      for (const e of CAR_EXTRAS) one({ extras: [e] });
      for (const smoke of CAR_SMOKES) one({ smoke });
      for (const helmet of HELMET_DESIGNS) one({ helmet, helmetColor: '#d63aa5' });
      for (const d of CAR_DECALS) one({ decals: { hood: d, roof: d, doors: d, back: d } });
      one({ decals: {} });
      one({ glow: '#19e3ff', plate: 'KALLE 7', number: 99, paint: '#123456', paint2: '#abcdef', rimColor: '#ff00aa' });
    }
  }, 60_000);

  it('builds every body with all the extras at once, with the biggest spoiler, in low quality too', () => {
    for (const body of CAR_BODIES)
      for (const quality of ['high', 'low'] as const) {
        const m = make(body, { ...defaultStyle(), extras: [...CAR_EXTRAS], spoiler: 'wing', livery: 'hazard', wheels: 'gold' }, quality);
        m.dispose();
      }
  });

  it('every decal slot exists on every body', () => {
    for (const body of CAR_BODIES) {
      const m = make(body, defaultStyle());
      for (const slot of DECAL_SLOTS) expect(m.slots[slot]).toBeInstanceOf(THREE.Vector3);
      m.dispose();
    }
  });
});
