// The derby arena as a place: a dirt floor with tyre marks, a solid island in the middle with a pile of crushed cars and
// a floodlight mast, a wall of painted tyre stacks along both fences, three tiers of concrete stands with a cheering crowd
// that hops when the player is near, sponsor boards on the front of the stands, floodlight towers with light pools and
// (at dusk and night) beams, and the ramps. The physics only needs the Track (arena.ts); everything here is for the eyes.
import * as THREE from 'three';
import { Geo, blobTex, canvasTex } from './geo.ts';
import type { ArenaCourse } from './arena.ts';
import { outlineMesh } from './look.ts';
import { buildRampMeshes, type RampMeshes } from './rampmesh.ts';
import type { Track } from './track.ts';
import { rng } from './util.ts';

export interface ArenaWorld {
  group: THREE.Group;
  /** Spots where the crowd stands, for the cheering sound. */
  crowds: THREE.Vector3[];
  /** Animate: the crowd hops when `cheer` is up, the lamps and signs glow. */
  update(time: number, cheer: number, focus: THREE.Vector3): void;
  dispose(): void;
}

interface P {
  x: number;
  z: number;
}

const BRANDS = [
  { t: 'RIVNINGSDERBY', bg: '#d8321f', fg: '#fff3d6' },
  { t: 'KAOSBENSIN', bg: '#ffcf1f', fg: '#15171c' },
  { t: 'DÄCK & DUNDER', bg: '#15171c', fg: '#ff7a1a' },
  { t: 'SKROTFIX', bg: '#2a6fe0', fg: '#f6f1e6' },
  { t: 'KORVTURBO', bg: '#f4eadb', fg: '#c1281c' },
  { t: 'MACKENS KIOSK', bg: '#18a89a', fg: '#15171c' },
];

function bannerTex(): THREE.CanvasTexture {
  const W = 256;
  return canvasTex(
    W * BRANDS.length,
    96,
    (g, w, h) => {
      BRANDS.forEach((b, i) => {
        g.save();
        g.translate(i * W, 0);
        g.fillStyle = b.bg;
        g.fillRect(0, 0, W, h);
        g.fillStyle = 'rgba(0,0,0,0.22)';
        for (let k = -10; k < W + 10; k += 22) {
          g.beginPath();
          g.moveTo(k, 0);
          g.lineTo(k + 11, 0);
          g.lineTo(k - 1, 9);
          g.lineTo(k - 12, 9);
          g.fill();
        }
        g.fillStyle = b.fg;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `900 ${b.t.length > 11 ? 38 : 48}px Impact, 'Arial Black', system-ui, sans-serif`;
        g.fillText(b.t, W / 2, h / 2 + 4, W - 20);
        g.restore();
      });
    },
    true,
  );
}

function floorTex(): THREE.CanvasTexture {
  return canvasTex(
    512,
    512,
    (g, w, h) => {
      const r = rng(41);
      g.fillStyle = '#6a5a44';
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 14000; k++) {
        const t = r();
        g.fillStyle = t < 0.4 ? '#7d6c52' : t < 0.75 ? '#574a38' : '#8a785a';
        const s = 1 + r() * 2.4;
        g.fillRect(r() * w, r() * h, s, s);
      }
      // old tyre marks: long dark curves, and a few pale patches of dust
      g.globalAlpha = 0.2;
      g.strokeStyle = '#1c1812';
      g.lineWidth = 3;
      for (let k = 0; k < 20; k++) {
        const x = r() * w;
        const y = r() * h;
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + 60 + r() * 80, y + r() * 60, x + 120 + r() * 90, y + 20 + r() * 100, x + 200 + r() * 90, y + 40 + r() * 120);
        g.stroke();
      }
      g.globalAlpha = 0.16;
      g.fillStyle = '#d8c8a0';
      for (let k = 0; k < 8; k++) g.fillRect(r() * w, r() * h, 40 + r() * 80, 20 + r() * 50);
      g.globalAlpha = 1;
    },
    true,
  );
}

