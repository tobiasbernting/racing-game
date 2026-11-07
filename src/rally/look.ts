// The look of the game, shared by every model and course: a colour grade per course, a post pass (grade,
// vignette, grain and, on 'high', a soft bloom), and the toon-ish outline (an inverted hull drawn a few
// pixels wide) that cars, drivers and key props wear. Phase 10's new vehicles use `outlineMesh` and the
// helpers in models.ts and get the same look for free.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Colour grades
// ---------------------------------------------------------------------------

/** A grade is applied to the finished picture (display space): split toning, saturation, contrast, vignette, grain. */
export interface Grade {
  /** Colour multiplier in the shadows and in the highlights (1 = untouched). */
  shadow: [number, number, number];
  high: [number, number, number];
  /** 1 = as rendered; below drains the pastels. */
  sat: number;
  /** 0..1: how hard the S-curve bites (deeper shadows, brighter lights). */
  punch: number;
  vignette: number;
  grain: number;
  /** Bloom strength on 'high' (0 = none). */
  bloom: number;
  /** Multiplies the course's exposure (a bright pastel course is brought down). */
  exp: number;
}

const G = (shadow: [number, number, number], high: [number, number, number], sat: number, punch: number, vignette = 0.42, grain = 0.035, bloom = 0.32, exp = 1): Grade => ({ shadow, high, sat, punch, vignette, grain, bloom, exp });

/** One grade per course: warmer or colder, never pastel. */
export const GRADES: Record<string, Grade> = {
  farm: G([0.9, 0.97, 1.06], [1.07, 1.0, 0.9], 0.8, 0.55),
  forest: G([0.88, 1.0, 1.02], [1.0, 1.04, 0.9], 0.74, 0.6, 0.5),
  ice: G([0.86, 0.96, 1.12], [0.96, 1.02, 1.1], 0.7, 0.55, 0.42, 0.035, 0.32, 0.9),
  beach: G([0.94, 0.96, 1.04], [1.1, 1.02, 0.88], 0.82, 0.55, 0.38, 0.035, 0.32, 0.92),
  city: G([0.9, 0.95, 1.08], [1.06, 1.0, 0.9], 0.72, 0.68, 0.5),
  meadow: G([0.92, 0.98, 1.04], [1.06, 1.02, 0.92], 0.76, 0.52),
  mountain: G([0.88, 0.95, 1.1], [1.02, 1.0, 0.94], 0.74, 0.58),
  desert: G([0.98, 0.9, 0.9], [1.14, 1.02, 0.8], 0.84, 0.6, 0.46),
  volcano: G([1.0, 0.9, 0.92], [1.06, 0.98, 0.92], 0.8, 0.55, 0.5, 0.04, 0.4, 1.25),
  candy: G([1.0, 0.88, 1.0], [1.08, 0.98, 0.9], 0.62, 0.6, 0.48, 0.04, 0.32, 0.9),
  moon: G([0.86, 0.92, 1.16], [0.98, 1.0, 1.08], 0.6, 0.78, 0.55),
  kitchen: G([1.0, 0.92, 0.82], [1.08, 1.02, 0.86], 0.64, 0.66, 0.52, 0.04, 0.32, 0.9),
};
const DEFAULT_GRADE = GRADES.farm!;

