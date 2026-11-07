// Golden hour: a gradient sky with a low warm sun and soft clouds, the sun and sky lights, haze, and a
// reflection map of the sky for the car paint and the water. The other courses and times of day pass
// their own SkyPreset (courses.ts): dusk, a bright beach day, an overcast winter, night with stars.
import * as THREE from 'three';
import type { SkyPreset } from './courses.ts';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uSunCol;
uniform vec3 uCloud;
uniform float uTime;
uniform float uCover;
uniform float uNight;
uniform float uSpace;
uniform vec3 uEarth;
uniform vec3 uEx;
uniform vec3 uEy;
uniform float uEarthR;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float sd = max(dot(d, uSun), 0.0);
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.6, h));
  col = mix(col, uHaze, pow(sd, 3.0) * (1.0 - smoothstep(-0.05, 0.45, h)) * 0.85);
  col += uSunCol * pow(sd, 22.0) * 0.6;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.2 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(uv * 1.7);
    float cov = smoothstep(uCover, uCover + 0.28, c) * smoothstep(0.0, 0.2, h);
    vec3 cc = mix(uCloud, uSunCol * 1.15, pow(sd, 2.5) * 0.7);
    col = mix(col, cc, cov * 0.7);
  }
  col += uSunCol * pow(sd, 350.0) * 1.6;
  col += vec3(1.0, 0.86, 0.62) * smoothstep(0.99925, 0.99965, sd) * 4.0 * (1.0 - uNight);
  float starK = max(uNight, uSpace);
  if (starK > 0.0) {
    // the moon and the stars (hidden by the clouds; in space they are everywhere)
    col += vec3(0.9, 0.93, 1.0) * smoothstep(0.9993, 0.99955, sd) * 2.2 * uNight;
    vec2 g = vec2(atan(d.x, d.z) * 160.0, d.y * 260.0);
    vec2 cell = floor(g);
    float st = hash(cell);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 40.0);
    float star = step(mix(0.985, 0.972, uSpace), st) * smoothstep(0.5, 0.1, length(fract(g) - 0.5)) * mix(smoothstep(0.02, 0.25, h), smoothstep(-0.02, 0.08, h), uSpace);
    col += vec3(0.85, 0.9, 1.0) * star * tw * starK * 1.4;
  }
  if (uSpace > 0.5) {
    // the Earth: a blue ball with continents and clouds, lit from the sun's side
    float ed = dot(d, uEarth);
    if (ed > 0.0) {
      vec2 q = vec2(dot(d, uEx), dot(d, uEy)) / (ed * uEarthR);
      float r = length(q);
      col += vec3(0.2, 0.45, 1.0) * smoothstep(1.5, 1.0, r) * 0.12;
      if (r < 1.0) {
        vec3 n = vec3(q, sqrt(1.0 - r * r));
        float c1 = fbm(n.xy * 2.4 + n.z * 1.7 + 3.0);
        float land = smoothstep(0.5, 0.56, c1);
        vec3 surf = mix(vec3(0.05, 0.2, 0.62), mix(vec3(0.16, 0.42, 0.16), vec3(0.6, 0.5, 0.3), smoothstep(0.58, 0.72, c1)), land);
        float cl = smoothstep(0.52, 0.72, fbm(n.xy * 3.6 - n.z * 2.0 + 9.0));
        surf = mix(surf, vec3(0.95), cl * 0.85);
        vec3 L = normalize(vec3(dot(uSun, uEx), dot(uSun, uEy), dot(uSun, uEarth)));
        float lit = clamp(dot(n, L), 0.0, 1.0);
        vec3 ec = surf * (0.1 + 1.1 * lit) + vec3(0.25, 0.5, 1.0) * pow(1.0 - n.z, 3.0) * 0.6;
        col = mix(col, ec, smoothstep(1.0, 0.96, r));
      }
    }
  }
  col = mix(col, uHorizon, smoothstep(0.0, -0.1, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface Sky {
  mesh: THREE.Mesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sunDir: THREE.Vector3;
  fog: THREE.FogExp2;
  env: THREE.Texture;
  /** Keep the sky round the camera and the sun's shadow box round the player. */
  update(time: number, camera: THREE.Camera, focus: THREE.Vector3): void;
  dispose(): void;
}

/** Rain: a grey, overcast version of a sky. */
export function rainy(p: SkyPreset): SkyPreset {
  const grey = (c: string, k: number): string => '#' + new THREE.Color(c).lerp(new THREE.Color('#7d8590'), k).getHexString();
  return {
    ...p,
    zenith: grey(p.zenith, 0.6),
    horizon: grey(p.horizon, 0.55),
    haze: grey(p.haze, 0.7),
    sunCol: grey(p.sunCol, 0.6),
    cloud: grey(p.cloud, 0.5),
    cover: 0.26,
    sunI: p.sunI * 0.45,
    hemiI: p.hemiI * 0.9,
    fog: p.fog * 1.9,
  };
}

const GOLDEN_DEFAULT: SkyPreset = {
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

export function buildSky(renderer: THREE.WebGLRenderer, quality: 'high' | 'low', p: SkyPreset = GOLDEN_DEFAULT): Sky {
  const elev = THREE.MathUtils.degToRad(p.elev);
  const az = p.az;
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev)).normalize();
  const horizon = new THREE.Color(p.horizon);
  const uniforms = {
    uSun: { value: sunDir.clone() },
    uZenith: { value: new THREE.Color(p.zenith) },
    uHorizon: { value: horizon.clone() },
    uHaze: { value: new THREE.Color(p.haze) },
    uSunCol: { value: new THREE.Color(p.sunCol) },
    uCloud: { value: new THREE.Color(p.cloud) },
    uTime: { value: 0 },
    uCover: { value: p.cover },
    uNight: { value: p.night },
    uSpace: { value: p.earth ? 1 : 0 },
    uEarth: { value: new THREE.Vector3(0, 1, 0) },
    uEx: { value: new THREE.Vector3(1, 0, 0) },
    uEy: { value: new THREE.Vector3(0, 0, 1) },
    uEarthR: { value: p.earth ? p.earth.size : 0.1 },
  };
  if (p.earth) {
    const ee = THREE.MathUtils.degToRad(p.earth.elev);
    const dir = new THREE.Vector3(Math.sin(p.earth.az) * Math.cos(ee), Math.sin(ee), Math.cos(p.earth.az) * Math.cos(ee)).normalize();
    const ex = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    uniforms.uEarth.value.copy(dir);
    uniforms.uEx.value.copy(ex);
    uniforms.uEy.value.copy(new THREE.Vector3().crossVectors(ex, dir).normalize());
  }
  const geo = new THREE.SphereGeometry(100, 40, 20);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  // the sky as a reflection map
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(geo, mat);
  envSky.frustumCulled = false;
  envScene.add(envSky);
  const envRT = pmrem.fromScene(envScene, 0.02, 0.1, 1000);
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(p.sunLight, p.sunI);
  const hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemiI);
  const S = 75;
  if (quality === 'high') {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -S;
    cam.right = S;
    cam.top = S;
    cam.bottom = -S;
    cam.near = 1;
    cam.far = 700;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 2.5;
  }
  const fog = new THREE.FogExp2(horizon.getHex(), p.fog);
  // a basis across the sun's rays, to snap the shadow box to whole texels (no shimmering)
  const right = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, sunDir).normalize();
  const texel = (2 * S) / 2048;
  const f = new THREE.Vector3();
  return {
    mesh,
    sun,
    hemi,
    sunDir,
    fog,
    env: envRT.texture,
    update(time, camera, focus) {
      uniforms.uTime.value = time;
      mesh.position.copy(camera.position);
      const a = Math.round(focus.dot(right) / texel) * texel;
      const b = Math.round(focus.dot(up) / texel) * texel;
      const c = focus.dot(sunDir);
      f.copy(right).multiplyScalar(a).addScaledVector(up, b).addScaledVector(sunDir, c);
      sun.target.position.copy(f);
      sun.position.copy(f).addScaledVector(sunDir, 350);
      sun.target.updateMatrixWorld();
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      envRT.dispose();
      sun.dispose();
      hemi.dispose();
    },
  };
}
