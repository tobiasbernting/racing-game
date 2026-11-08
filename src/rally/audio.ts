// Every sound in the rally, synthesised: the player's engine (pitch follows the revs, dips on gear
// changes), the opponents' engines, tyres, gravel, grass, wind, kerbs, bumps, beeps, cheers, a fanfare
// and a cheerful little music loop.
import { noise as noiseShot, tone } from '../arcade/sfx.ts';
import type { CarBody, CarHorn } from '../shared/rally.ts';
import { settings } from '../settings.ts';
import { clamp } from './util.ts';

interface Voice {
  osc: OscillatorNode[];
  /** Level of each oscillator (the timbre). */
  lvl: GainNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
  /** The tremolo that makes a tractor chug and a moped buzz. */
  trem: GainNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
  /** The engine sound this voice has now. */
  kind: EngineKind;
}

/** What an engine sounds like: the oscillator mix, the pitch, how bright, and a tremolo (the chug or the buzz). */
export type EngineKind = 'car' | 'atv' | 'moto' | 'moped' | 'tractor' | 'sofa' | 'monster' | 'epa' | 'icecream' | 'garbage' | 'snowmobile' | 'kart' | 'golf' | 'mower' | 'camper' | 'limo' | 'cart';
interface EngineProfile {
  types: [OscillatorType, OscillatorType, OscillatorType];
  mul: [number, number, number];
  lvl: [number, number, number];
  pitch: number;
  cut: number;
  q: number;
  /** Tremolo depth 0..1 and its rate: a + rpm·b Hz. */
  chug: number;
  chugA: number;
  chugB: number;
  level: number;
}
const ENGINES: Record<EngineKind, EngineProfile> = {
  car: { types: ['sawtooth', 'square', 'sawtooth'], mul: [1, 0.5, 2.01], lvl: [0.6, 0.45, 0.25], pitch: 1, cut: 1, q: 2.2, chug: 0, chugA: 0, chugB: 0, level: 1 },
  monster: { types: ['sawtooth', 'square', 'square'], mul: [0.8, 0.5, 1.5], lvl: [0.6, 0.55, 0.2], pitch: 0.8, cut: 0.8, q: 2.4, chug: 0.2, chugA: 6, chugB: 0.002, level: 1.1 },
  // the brappy four-wheeler
  atv: { types: ['sawtooth', 'square', 'sawtooth'], mul: [1, 0.5, 1.5], lvl: [0.6, 0.5, 0.3], pitch: 1.25, cut: 1.1, q: 3, chug: 0.25, chugA: 8, chugB: 0.0035, level: 1 },
  // the howling bike
  moto: { types: ['sawtooth', 'sawtooth', 'triangle'], mul: [1, 2, 3.01], lvl: [0.5, 0.35, 0.3], pitch: 1.7, cut: 1.7, q: 3.5, chug: 0, chugA: 0, chugB: 0, level: 0.9 },
  // the moped: thin and buzzing like a hornet in a tin
  moped: { types: ['sawtooth', 'square', 'square'], mul: [1, 2, 4.02], lvl: [0.45, 0.4, 0.35], pitch: 2.6, cut: 2.6, q: 4.5, chug: 0.5, chugA: 30, chugB: 0.005, level: 0.8 },
  // the tractor: low and chugging, put-put-put
  tractor: { types: ['square', 'sawtooth', 'square'], mul: [0.5, 1, 0.25], lvl: [0.7, 0.4, 0.3], pitch: 0.55, cut: 0.5, q: 1.4, chug: 0.65, chugA: 3, chugB: 0.0025, level: 1.3 },
  // the sofa: a wheezy, lumpy purr
  sofa: { types: ['triangle', 'square', 'sawtooth'], mul: [1, 0.5, 2], lvl: [0.6, 0.4, 0.2], pitch: 0.9, cut: 0.8, q: 1.8, chug: 0.3, chugA: 2, chugB: 0.002, level: 1 },
  // the EPA tractor: an old car engine in a bad mood, put-put at a walking pace
  epa: { types: ['square', 'sawtooth', 'triangle'], mul: [0.5, 1, 1.5], lvl: [0.6, 0.4, 0.2], pitch: 0.7, cut: 0.6, q: 1.6, chug: 0.5, chugA: 4, chugB: 0.003, level: 1.2 },
  // the ice-cream van: a warm, humming diesel
  icecream: { types: ['triangle', 'sawtooth', 'sine'], mul: [0.5, 1, 2], lvl: [0.7, 0.3, 0.25], pitch: 0.65, cut: 0.55, q: 1.4, chug: 0.15, chugA: 2, chugB: 0.0015, level: 1.1 },
  // the garbage truck: a deep, grumbling diesel
  garbage: { types: ['sawtooth', 'square', 'sawtooth'], mul: [0.5, 0.25, 1], lvl: [0.6, 0.55, 0.3], pitch: 0.5, cut: 0.45, q: 1.6, chug: 0.35, chugA: 3, chugB: 0.0025, level: 1.4 },
  // the snowmobile: a two-stroke saw
  snowmobile: { types: ['sawtooth', 'sawtooth', 'square'], mul: [1, 1.99, 3], lvl: [0.5, 0.4, 0.25], pitch: 1.9, cut: 2.1, q: 4, chug: 0.2, chugA: 18, chugB: 0.004, level: 0.9 },
  // the kart: a screaming little engine
  kart: { types: ['sawtooth', 'square', 'sawtooth'], mul: [1, 2, 3.02], lvl: [0.5, 0.35, 0.35], pitch: 2.1, cut: 2.3, q: 4.2, chug: 0.1, chugA: 25, chugB: 0.004, level: 0.85 },
  // the golf cart: an electric whine that climbs with the speed
  golf: { types: ['sine', 'triangle', 'sine'], mul: [1, 2, 3], lvl: [0.5, 0.3, 0.25], pitch: 2.3, cut: 3, q: 1.2, chug: 0, chugA: 0, chugB: 0, level: 0.7 },
  // the lawn mower: a single-cylinder chug-chug-chug
  mower: { types: ['square', 'sawtooth', 'square'], mul: [0.5, 1, 2], lvl: [0.65, 0.35, 0.2], pitch: 1.1, cut: 0.9, q: 2, chug: 0.8, chugA: 7, chugB: 0.004, level: 1 },
  // the camper: a tired, low diesel with a rattle
  camper: { types: ['sawtooth', 'square', 'triangle'], mul: [0.5, 0.75, 1.5], lvl: [0.6, 0.45, 0.25], pitch: 0.55, cut: 0.5, q: 1.5, chug: 0.3, chugA: 3, chugB: 0.002, level: 1.3 },
  // the limousine: a smooth, low V8 burble
  limo: { types: ['sawtooth', 'triangle', 'sawtooth'], mul: [0.5, 1, 1.5], lvl: [0.55, 0.5, 0.3], pitch: 0.75, cut: 0.7, q: 2.4, chug: 0.12, chugA: 8, chugB: 0.003, level: 1.1 },
  // the rocket cart: a rough roar that gets wilder with the revs
  cart: { types: ['sawtooth', 'square', 'sawtooth'], mul: [1, 1.5, 0.5], lvl: [0.5, 0.5, 0.45], pitch: 1.4, cut: 1.8, q: 1.4, chug: 0.45, chugA: 14, chugB: 0.006, level: 1.1 },
};