/** The grade for a course at a time of day (night is colder and darker, rain greyer). */
export function gradeFor(course: string, night: boolean, rain: boolean): Grade {
  const g = GRADES[course] ?? DEFAULT_GRADE;
  const out: Grade = { ...g, shadow: [...g.shadow], high: [...g.high] };
  if (night) {
    out.shadow = [out.shadow[0] * 0.9, out.shadow[1] * 0.96, out.shadow[2] * 1.08];
    out.sat *= 0.9;
    out.vignette += 0.08;
    out.bloom *= 1.5;
  }
  if (rain) {
    out.sat *= 0.82;
    out.punch *= 0.9;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The post pass
// ---------------------------------------------------------------------------

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + 0.9, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
  c += texture2D(tSrc, vUv + uDir * 1.3846154).rgb * 0.3162162 + texture2D(tSrc, vUv - uDir * 1.3846154).rgb * 0.3162162;
  c += texture2D(tSrc, vUv + uDir * 3.2307692).rgb * 0.0702703 + texture2D(tSrc, vUv - uDir * 3.2307692).rgb * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform vec3 uShadow;
uniform vec3 uHigh;
uniform float uSat;
uniform float uPunch;
uniform float uVig;
uniform float uGrain;
uniform float uTime;
uniform vec2 uRes;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  if (uBloom > 0.0) c += texture2D(tBloom, vUv).rgb * uBloom;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  c = gl_FragColor.rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // split toning: the shadows lean one way, the lights the other
  c *= mix(uShadow, uHigh, smoothstep(0.05, 0.85, l));
  l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  // an S-curve: deeper shadows, cleaner lights
  vec3 s = c * c * (3.0 - 2.0 * c);
  c = mix(c, s, uPunch);
  // vignette
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y * 0.7;
  c *= 1.0 - uVig * smoothstep(0.18, 0.78, length(q));
  c += (hash(vUv * uRes + uTime) - 0.5) * uGrain;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/**
 * Renders the scene into a half-float target and then through the grade (and the bloom on 'high').
 * Returns null from `makePost` when the device cannot render to half floats: the game then draws straight to
 * the screen and the page lays a plain vignette over the canvas.
 */
export class Post {
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly b1: THREE.WebGLRenderTarget | null;
  private readonly b2: THREE.WebGLRenderTarget | null;
  private readonly quad: THREE.Mesh;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly bright: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly final: THREE.ShaderMaterial;
  private bloomOn: boolean;
  private bloomK = 0;
  private w = 1;
  private h = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    high: boolean,
    grade: Grade,
    msaa: boolean,
  ) {
    this.bloomOn = high && grade.bloom > 0;
    this.bloomK = grade.bloom;
    const opts = { type: THREE.HalfFloatType, depthBuffer: true, samples: msaa ? 4 : 0, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rt = new THREE.WebGLRenderTarget(4, 4, opts);
    const small = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.b1 = high ? new THREE.WebGLRenderTarget(4, 4, small) : null;
    this.b2 = high ? new THREE.WebGLRenderTarget(4, 4, small) : null;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial => new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
    this.bright = mk(BRIGHT_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.25 } });
    this.blur = mk(BLUR_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.final = mk(FINAL_FRAG, {
      tScene: { value: this.rt.texture },
      tBloom: { value: this.b1?.texture ?? null },
      uBloom: { value: this.bloomOn ? this.bloomK : 0 },
      uShadow: { value: new THREE.Vector3(...grade.shadow) },
      uHigh: { value: new THREE.Vector3(...grade.high) },
      uSat: { value: grade.sat },
      uPunch: { value: grade.punch },
      uVig: { value: grade.vignette },
      uGrain: { value: grade.grain },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
    });
    this.final.toneMapped = true;
    this.quad = new THREE.Mesh(tri, this.final);
    this.quad.frustumCulled = false;
  }

  /** Match the drawing buffer (call after every setSize / setPixelRatio). */
  resize(): void {
    const v = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.w = Math.max(2, Math.round(v.x));
    this.h = Math.max(2, Math.round(v.y));
    this.rt.setSize(this.w, this.h);
    const bw = Math.max(2, Math.round(this.w / 4));
    const bh = Math.max(2, Math.round(this.h / 4));
    this.b1?.setSize(bw, bh);
    this.b2?.setSize(bw, bh);
    (this.final.uniforms.uRes!.value as THREE.Vector2).set(this.w, this.h);
  }

  /** A slow machine drops the bloom first. */
  setBloom(on: boolean): void {
    this.bloomOn = on && !!this.b1 && this.bloomK > 0;
    this.final.uniforms.uBloom!.value = this.bloomOn ? this.bloomK : 0;
  }

  private pass(mat: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(to);
    this.renderer.render(this.quad, this.cam);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    if (this.bloomOn && this.b1 && this.b2) {
      this.bright.uniforms.tSrc!.value = this.rt.texture;
      (this.bright.uniforms.uTexel!.value as THREE.Vector2).set(1 / this.w, 1 / this.h);
      this.pass(this.bright, this.b1);
      const bw = this.b1.width;
      const bh = this.b1.height;
      this.blur.uniforms.tSrc!.value = this.b1.texture;
      (this.blur.uniforms.uDir!.value as THREE.Vector2).set(1 / bw, 0);
      this.pass(this.blur, this.b2);
      this.blur.uniforms.tSrc!.value = this.b2.texture;
      (this.blur.uniforms.uDir!.value as THREE.Vector2).set(0, 1 / bh);
      this.pass(this.blur, this.b1);
    }
    this.final.uniforms.uTime!.value = time % 10;
    this.pass(this.final, null);
  }

  dispose(): void {
    this.rt.dispose();
    this.b1?.dispose();
    this.b2?.dispose();
    this.quad.geometry.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.final.dispose();
  }
}

/** True when the device can render into half-float targets (nearly every phone since 2020). */
export function canPost(renderer: THREE.WebGLRenderer): boolean {
  const ex = renderer.extensions;
  return renderer.capabilities.isWebGL2 && (ex.has('EXT_color_buffer_float') || ex.has('EXT_color_buffer_half_float'));
}

// ---------------------------------------------------------------------------
// Outlines: an inverted hull, a few pixels wide whatever the distance
// ---------------------------------------------------------------------------

const OUT_VERT = /* glsl */ `
attribute vec3 hullNormal;
uniform vec2 uPx;
uniform float uWidth;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vec4 p = projectionMatrix * mvPosition;
  vec3 n = normalize(normalMatrix * hullNormal);
  vec4 pn = projectionMatrix * vec4(mvPosition.xyz + n, mvPosition.w);
  vec2 d = pn.xy / max(pn.w, 0.001) - p.xy / max(p.w, 0.001);
  float dl = length(d);
  vec2 dir = dl > 0.0001 ? d / dl : vec2(0.0);
  // a little thinner far away, so a distant car is not just a dark blob
  float k = mix(0.55, 1.0, clamp(1.0 - p.w / 90.0, 0.0, 1.0));
  p.xy += dir * uPx * uWidth * k * p.w;
  gl_Position = p;
  #include <fog_vertex>
}`;

const OUT_FRAG = /* glsl */ `
uniform vec3 uColor;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const outlineMats = new Map<string, THREE.ShaderMaterial>();
/** Every outline material, so the race can tell them the screen size. */
const outlineAll = new Set<THREE.ShaderMaterial>();

/** The shared outline material of a colour and width (in pixels). */
export function outlineMaterial(color = '#0b0a10', width = 1.6): THREE.ShaderMaterial {
  const key = `${color}:${width}`;
  let m = outlineMats.get(key);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uPx: { value: new THREE.Vector2(0.001, 0.001) }, uWidth: { value: width } }]),
    vertexShader: OUT_VERT,
    fragmentShader: OUT_FRAG,
    side: THREE.BackSide,
    fog: true,
  });
  outlineMats.set(key, m);
  outlineAll.add(m);
  return m;
}

/** The drawing buffer is `w` x `h` pixels: outlines keep their pixel width. Call on every resize. */
export function setOutlineScreen(w: number, h: number): void {
  for (const m of outlineAll) (m.uniforms.uPx!.value as THREE.Vector2).set(2 / w, 2 / h);
}

/** A copy of the geometry whose `hullNormal` smooths the corners (vertices at the same spot share one normal). */
export function hullGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const idx = g.index;
  const n = pos.count;
  const key = (i: number): string => `${Math.round(pos.getX(i) * 500)},${Math.round(pos.getY(i) * 500)},${Math.round(pos.getZ(i) * 500)}`;
  const acc = new Map<string, [number, number, number]>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const f = new THREE.Vector3();
  const tris = idx ? idx.count / 3 : n / 3;
  const at = (t: number, k: number): number => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  for (let t = 0; t < tris; t++) {
    const i0 = at(t, 0);
    const i1 = at(t, 1);
    const i2 = at(t, 2);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    f.subVectors(c, b).cross(a.sub(b)); // area weighted
    for (const i of [i0, i1, i2]) {
      const k = key(i);
      const s = acc.get(k);
      if (s) {
        s[0] += f.x;
        s[1] += f.y;
        s[2] += f.z;
      } else acc.set(k, [f.x, f.y, f.z]);
    }
  }
  const hn = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = acc.get(key(i))!;
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    hn[i * 3] = s[0] / l;
    hn[i * 3 + 1] = s[1] / l;
    hn[i * 3 + 2] = s[2] / l;
  }
  g.setAttribute('hullNormal', new THREE.BufferAttribute(hn, 3));
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'hullNormal') g.deleteAttribute(name);
  return g;
}

/**
 * Adds an outline shell as a child of `mesh` (so it moves, scales and animates with it). Returns the hull, or
 * null when outlines are off. Dispose the returned geometry with the model.
 */
export function outlineMesh(mesh: THREE.Mesh, on: boolean, color?: string, width?: number): { hull: THREE.Mesh; geo: THREE.BufferGeometry } | null {
  if (!on) return null;
  const geo = hullGeometry(mesh.geometry);
  const hull = new THREE.Mesh(geo, outlineMaterial(color, width));
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.renderOrder = mesh.renderOrder;
  mesh.add(hull);
  return { hull, geo };
}

/** Outlines for instanced props (same instance matrices as the source). */
export function outlineInstanced(src: THREE.InstancedMesh, on: boolean, color?: string, width?: number): THREE.InstancedMesh | null {
  if (!on) return null;
  const geo = hullGeometry(src.geometry);
  const hull = new THREE.InstancedMesh(geo, outlineMaterial(color, width), src.count);
  hull.instanceMatrix = src.instanceMatrix;
  hull.frustumCulled = src.frustumCulled;
  hull.castShadow = false;
  hull.receiveShadow = false;
  src.add(hull);
  return hull;
}
