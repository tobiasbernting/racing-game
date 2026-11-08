// Small bits of fun for the menus: paper confetti that rains over a screen, numbers that count up, and the
// "NY PRYL!" banner with its fanfare. Everything cleans up after itself and respects reduced motion.
import { tone } from '../arcade/sfx.ts';
import { el } from './dom.ts';

const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const COLORS = ['#ffd23f', '#ff5a3c', '#5fdc6a', '#6db5ff', '#ff7ad9', '#ffffff'];

/** Paper confetti raining over `host` for a couple of seconds (a canvas that removes itself). */
export function confettiRain(host: HTMLElement, count = 120, seconds = 2.6): void {
  if (reduced()) return;
  const cv = el('canvas', 'arc-confetti');
  const w = host.clientWidth || innerWidth;
  const h = host.clientHeight || innerHeight;
  cv.width = w;
  cv.height = h;
  host.append(cv);
  const g = cv.getContext('2d');
  if (!g) {
    cv.remove();
    return;
  }
  const bits = Array.from({ length: count }, (_, i) => ({
    x: Math.random() * w,
    y: -20 - Math.random() * h * 0.6,
    vx: (Math.random() - 0.5) * 120,
    vy: 140 + Math.random() * 220,
    rot: Math.random() * 6.28,
    vr: (Math.random() - 0.5) * 12,
    s: 6 + Math.random() * 8,
    c: COLORS[i % COLORS.length]!,
  }));
  const t0 = performance.now();
  let last = t0;
  const frame = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    if (t > seconds || !cv.isConnected) {
      cv.remove();
      return;
    }
    g.clearRect(0, 0, w, h);
    g.globalAlpha = Math.min(1, (seconds - t) * 2);
    for (const b of bits) {
      b.x += b.vx * dt + Math.sin(t * 3 + b.rot) * 30 * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.rot);
      g.fillStyle = b.c;
      g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      g.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Counts the number inside `node` from 0 up to `to` (text is `${prefix}${n}${suffix}`); `tick` is called as it climbs. */
export function countUp(node: HTMLElement, to: number, o: { prefix?: string; suffix?: string; ms?: number; tick?: () => void } = {}): void {
  const { prefix = '', suffix = '', ms = 1000, tick } = o;
  const set = (n: number): void => {
    node.textContent = `${prefix}${n}${suffix}`;
  };
  if (reduced() || to <= 0) {
    set(to);
    return;
  }
  set(0);
  const t0 = performance.now();
  let shown = 0;
  let ticks = 0;
  const frame = (now: number): void => {
    if (!node.isConnected) return;
    const t = Math.min(1, (now - t0) / ms);
    // fast at the start, slowing down into the final number
    const n = Math.round(to * (1 - (1 - t) * (1 - t)));
    if (n !== shown) {
      shown = n;
      set(n);
      if (tick && ticks++ % 3 === 0) tick();
    }
    if (t < 1) requestAnimationFrame(frame);
    else set(to);
  };
  requestAnimationFrame(frame);
}

/** A little rising run of notes: the coin counter's tick, the fanfare and so on. */
export const sfx = {
  tick(a: AudioContext | null, out: AudioNode | null): void {
    tone(a, out, 900 + Math.random() * 300, 0.05, { type: 'square', vol: 0.04 });
  },
  /** NY PRYL! */
  fanfare(a: AudioContext | null, out: AudioNode | null): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(a, out, f, 0.16, { type: 'square', vol: 0.09, at: i * 0.09 }));
    tone(a, out, 1319, 0.5, { type: 'triangle', vol: 0.12, at: 0.4 });
    tone(a, out, 1047, 0.5, { type: 'triangle', vol: 0.08, at: 0.4 });
  },
  win(a: AudioContext | null, out: AudioNode | null): void {
    [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(a, out, f, 0.2, { type: 'square', vol: 0.08, at: i * 0.11 }));
  },
};

/** The big "NY PRYL!" banner over whatever screen is up; it goes by itself after a moment. */
export function pryl(host: HTMLElement, emoji: string, name: string): void {
  host.querySelectorAll('.arc-pryl').forEach((n) => n.remove());
  const b = el('div', 'arc-pryl', el('div', 'arc-pryl-h', 'NY PRYL!'), el('div', 'arc-pryl-b', `${emoji} ${name}`));
  b.setAttribute('role', 'status');
  host.append(b);
  confettiRain(host, 70, 1.8);
  setTimeout(() => b.remove(), 2200);
}

/** A small "KOMBO!" ribbon in the corner: two things you own just woke a combo. Like UPPLÅST!, it never blocks anything and goes by itself. */
export function kombo(host: HTMLElement, emoji: string, name: string, text: string): void {
  host.querySelectorAll('.arc-unl.kombo').forEach((n) => n.remove());
  const b = el('div', 'arc-unl kombo', el('span', 'arc-unl-i', emoji), el('div', 'arc-unl-t', el('b', null, 'KOMBO!'), el('span', null, name), el('small', null, text)));
  b.setAttribute('role', 'status');
  host.append(b);
  setTimeout(() => b.remove(), 5200);
}

/** A small "UPPLÅST!" ribbon in the corner of whatever screen is up: a new vehicle is open. It never blocks anything and goes by itself. */
export function upplast(host: HTMLElement, emoji: string, name: string, why: string): void {
  host.querySelectorAll('.arc-unl').forEach((n) => n.remove());
  const b = el('div', 'arc-unl', el('span', 'arc-unl-i', emoji), el('div', 'arc-unl-t', el('b', null, 'UPPLÅST!'), el('span', null, name), el('small', null, why)));
  b.setAttribute('role', 'status');
  host.append(b);
  setTimeout(() => b.remove(), 5200);
}