/** Which engine each body has. */
export function engineOf(body: CarBody | undefined): EngineKind {
  switch (body) {
    case 'atv':
    case 'moto':
    case 'moped':
    case 'tractor':
    case 'sofa':
    case 'monster':
    case 'epa':
    case 'icecream':
    case 'garbage':
    case 'snowmobile':
    case 'kart':
    case 'golf':
    case 'mower':
    case 'camper':
    case 'limo':
    case 'cart':
      return body;
    default:
      return 'car';
  }
}

const NOTE = (n: string): number => {
  const m = /^([A-G])(#?)(\d)$/.exec(n)!;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = 12 * (Number(m[3]) + 1) + base[m[1]!]! + (m[2] ? 1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
};

// a bouncy tune in G: eight bars, each eight eighth-notes ('' = hold / rest)
const MELODY: string[][] = [
  ['D5', '', 'B4', '', 'G4', 'A4', 'B4', ''],
  ['A4', '', 'F#4', '', 'D4', 'E4', 'F#4', 'A4'],
  ['G4', '', 'E4', '', 'B4', '', 'G4', ''],
  ['E5', '', 'D5', 'C5', 'B4', '', 'A4', ''],
  ['D5', '', 'B4', 'D5', 'G5', '', 'D5', ''],
  ['F#5', '', 'E5', 'D5', 'A4', '', 'F#4', ''],
  ['E5', 'D5', 'B4', 'G4', 'E4', '', 'G4', 'B4'],
  ['C5', '', 'A4', '', 'D5', '', '', ''],
];
const CHORDS: string[][] = [
  ['G3', 'B3', 'D4'],
  ['D3', 'F#3', 'A3'],
  ['E3', 'G3', 'B3'],
  ['C3', 'E3', 'G3'],
  ['G3', 'B3', 'D4'],
  ['D3', 'F#3', 'A3'],
  ['E3', 'G3', 'B3'],
  ['C3', 'E3', 'G3'],
];
const BASS = ['G2', 'D2', 'E2', 'C2', 'G2', 'D2', 'E2', 'C2'];
const FIFTH = ['D3', 'A2', 'B2', 'G2', 'D3', 'A2', 'B2', 'D3'];

export class RallyAudio {
  private readonly a: AudioContext | null;
  private readonly bus: GainNode | null = null;
  private readonly musicBus: GainNode | null = null;
  private engine: Voice | null = null;
  private intake: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private screech: { gain: GainNode; filter: BiquadFilterNode; osc: OscillatorNode; og: GainNode } | null = null;
  private gravel: { gain: GainNode } | null = null;
  private grass: { gain: GainNode } | null = null;
  private wind: { gain: GainNode } | null = null;
  private kerb: { gain: GainNode; osc: OscillatorNode } | null = null;
  private others: Voice[] = [];
  private sources: AudioScheduledSourceNode[] = [];
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private musicAt = 0;
  private musicLevel = 0.5;
  private paused = false;
  private dip = 1;

  constructor(ctx: AudioContext | null, out: AudioNode | null) {
    this.a = ctx && out ? ctx : null;
    if (!this.a || !out) return;
    const a = this.a;
    this.bus = a.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(out);
    this.musicBus = a.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.bus);
    // a looping noise buffer shared by the noisy sounds
    const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noiseSrc = (): AudioBufferSourceNode => {
      const s = a.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start(0, Math.random() * 1.5);
      this.sources.push(s);
      return s;
    };
    const chain = (src: AudioNode, type: BiquadFilterType, f: number, q: number): { gain: GainNode; filter: BiquadFilterNode } => {
      const filter = a.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = f;
      filter.Q.value = q;
      const gain = a.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.bus!);
      return { gain, filter };
    };
    this.engine = this.voice(0.0);
    this.intake = chain(noiseSrc(), 'bandpass', 300, 1.4);
    const sc = chain(noiseSrc(), 'bandpass', 1500, 7);
    const sOsc = a.createOscillator();
    sOsc.type = 'triangle';
    sOsc.frequency.value = 1150;
    const og = a.createGain();
    og.gain.value = 0;
    sOsc.connect(og).connect(this.bus);
    sOsc.start();
    this.sources.push(sOsc);
    this.screech = { ...sc, osc: sOsc, og };
    this.gravel = chain(noiseSrc(), 'lowpass', 1400, 0.7);
    this.grass = chain(noiseSrc(), 'lowpass', 420, 0.8);
    this.wind = chain(noiseSrc(), 'bandpass', 650, 0.5);
    const kOsc = a.createOscillator();
    kOsc.type = 'square';
    kOsc.frequency.value = 30;
    const kf = a.createBiquadFilter();
    kf.type = 'lowpass';
    kf.frequency.value = 220;
    const kg = a.createGain();
    kg.gain.value = 0;
    kOsc.connect(kf).connect(kg).connect(this.bus);
    kOsc.start();
    this.sources.push(kOsc);
    this.kerb = { gain: kg, osc: kOsc };
    this.others = [this.voice(0), this.voice(0)];
  }

  /** An engine: two saws and a square through a soft clipper and a low-pass. */
  private voice(gain: number): Voice {
    const a = this.a!;
    const g = a.createGain();
    g.gain.value = gain;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 800;
    f.Q.value = 2.2;
    const shaper = a.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    const mix = a.createGain();
    mix.gain.value = 0.45;
    const oscs: OscillatorNode[] = [];
    const lvls: GainNode[] = [];
    for (const [type, mul, lvl] of [
      ['sawtooth', 1, 0.6],
      ['square', 0.5, 0.45],
      ['sawtooth', 2.01, 0.25],
    ] as const) {
      const o = a.createOscillator();
      o.type = type;
      o.frequency.value = 40 * mul;
      const og = a.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(mix);
      lvls.push(og);
      o.start();
      (o as OscillatorNode & { mul?: number }).mul = mul;
      oscs.push(o);
      this.sources.push(o);
    }
    // the tremolo: an LFO on a gain stage after the engine (depth 0 for the plain car)
    const trem = a.createGain();
    trem.gain.value = 1;
    const lfo = a.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 10;
    const lfoDepth = a.createGain();
    lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth).connect(trem.gain);
    lfo.start();
    this.sources.push(lfo);
    mix.connect(shaper).connect(f).connect(g).connect(trem).connect(this.bus!);
    return { osc: oscs, lvl: lvls, gain: g, filter: f, trem, lfo, lfoDepth, kind: 'car' };
  }

  /** Gives a voice another engine's timbre. */
  private dress(v: Voice, kind: EngineKind): void {
    if (v.kind === kind) return;
    v.kind = kind;
    const p = ENGINES[kind];
    const t = this.a!.currentTime;
    v.osc.forEach((o, i) => {
      o.type = p.types[i]!;
      (o as OscillatorNode & { mul?: number }).mul = p.mul[i]!;
      v.lvl[i]!.gain.setTargetAtTime(p.lvl[i]!, t, 0.02);
    });
    v.filter.Q.setTargetAtTime(p.q, t, 0.02);
    v.trem.gain.setTargetAtTime(1 - p.chug * 0.5, t, 0.02);
    v.lfoDepth.gain.setTargetAtTime(p.chug * 0.5, t, 0.02);
  }

  private setVoice(v: Voice, rpm: number, load: number, level: number): void {
    const a = this.a!;
    const t = a.currentTime;
    const p = ENGINES[v.kind];
    const f0 = (rpm / 60) * 1.5 * p.pitch;
    for (const o of v.osc) o.frequency.setTargetAtTime(f0 * ((o as OscillatorNode & { mul?: number }).mul ?? 1), t, 0.03);
    v.filter.frequency.setTargetAtTime((300 + rpm * 0.28 * (0.45 + 0.55 * load)) * p.cut, t, 0.05);
    v.gain.gain.setTargetAtTime(level * p.level, t, 0.05);
    if (p.chug > 0) v.lfo.frequency.setTargetAtTime(p.chugA + rpm * p.chugB, t, 0.05);
  }

  /** The player's engine sound for the vehicle (once per change). */
  setEngine(body: CarBody): void {
    if (this.a && this.engine) this.dress(this.engine, engineOf(body));
  }

  /** The player's engine, every frame. `shift` is +1/−1 on a gear change. */
  playerEngine(rpm: number, throttle: number, shift: number, limiter = false, gearFrac = 0.5): void {
    if (!this.a || !this.engine || this.paused) return;
    if (shift > 0) this.dip = 0.35;
    // a downshift blips the throttle: a short rise in loudness, the revs jump up with the lower gear
    else if (shift < 0) this.dip = 1;
    this.dip = Math.min(1, this.dip + 0.06);
    // lower gears sound gruffer and louder, the top gear smoother; the rev limiter chops the sound into stutters
    const gruff = 1.12 - 0.22 * gearFrac;
    const chop = limiter ? 0.3 : 1;
    const lvl = (0.05 + throttle * 0.06 + (rpm / 7000) * 0.03) * this.dip * gruff * chop;
    this.setVoice(this.engine, rpm, throttle * (limiter ? 0.4 : 1), lvl);
    const t = this.a.currentTime;
    this.intake!.filter.frequency.setTargetAtTime((rpm / 60) * 4, t, 0.05);
    this.intake!.gain.gain.setTargetAtTime(throttle * (rpm / 7000) * 0.05 * this.dip, t, 0.05);
  }

  /** Two nearest opponents: their revs and how loud (0..1 by distance). */
  otherEngine(k: number, rpm: number, level: number, body?: CarBody): void {
    const v = this.others[k];
    if (!this.a || !v || this.paused) return;
    this.dress(v, engineOf(body));
    this.setVoice(v, rpm, 0.7, level * 0.07);
  }

  /** Tyres and road, every frame (all 0..1, speed in m/s). */
  surface(screech: number, gravel: number, grass: number, kerb: number, speed: number): void {
    if (!this.a || this.paused) return;
    const t = this.a.currentTime;
    const s = this.screech!;
    s.gain.gain.setTargetAtTime(screech * 0.09, t, 0.04);
    s.og.gain.setTargetAtTime(screech * 0.018, t, 0.04);
    s.osc.frequency.setTargetAtTime(1000 + Math.random() * 300 + screech * 200, t, 0.02);
    s.filter.frequency.setTargetAtTime(1300 + Math.random() * 500, t, 0.02);
    // crunch: jitter the gravel level
    this.gravel!.gain.gain.setTargetAtTime(gravel * (0.07 + Math.random() * 0.08), t, 0.015);
    this.grass!.gain.gain.setTargetAtTime(grass * 0.16, t, 0.04);
    const w = clamp(speed / 50, 0, 1);
    this.wind!.gain.gain.setTargetAtTime(w * w * 0.07, t, 0.1);
    this.kerb!.gain.gain.setTargetAtTime(kerb * 0.12, t, 0.02);
    this.kerb!.osc.frequency.setTargetAtTime(Math.max(12, speed * 1.1), t, 0.03);
  }

  silenceCars(): void {
    if (!this.a) return;
    const t = this.a.currentTime;
    for (const g of [this.engine?.gain, this.intake?.gain, this.screech?.gain, this.screech?.og, this.gravel?.gain, this.grass?.gain, this.wind?.gain, this.kerb?.gain, ...this.others.map((o) => o.gain)])
      g?.gain.setTargetAtTime(0, t, 0.03);
  }

  // ---- one-shots ----

  private get out(): AudioNode | null {
    return this.paused ? null : this.bus;
  }

  beep(go: boolean): void {
    tone(this.a, this.out, go ? 880 : 440, go ? 0.6 : 0.25, { type: 'square', vol: 0.09 });
    if (go) tone(this.a, this.out, 1320, 0.5, { type: 'sine', vol: 0.06, at: 0.02 });
  }

  bump(strength: number): void {
    const v = clamp(strength / 8, 0.15, 1);
    tone(this.a, this.out, 110, 0.18, { type: 'sine', to: 50, vol: 0.25 * v });
    noiseShot(this.a, this.out, 0.12, { freq: 900, q: 0.6, vol: 0.18 * v });
  }

  /** A car-to-car hit: a thump, crumpling plastic and a metallic clank; heavier bodies sound heavier. */
  crunch(strength: number, mass = 1): void {
    const v = clamp(strength / 9, 0.2, 1);
    const lo = clamp(1.2 - 0.25 * Math.log2(Math.max(0.3, mass) * 2), 0.6, 1.5);
    tone(this.a, this.out, 120 * lo, 0.22, { type: 'sine', to: 42, vol: 0.34 * v });
    noiseShot(this.a, this.out, 0.2, { freq: 1100 * lo, q: 0.5, vol: 0.26 * v });
    noiseShot(this.a, this.out, 0.1, { freq: 4300, q: 1.4, vol: 0.12 * v, at: 0.015 });
    tone(this.a, this.out, 260 * lo, 0.14, { type: 'square', to: 95, vol: 0.07 * v, at: 0.01 });
    if (v > 0.55) tone(this.a, this.out, 520, 0.18, { type: 'triangle', to: 310, vol: 0.06 * v, at: 0.04 });
  }

  /** A wreck: a small explosion. */
  boom(): void {
    tone(this.a, this.out, 90, 0.5, { type: 'sawtooth', to: 28, vol: 0.34 });
    noiseShot(this.a, this.out, 0.6, { freq: 700, q: 0.4, vol: 0.34 });
    noiseShot(this.a, this.out, 0.25, { freq: 3000, q: 0.8, vol: 0.14, at: 0.05 });
  }

  thud(strength: number): void {
    const v = clamp(strength / 6, 0.2, 1);
    tone(this.a, this.out, 80, 0.25, { type: 'sine', to: 35, vol: 0.32 * v });
    noiseShot(this.a, this.out, 0.2, { freq: 300, q: 0.5, vol: 0.14 * v });
  }

  /** Straw bales and fences: a soft whump with a rustle. */
  hay(strength: number): void {
    const v = clamp(strength / 8, 0.2, 1);
    tone(this.a, this.out, 140, 0.15, { type: 'sine', to: 70, vol: 0.2 * v });
    noiseShot(this.a, this.out, 0.35, { freq: 2500, q: 0.4, vol: 0.12 * v });
  }

  /** The tick of a perfect shift: a short, bright click with a little thump under it. */
  shiftTick(): void {
    tone(this.a, this.out, 1800, 0.05, { type: 'square', to: 1200, vol: 0.07 });
    tone(this.a, this.out, 140, 0.09, { type: 'triangle', to: 70, vol: 0.12 });
  }

  pop(): void {
    noiseShot(this.a, this.out, 0.07, { freq: 500, q: 0.5, vol: 0.22 });
    tone(this.a, this.out, 70, 0.08, { type: 'square', to: 40, vol: 0.08 });
  }

  chime(): void {
    tone(this.a, this.out, 784, 0.18, { type: 'triangle', vol: 0.09 });
    tone(this.a, this.out, 1175, 0.3, { type: 'triangle', vol: 0.09, at: 0.09 });
  }

  lap(last: boolean): void {
    const notes = last ? [659, 784, 988, 1319] : [523, 659, 784];
    notes.forEach((f, i) => tone(this.a, this.out, f, 0.22, { type: 'square', vol: 0.06, at: i * 0.11 }));
    if (last) {
      // a little bell
      for (let k = 0; k < 3; k++) tone(this.a, this.out, 1568, 0.5, { type: 'sine', vol: 0.06, at: 0.5 + k * 0.18 });
    }
  }

  boost(): void {
    tone(this.a, this.out, 300, 0.5, { type: 'sawtooth', to: 900, vol: 0.06 });
    noiseShot(this.a, this.out, 0.5, { freq: 1800, q: 0.7, vol: 0.08 });
  }

  /** Rubber duck: a squeaky two-part kvack. */
  quack(): void {
    const f = 620 + Math.random() * 120;
    tone(this.a, this.out, f, 0.11, { type: 'sawtooth', to: f * 0.55, vol: 0.13, attack: 0.01 });
    tone(this.a, this.out, f * 1.05, 0.13, { type: 'square', to: f * 0.5, vol: 0.07, at: 0.02, attack: 0.01 });
    tone(this.a, this.out, f * 0.9, 0.14, { type: 'sawtooth', to: f * 0.45, vol: 0.12, at: 0.15, attack: 0.01 });
    noiseShot(this.a, this.out, 0.05, { freq: 1800, q: 1.2, vol: 0.08 });
  }

  /**
   * A fart. A buzzing sawtooth whose pitch sags and wobbles, chopped by a fast square flutter (the "brrrrt"),
   * squeezed through a low-pass that closes, with a breath of low noise under it and a little squeak at the end.
   * `size` stretches it: 1 is a quick toot, 2 a long rumbling one.
   */
  fart(size = 1): void {
    const a = this.a;
    const out = this.out;
    if (!a || !out) return;
    const t = a.currentTime;
    const dur = Math.min(1.6, (0.38 + Math.random() * 0.25) * (0.8 + 0.6 * size));
    const f0 = 88 + Math.random() * 40;
    const osc = a.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f0 * 0.6, t + dur * 0.72);
    osc.frequency.exponentialRampToValueAtTime(f0 * (1.5 + Math.random() * 0.5), t + dur);
    // the pitch wobble
    const wob = a.createOscillator();
    wob.frequency.value = 11 + Math.random() * 9;
    const wobG = a.createGain();
    wobG.gain.value = 13;
    wob.connect(wobG).connect(osc.frequency);
    // the flutter: gain = 0.45 + 0.55 · square(20..38 Hz), so the sound stutters instead of humming
    const flut = a.createGain();
    flut.gain.value = 0.45;
    const fl = a.createOscillator();
    fl.type = 'square';
    fl.frequency.setValueAtTime(38, t);
    fl.frequency.linearRampToValueAtTime(19, t + dur);
    const flG = a.createGain();
    flG.gain.value = 0.55;
    fl.connect(flG).connect(flut.gain);
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + dur);
    const env = a.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.34, t + 0.03);
    env.gain.setValueAtTime(0.3, t + dur * 0.75);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(flut).connect(lp).connect(env).connect(out);
    for (const n of [osc, wob, fl]) {
      n.start(t);
      n.stop(t + dur + 0.05);
    }
    noiseShot(a, out, dur * 0.9, { freq: 210, q: 1.1, vol: 0.12 });
    noiseShot(a, out, 0.06, { freq: 1500, q: 1.5, vol: 0.05, at: dur * 0.85 });
  }

  /** A burp: a low voiced "uuuuurp", two vowel-ish band-passes sliding while the throat flutters. */
  burp(): void {
    const a = this.a;
    const out = this.out;
    if (!a || !out) return;
    const t = a.currentTime;
    const dur = 0.62;
    const osc = a.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(74, t);
    osc.frequency.linearRampToValueAtTime(58, t + dur * 0.55);
    osc.frequency.exponentialRampToValueAtTime(40, t + dur);
    const flut = a.createGain();
    flut.gain.value = 0.55;
    const fl = a.createOscillator();
    fl.type = 'sine';
    fl.frequency.setValueAtTime(16, t);
    fl.frequency.linearRampToValueAtTime(30, t + dur);
    const flG = a.createGain();
    flG.gain.value = 0.45;
    fl.connect(flG).connect(flut.gain);
    const env = a.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.5, t + 0.06);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(flut);
    // two formants that glide from "uh" to "orp"
    for (const [f0, f1, q, v] of [[420, 700, 4, 1], [900, 520, 5, 0.6]] as const) {
      const bp = a.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = a.createGain();
      g.gain.value = v;
      flut.connect(bp).connect(g).connect(env);
    }
    env.connect(out);
    for (const n of [osc, fl]) {
      n.start(t);
      n.stop(t + dur + 0.05);
    }
    noiseShot(a, out, 0.12, { freq: 500, q: 0.9, vol: 0.08, at: dur * 0.8 });
  }

  /** The horn, one for each vehicle: a beep, a bike's toot, the tractor's moo-horn, and the moped's high ring-ring. */
  horn(body: CarBody | undefined, kind: CarHorn = 'beep'): void {
    const a = this.a;
    const out = this.out;
    // a horn picked in the styling garage replaces the vehicle's own ('beep' is "the vehicle's own")
    if (kind !== 'beep') {
      switch (kind) {
        case 'tune':
          // the first bars of a cheerful marching tune
          [523, 523, 523, 698, 880, 698, 523, 698, 880, 1047].forEach((f, i) => tone(a, out, f, i === 9 ? 0.4 : 0.11, { type: 'triangle', vol: 0.08, at: i * 0.13 }));
          break;
        case 'cow':
          tone(a, out, 170, 1.0, { type: 'sawtooth', to: 105, vol: 0.1, attack: 0.1 });
          tone(a, out, 255, 1.0, { type: 'triangle', to: 160, vol: 0.06, attack: 0.1 });
          break;
        case 'duck':
          for (const at of [0, 0.22]) {
            tone(a, out, 620, 0.14, { type: 'square', to: 380, vol: 0.06, at });
            noiseShot(a, out, 0.1, { freq: 1400, q: 1.2, vol: 0.05, at });
          }
          break;
        case 'train':
          tone(a, out, 349, 1.0, { type: 'sawtooth', vol: 0.08, attack: 0.05 });
          tone(a, out, 440, 1.0, { type: 'sawtooth', vol: 0.07, attack: 0.05 });
          tone(a, out, 523, 1.0, { type: 'square', vol: 0.03, attack: 0.05 });
          break;
        default:
          // a goose: two cracked honks
          for (const at of [0, 0.34]) {
            tone(a, out, 330, 0.26, { type: 'square', to: 270, vol: 0.07, at, attack: 0.02 });
            tone(a, out, 345, 0.26, { type: 'sawtooth', to: 280, vol: 0.05, at, attack: 0.02 });
          }
      }
      return;
    }
    switch (body) {
      case 'moped': {
        // a bicycle bell: two quick rings, each a bright pair of sines with a shimmer
        for (const at of [0, 0.3]) {
          for (let i = 0; i < 4; i++) {
            const f = i % 2 ? 3136 : 2637;
            tone(a, out, f, 0.14, { type: 'sine', vol: 0.09, at: at + i * 0.045, attack: 0.002 });
            tone(a, out, f * 1.505, 0.1, { type: 'sine', vol: 0.04, at: at + i * 0.045, attack: 0.002 });
          }
        }
        break;
      }
      case 'tractor':
        tone(a, out, 150, 0.7, { type: 'sawtooth', vol: 0.1, attack: 0.03 });
        tone(a, out, 190, 0.7, { type: 'square', vol: 0.06, attack: 0.03 });
        break;
      case 'moto':
        tone(a, out, 720, 0.16, { type: 'square', vol: 0.07 });
        tone(a, out, 720, 0.22, { type: 'square', vol: 0.07, at: 0.2 });
        break;
      case 'atv':
        tone(a, out, 520, 0.2, { type: 'square', to: 480, vol: 0.08 });
        tone(a, out, 520, 0.2, { type: 'square', to: 480, vol: 0.08, at: 0.26 });
        break;
      case 'icecream':
        // the first bars of the ice-cream tune
        [659, 587, 523, 587, 659, 659, 659].forEach((f, i) => tone(a, out, f, 0.14, { type: 'triangle', vol: 0.08, at: i * 0.15 }));
        break;
      case 'golf':
        tone(a, out, 880, 0.12, { type: 'sine', vol: 0.08 });
        tone(a, out, 1175, 0.2, { type: 'sine', vol: 0.08, at: 0.1 });
        break;
      case 'cart':
        // a squeaky wheel
        tone(a, out, 1400, 0.25, { type: 'sawtooth', to: 900, vol: 0.05 });
        tone(a, out, 1500, 0.2, { type: 'sawtooth', to: 1000, vol: 0.05, at: 0.28 });
        break;
      case 'limo':
        // a fancy three-note chord
        [392, 494, 587].forEach((f) => tone(a, out, f, 0.6, { type: 'triangle', vol: 0.07 }));
        break;
      case 'garbage':
      case 'camper':
        tone(a, out, 110, 0.7, { type: 'sawtooth', vol: 0.1, attack: 0.03 });
        tone(a, out, 138, 0.7, { type: 'square', vol: 0.06, attack: 0.03 });
        break;
      case 'mower':
        tone(a, out, 700, 0.1, { type: 'square', vol: 0.06 });
        tone(a, out, 700, 0.1, { type: 'square', vol: 0.06, at: 0.14 });
        tone(a, out, 700, 0.2, { type: 'square', vol: 0.06, at: 0.28 });
        break;
      case 'sofa':
        // a squeaky cushion
        tone(a, out, 300, 0.35, { type: 'triangle', to: 90, vol: 0.14 });
        noiseShot(a, out, 0.3, { freq: 700, q: 1.5, vol: 0.12 });
        tone(a, out, 520, 0.12, { type: 'sine', to: 240, vol: 0.06, at: 0.3 });
        break;
      default:
        tone(a, out, 415, 0.4, { type: 'square', vol: 0.07 });
        tone(a, out, 524, 0.4, { type: 'square', vol: 0.06 });
    }
  }

  /** The ice-cream van's tune: a little music-box melody. */
  jingle(): void {
    const notes = [659, 784, 659, 523, 587, 659, 587, 494, 523];
    notes.forEach((f, i) => {
      tone(this.a, this.out, f, 0.2, { type: 'triangle', vol: 0.06, at: i * 0.17 });
      tone(this.a, this.out, f * 2, 0.12, { type: 'sine', vol: 0.025, at: i * 0.17 });
    });
  }

  /** The rocket: a long roar. */
  rocket(sec: number): void {
    noiseShot(this.a, this.out, sec, { freq: 900, q: 0.5, vol: 0.3 });
    tone(this.a, this.out, 70, sec, { type: 'sawtooth', to: 140, vol: 0.12 });
    noiseShot(this.a, this.out, 0.3, { freq: 2600, q: 0.8, vol: 0.18 });
  }

  /** A golf club hitting a ball: a sharp tick, then a rising whistle. */
  tock(): void {
    tone(this.a, this.out, 2400, 0.04, { type: 'square', vol: 0.12 });
    tone(this.a, this.out, 600, 0.5, { type: 'sine', to: 1400, vol: 0.06, at: 0.04 });
  }

  /** A steward's whistle: a shrill trilling blast. */
  whistle(): void {
    tone(this.a, this.out, 2700, 0.5, { type: 'sine', to: 2500, vol: 0.12 });
    tone(this.a, this.out, 2640, 0.5, { type: 'square', to: 2440, vol: 0.03 });
    noiseShot(this.a, this.out, 0.4, { freq: 4200, q: 3, vol: 0.05 });
  }

  /** A springy boing. */
  boing(): void {
    tone(this.a, this.out, 180, 0.35, { type: 'sine', to: 620, vol: 0.16 });
    tone(this.a, this.out, 620, 0.3, { type: 'triangle', to: 220, vol: 0.08, at: 0.12 });
  }

  /** A party popper: pop, then a rising tinkle. */
  party(): void {
    noiseShot(this.a, this.out, 0.12, { freq: 1200, q: 0.5, vol: 0.2 });
    tone(this.a, this.out, 120, 0.12, { type: 'square', to: 50, vol: 0.1 });
    [784, 988, 1319, 1568].forEach((f, i) => tone(this.a, this.out, f, 0.16, { type: 'triangle', vol: 0.06, at: 0.08 + i * 0.05 }));
  }

  /** A coin: two quick bright notes. */
  coin(): void {
    tone(this.a, this.out, 988, 0.07, { type: 'square', vol: 0.05 });
    tone(this.a, this.out, 1319, 0.16, { type: 'square', vol: 0.05, at: 0.06 });
  }

  /** Slipping on a banana: a descending slide whistle. */
  slip(): void {
    tone(this.a, this.out, 1100, 0.4, { type: 'sine', to: 220, vol: 0.12 });
    noiseShot(this.a, this.out, 0.18, { freq: 3000, q: 0.8, vol: 0.08 });
  }

  /** The disco beat: a soft kick, with a hi-hat on the off-beat. */
  beat(off: boolean): void {
    if (off) noiseShot(this.a, this.out, 0.05, { freq: 7000, q: 1, vol: 0.05 });
    else tone(this.a, this.out, 140, 0.18, { type: 'sine', to: 45, vol: 0.2 });
  }

  poof(): void {
    noiseShot(this.a, this.out, 0.4, { freq: 2200, q: 0.8, vol: 0.12 });
    tone(this.a, this.out, 600, 0.3, { type: 'sine', to: 1400, vol: 0.06 });
  }

  wrongWay(): void {
    tone(this.a, this.out, 330, 0.18, { type: 'square', vol: 0.06 });
    tone(this.a, this.out, 262, 0.25, { type: 'square', vol: 0.06, at: 0.2 });
  }

  /** The crowd: a swell of noisy cheering with a few whistles. */
  cheer(level = 1): void {
    if (!this.a || !this.out) return;
    for (let k = 0; k < 6; k++) noiseShot(this.a, this.out, 0.5 + Math.random() * 0.6, { freq: 900 + Math.random() * 1400, q: 1.5, vol: 0.05 * level, at: k * 0.12 });
    for (let k = 0; k < 2; k++) {
      const f = 1800 + Math.random() * 600;
      tone(this.a, this.out, f, 0.35, { type: 'sine', to: f * 1.3, vol: 0.03 * level, at: 0.2 + k * 0.4 });
    }
  }

  /** The crowd boos: a low, sagging "buuuh" from a few throats. */
  boo(level = 1): void {
    if (!this.a || !this.out) return;
    for (let k = 0; k < 4; k++) {
      const f = 150 + Math.random() * 70;
      tone(this.a, this.out, f, 0.9, { type: 'sawtooth', to: f * 0.72, vol: 0.022 * level, at: k * 0.07 });
    }
    noiseShot(this.a, this.out, 0.8, { freq: 500, q: 1, vol: 0.03 * level, at: 0.05 });
  }

  fanfare(win: boolean): void {
    const seq: [number, number, number][] = win
      ? [
          [523, 0, 0.16],
          [659, 0.16, 0.16],
          [784, 0.32, 0.16],
          [1047, 0.48, 0.5],
          [784, 1.0, 0.16],
          [1047, 1.16, 0.8],
        ]
      : [
          [523, 0, 0.16],
          [659, 0.16, 0.16],
          [784, 0.32, 0.5],
          [659, 0.82, 0.16],
          [784, 0.98, 0.7],
        ];
    for (const [f, at, d] of seq) {
      tone(this.a, this.out, f, d, { type: 'square', vol: 0.07, at });
      tone(this.a, this.out, f / 2, d, { type: 'triangle', vol: 0.07, at });
    }
  }

  // ---- music ----

  /** Music level 0..1 (0 stops it). */
  music(level: number): void {
    this.musicLevel = level;
    if (!this.a || !this.musicBus) return;
    // the settings panel can turn the music off (it is read again whenever the race resumes)
    const on = settings.music ? level : 0;
    this.musicBus.gain.setTargetAtTime(this.paused ? 0 : on * 0.55, this.a.currentTime, 0.4);
    if (on > 0 && !this.musicTimer && !this.paused) this.startMusic();
    else if (on === 0 && this.musicTimer) this.stopMusic();
  }

  private startMusic(): void {
    if (!this.a) return;
    this.musicAt = this.a.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 90);
    this.schedule();
  }

  private stopMusic(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private schedule(): void {
    const a = this.a;
    const out = this.musicBus;
    if (!a || !out) return;
    const step = 60 / 132 / 2;
    while (this.musicAt < a.currentTime + 0.35) {
      const k = this.musicStep;
      const bar = Math.floor(k / 8) % 8;
      const e = k % 8;
      const t0 = this.musicAt - a.currentTime;
      if (t0 > -0.05) {
        const at = Math.max(0, t0);
        // oom-pah bass
        if (e === 0 || e === 4) tone(a, out, NOTE(e === 0 ? BASS[bar]! : FIFTH[bar]!), 0.22, { type: 'triangle', vol: 0.16, at });
        // chord stabs on the off-beats
        if (e % 2 === 1) for (const n of CHORDS[bar]!) tone(a, out, NOTE(n), 0.09, { type: 'square', vol: 0.018, at });
        // melody, with a held note when the next step is empty
        const m = MELODY[bar]![e]!;
        if (m) {
          let len = 1;
          while (e + len < 8 && !MELODY[bar]![e + len]) len++;
          const f = NOTE(m);
          tone(a, out, f, step * len * 0.95, { type: 'triangle', vol: 0.07, at, attack: 0.01 });
          tone(a, out, f * 2.005, step * len * 0.6, { type: 'sine', vol: 0.015, at });
        }
        // drums
        if (e === 0 || e === 4) tone(a, out, 150, 0.16, { type: 'sine', to: 45, vol: 0.2, at });
        if (e === 2 || e === 6) noiseShot(a, out, 0.1, { freq: 1800, q: 0.7, vol: 0.06, at });
        noiseShot(a, out, 0.03, { freq: 8000, q: 1, vol: 0.02, at });
      }
      this.musicStep++;
      this.musicAt += step;
    }
  }

  pause(): void {
    this.paused = true;
    this.stopMusic();
    if (this.bus && this.a) this.bus.gain.setTargetAtTime(0, this.a.currentTime, 0.02);
  }

  resume(): void {
    this.paused = false;
    if (this.bus && this.a) this.bus.gain.setTargetAtTime(0.9, this.a.currentTime, 0.05);
    if (this.musicLevel > 0) {
      this.music(this.musicLevel);
    }
  }

  destroy(): void {
    this.stopMusic();
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
      s.disconnect();
    }
    this.sources = [];
    this.bus?.disconnect();
    this.musicBus?.disconnect();
  }
}