export function buildArenaWorld(ac: ArenaCourse, track: Track, quality: 'high' | 'low', night: boolean): ArenaWorld {
  const high = quality === 'high';
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => (disposables.push(x), x);
  const r = rng(ac.def.ctrl.length * 977 + Math.round(ac.shape.a));
  const n = track.n;
  const { cx, cz } = ac;

  // ---- which side of the ring is the island ----
  const wallAt = (i: number, sign: number): number => (sign > 0 ? track.wallL[i]! : track.wallR[i]!);
  const innerSign = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * track.ds;
    const a = track.point(s, wallAt(i, 1));
    const b = track.point(s, -wallAt(i, -1));
    innerSign[i] = Math.hypot(a.x - cx, a.z - cz) < Math.hypot(b.x - cx, b.z - cz) ? 1 : -1;
  }
  /** The ring of points `off` metres beyond the fence on the island's side (inner) or the stands' side (outer). */
  const ring = (inner: boolean, off: number): P[] => {
    const out: P[] = [];
    for (let i = 0; i < n; i++) {
      const sg = inner ? innerSign[i]! : -innerSign[i]!;
      const w = wallAt(i, sg);
      // beyond the fence is further from the centre line on the outer side, and nearer to it (inwards) on the island's: off > 0 always means "away from the floor"
      const p = track.point(i * track.ds, sg * (w + off));
      out.push({ x: p.x, z: p.z });
    }
    return out;
  };

  // ---- a strip between two rings (closed), from height ya to height yb ----
  const strip = (A: P[], ya: number, B: P[], yb: number, color: (i: number) => THREE.Color, uPer = 0): THREE.BufferGeometry => {
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const c = color(i);
      const quad = [
        [A[i]!, ya, 0, 0],
        [A[j]!, ya, 1, 0],
        [B[j]!, yb, 1, 1],
        [B[i]!, yb, 0, 1],
      ] as const;
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const q = quad[k]!;
        pos.push(q[0].x, q[1], q[0].z);
        col.push(c.r, c.g, c.b);
        const u = uPer > 0 ? ((i + q[2]) * track.ds) / uPer : q[2];
        uv.push(u, q[3]);
      }
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const flat = (hex: string) => {
    const c = new THREE.Color(hex);
    return () => c;
  };

  // ---- the ground outside everything, and the floor ----
  const outside = new THREE.Mesh(keep(new THREE.PlaneGeometry(3200, 3200)), keep(new THREE.MeshLambertMaterial({ color: '#1d1c24' })));
  outside.rotation.x = -Math.PI / 2;
  outside.position.set(cx, -0.12, cz);
  group.add(outside);

  {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const K = 12;
    for (let i = 0; i <= n; i++) {
      const ii = i % n;
      const s = ii * track.ds;
      for (let k = 0; k <= K; k++) {
        const d = -track.wallR[ii]! + ((track.wallR[ii]! + track.wallL[ii]!) * k) / K;
        const p = track.point(s, d);
        pos.push(p.x, 0.03, p.z);
        uv.push((i * track.ds) / 14, k / K);
      }
    }
    for (let i = 0; i < n; i++)
      for (let k = 0; k < K; k++) {
        const a = i * (K + 1) + k;
        const b = (i + 1) * (K + 1) + k;
        idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // wound so that it faces up whichever way round the ring goes
    const nrm = g.getAttribute('normal');
    if (nrm.getY(0) < 0) {
      const index = g.getIndex()!;
      for (let t = 0; t < index.count; t += 3) {
        const a = index.getX(t + 1);
        index.setX(t + 1, index.getX(t + 2));
        index.setX(t + 2, a);
      }
      g.computeVertexNormals();
    }
    const tex = keep(floorTex());
    const mesh = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })));
    mesh.receiveShadow = high;
    group.add(mesh);
  }

  const solid = new Geo();
  const lamps = new Geo();

  // ---- the island: a low platform with the pile of scrap and the mast ----
  const IH = 1.5;
  const edge = ring(true, 0);
  {
    const pos: number[] = [];
    const col: number[] = [];
    const top = new THREE.Color('#8e8e9c');
    const side = new THREE.Color('#5a5a68');
    const put = (x: number, y: number, z: number, c: THREE.Color): void => {
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b);
    };
    // does the fan (centre, edge[0], edge[1]) face up?
    const A = { x: cx, z: cz };
    const B = edge[0]!;
    const C = edge[1]!;
    const up = (B.z - A.z) * (C.x - A.x) - (B.x - A.x) * (C.z - A.z) > 0;
    for (let i = 0; i < n; i++) {
      const a = edge[i]!;
      const b = edge[(i + 1) % n]!;
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const q = [[a, 0], [b, 0], [b, IH], [a, IH]][k] as [P, number];
        put(q[0].x, q[1], q[0].z, side);
      }
      const tri = up ? [{ x: cx, z: cz }, a, b] : [{ x: cx, z: cz }, b, a];
      for (const p of tri) put(p.x, IH, p.z, top);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
    group.add(mesh);
  }
  // a hazard-striped rim round the top of the island, so the edge reads from far off
  {
    const rimA = ring(true, 0);
    const rimB = ring(true, 1.4);
    const yel = new THREE.Color('#ffcf1f');
    const blk = new THREE.Color('#26262c');
    const g = strip(rimA, IH + 0.03, rimB, IH + 0.03, (i) => (Math.floor(i / 3) % 2 ? yel : blk));
    const m = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    m.frustumCulled = false;
    group.add(m);
  }
  // a pile of crushed cars and a mast of floodlights on the island
  const crushed = (x: number, y: number, z: number, rot: number, tilt: number, c: string): void => {
    solid.box(1.9, 0.75, 4.3, c, x, y + 0.4, z, tilt * 0.2, rot, tilt);
    solid.box(1.6, 0.6, 2.1, '#16181d', x, y + 1.05, z, tilt * 0.2, rot, tilt);
  };
  const pileCols = ['#8a8a92', '#6a6a72', '#a0472f', '#4a5a7a', '#8a7a3a', '#5a6a4a'];
  const piles = ac.id === 'bowl' ? [[0, 0, 4.2]] : [[-34, 0, 5], [0, 0, 5.5], [34, 0, 5]];
  const mastAt: P[] = [];
  for (const [ox, oz, rad] of piles as number[][]) {
    const px = cx + ox!;
    const pz = cz + oz!;
    mastAt.push({ x: px, z: pz });
    const count = high ? 9 : 5;
    for (let k = 0; k < count; k++) {
      const a = r() * 6.28;
      const rr = k < 2 ? 0 : rad! * (0.35 + r() * 0.5);
      const lvl = k < 2 ? k : Math.floor(r() * 2);
      crushed(px + Math.cos(a) * rr, IH + lvl * 1.35, pz + Math.sin(a) * rr, r() * 6.28, (r() - 0.5) * 0.35, pileCols[k % pileCols.length]!);
    }
    // the mast, with a ring of floodlights at the top
    const H = 17;
    solid.cyl(0.22, 0.34, H, 7, '#3a3d44', px, IH + H / 2, pz);
    solid.cyl(1.9, 1.9, 0.35, 10, '#26262a', px, IH + H, pz);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      lamps.box(0.9, 0.55, 0.12, '#ffffff', px + Math.cos(a) * 2.05, IH + H + 0.2, pz + Math.sin(a) * 2.05, 0, -a + Math.PI / 2, 0);
    }
  }

  // light on the island too: a pool under each mast
  const islandPool = keep(new THREE.MeshBasicMaterial({ map: keep(blobTex(128, 0.05)), color: new THREE.Color(ac.paint.flood).multiplyScalar(night ? 0.55 : 0.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  for (const m of mastAt) {
    const pool = new THREE.Mesh(keep(new THREE.PlaneGeometry(46, 46)), islandPool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(m.x, IH + 0.08, m.z);
    pool.renderOrder = 2;
    group.add(pool);
  }

  // ---- tyre walls on both fences ----
  const tyreGeo = (() => {
    const g = new Geo();
    for (let k = 0; k < 3; k++) {
      const shade = k === 1 ? 0.8 : 1;
      g.cyl(0.45, 0.45, 0.29, 7, new THREE.Color(0.2 * shade, 0.2 * shade, 0.22 * shade), 0, 0.145 + k * 0.29, 0);
    }
    g.cyl(0.2, 0.2, 0.03, 6, '#0a0a0c', 0, 0.9, 0);
    return keep(g.build());
  })();
  const stacks: { x: number; z: number; rot: number; tint: THREE.Color }[] = [];
  const white = new THREE.Color('#f2efe6');
  const accent = new THREE.Color(ac.paint.band);
  const black = new THREE.Color('#ffffff');
  for (const inner of [true, false]) {
    for (let row = 0; row < (high ? 2 : 1); row++) {
      for (let s = row * 0.5; s < track.length; s += 1.0) {
        const i = Math.floor(s / track.ds) % n;
        const sg = inner ? innerSign[i]! : -innerSign[i]!;
        const p = track.point(s, sg * (wallAt(i, sg) + 0.5 + row * 0.9));
        const k = Math.floor(s);
        // painted: every sixth stack white, every seventh the evening's colour
        const tint = k % 7 === 3 ? accent : k % 6 === 1 ? white : black;
        stacks.push({ x: p.x, z: p.z, rot: r() * 3, tint });
      }
    }
  }
  {
    const mesh = new THREE.InstancedMesh(tyreGeo, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })), stacks.length);
    const m = new THREE.Matrix4();
    stacks.forEach((t, i) => {
      m.makeRotationY(t.rot);
      m.setPosition(t.x, 0, t.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, t.tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---- the stands: three tiers behind the outer fence ----
  const tierD = [3.4, 6.0, 8.6, 11.2];
  const tierY = [2.1, 3.7, 5.3];
  const outer = tierD.map((d) => ring(false, d));
  const concrete = new THREE.Color('#686874');
  const riserC = new THREE.Color('#4c4c58');
  const treadGeos: THREE.BufferGeometry[] = [];
  treadGeos.push(strip(outer[0]!, 0, outer[0]!, tierY[0]!, () => riserC));
  for (let k = 0; k < 3; k++) {
    treadGeos.push(strip(outer[k]!, tierY[k]!, outer[k + 1]!, tierY[k]!, () => concrete));
    if (k < 2) treadGeos.push(strip(outer[k + 1]!, tierY[k]!, outer[k + 1]!, tierY[k + 1]!, () => riserC));
  }
  treadGeos.push(strip(outer[3]!, tierY[2]!, outer[3]!, tierY[2]! + 3, () => riserC));
  {
    const mat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    for (const g of treadGeos) {
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    // the sponsor boards on the front of the stands
    const front = strip(ring(false, 3.3), 0.05, ring(false, 3.3), tierY[0]! - 0.1, flat('#ffffff'), 3 * 18);
    const banner = new THREE.Mesh(front, keep(new THREE.MeshLambertMaterial({ map: keep(bannerTex()), side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveIntensity: night ? 0.5 : 0.1 })));
    (banner.material as THREE.MeshLambertMaterial).emissiveMap = (banner.material as THREE.MeshLambertMaterial).map;
    // the texture holds six boards: scale u so three show per 54 m, and run it so it reads left to right from the floor
    const uvs = front.getAttribute('uv');
    const o0 = outer[0]![0]!;
    const o1 = outer[0]![1]!;
    const out = { x: o0.x - cx, z: o0.z - cz };
    const ol = Math.hypot(out.x, out.z) || 1;
    // an inside viewer looking outwards has `right` = (−fz, fx); is the ring's direction of travel towards it?
    const tx = o1.x - o0.x;
    const tz = o1.z - o0.z;
    const flipU = (tx * (-out.z / ol) + tz * (out.x / ol) < 0) ? -1 : 1;
    for (let i = 0; i < uvs.count; i++) uvs.setX(i, uvs.getX(i) * 2 * flipU);
    banner.frustumCulled = false;
    group.add(banner);
  }

  // ---- the crowd ----
  const crowd: { x: number; y: number; z: number; rot: number; shirt: THREE.Color; skin: THREE.Color }[] = [];
  const shirts = ac.paint.crowd.map((c) => new THREE.Color(c));
  const skins = ['#f2c9a0', '#e0a878', '#b9855a', '#8a5a3a', '#f6d6b8'].map((c) => new THREE.Color(c));
  const crowds: THREE.Vector3[] = [];
  const stepCrowd = high ? 1.35 : 2.4;
  for (let k = 0; k < 3; k++) {
    for (let row = 0; row < (high ? 2 : 1); row++) {
      for (let s = r() * 2; s < track.length; s += stepCrowd) {
        const i = Math.floor(s / track.ds) % n;
        const sg = -innerSign[i]!;
        const d = (tierD[k]! + (tierD[k + 1]! - tierD[k]!) * (row === 0 ? 0.35 : 0.75)) + wallAt(i, sg);
        const p = track.point(s, sg * d);
        crowd.push({ x: p.x + (r() - 0.5) * 0.4, y: tierY[k]!, z: p.z + (r() - 0.5) * 0.4, rot: Math.atan2(cx - p.x, cz - p.z) + (r() - 0.5) * 0.5, shirt: shirts[Math.floor(r() * shirts.length)]!, skin: skins[Math.floor(r() * skins.length)]! });
        if (k === 1 && row === 0 && Math.floor(s) % 36 < stepCrowd) crowds.push(new THREE.Vector3(p.x, tierY[k]!, p.z));
      }
    }
  }
  const uTime = { value: 0 };
  const uCheer = { value: 0.25 };
  const hop = (m: THREE.MeshLambertMaterial): void => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.uniforms.uCheer = uCheer;
      sh.vertexShader =
        'uniform float uTime;\nuniform float uCheer;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          `vec3 transformed = position;
           #ifdef USE_INSTANCING
           float hp = abs(sin(uTime * 6.5 + instanceMatrix[3][0] * 0.83 + instanceMatrix[3][2] * 1.71));
           transformed.y += hp * uCheer * 0.38;
           #endif`,
        );
    };
  };
  {
    const bodyG = keep(new THREE.CylinderGeometry(0.32, 0.38, 0.8, 6));
    bodyG.translate(0, 0.4, 0);
    const headG = keep(new THREE.IcosahedronGeometry(0.24, 0));
    headG.translate(0, 1.05, 0);
    const bm = keep(new THREE.MeshLambertMaterial({ flatShading: true }));
    const hm = keep(new THREE.MeshLambertMaterial({ flatShading: true }));
    hop(bm);
    hop(hm);
    const bodies = new THREE.InstancedMesh(bodyG, bm, crowd.length);
    const heads = new THREE.InstancedMesh(headG, hm, crowd.length);
    const m = new THREE.Matrix4();
    crowd.forEach((c, i) => {
      m.makeRotationY(c.rot);
      m.setPosition(c.x, c.y, c.z);
      bodies.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
      bodies.setColorAt(i, c.shirt);
      heads.setColorAt(i, c.skin);
    });
    for (const mesh of [bodies, heads]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
    }
  }

  // ---- floodlight towers behind the stands, with pools of light on the floor and (at dusk) beams ----
  const towers = high ? 10 : 6;
  const poolTex = keep(blobTex(128, 0.05));
  const poolMat = keep(new THREE.MeshBasicMaterial({ map: poolTex, color: new THREE.Color(ac.paint.flood).multiplyScalar(night ? 0.5 : 0.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  const beams: THREE.Mesh[] = [];
  const beamMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(ac.paint.flood), transparent: true, opacity: night ? 0.022 : 0.012, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  for (let t = 0; t < towers; t++) {
    const s = ((t + 0.5) / towers) * track.length;
    const i = Math.floor(s / track.ds) % n;
    const sg = -innerSign[i]!;
    const base = track.point(s, sg * (wallAt(i, sg) + tierD[3]! + 3));
    const H = 24;
    solid.cyl(0.3, 0.5, H, 7, '#3a3d44', base.x, H / 2 - 0.2, base.z);
    solid.box(7, 0.4, 0.5, '#26262a', base.x, H, base.z, 0, Math.atan2(cx - base.x, cz - base.z) + Math.PI / 2, 0);
    const face = Math.atan2(cx - base.x, cz - base.z);
    const lampPos: THREE.Vector3[] = [];
    for (const dx of [-2.6, -1.3, 0, 1.3, 2.6]) {
      const lx = base.x + Math.cos(face) * dx + Math.sin(face) * 0.4;
      const lz = base.z - Math.sin(face) * dx + Math.cos(face) * 0.4;
      solid.box(1.1, 0.8, 0.5, '#1c1d22', lx, H + 0.55, lz, 0, face, 0);
      lamps.box(0.95, 0.65, 0.06, '#ffffff', lx + Math.sin(face) * 0.3, H + 0.55, lz + Math.cos(face) * 0.3, 0, face, 0);
      lampPos.push(new THREE.Vector3(lx, H + 0.5, lz));
    }
    // the pool of light: on the floor, a third of the way in from the stands
    const aim = track.point(s, sg * (wallAt(i, sg) * -0.3));
    const pool = new THREE.Mesh(keep(new THREE.PlaneGeometry(64, 64)), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(aim.x, 0.06, aim.z);
    pool.renderOrder = 2;
    group.add(pool);
    if (high && night) {
      const c0 = lampPos[2]!;
      const dir = new THREE.Vector3(aim.x - c0.x, -c0.y, aim.z - c0.z);
      const len = dir.length();
      const cone = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.8, 16, len, 14, 1, true)), beamMat);
      cone.position.set((c0.x + aim.x) / 2, c0.y / 2, (c0.z + aim.z) / 2);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
      cone.renderOrder = 3;
      group.add(cone);
      beams.push(cone);
    }
  }

  // ---- the solid bits, merged (with the outline) and the glowing bits ----
  const solidGeo = keep(solid.build());
  const solidMesh = new THREE.Mesh(solidGeo, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  solidMesh.frustumCulled = false;
  solidMesh.castShadow = high;
  group.add(solidMesh);
  const hull = outlineMesh(solidMesh, high, '#0b0a10', 1.5);
  if (hull) keep(hull.geo);
  const lampMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(night ? 3.6 : 2.2, night ? 3.4 : 2.1, night ? 2.8 : 1.8) }));
  const lampMesh = new THREE.Mesh(keep(lamps.build()), lampMat);
  lampMesh.frustumCulled = false;
  group.add(lampMesh);

  // ---- the ramps ----
  const ramps: RampMeshes = buildRampMeshes(track, ac.ramps, quality);
  group.add(ramps.group);
  disposables.push(ramps);

  return {
    group,
    crowds,
    update(time, cheer, focus) {
      uTime.value = time;
      uCheer.value = Math.min(1, 0.25 + cheer * 0.75);
      void focus;
      ramps.update(time);
      lampMat.color.setScalar((night ? 3.2 : 2) * (0.96 + 0.04 * Math.sin(time * 23)));
      for (const b of beams) void b;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
