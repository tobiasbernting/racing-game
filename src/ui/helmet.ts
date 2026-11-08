// A drawn racing helmet (SVG) in a driver's colours with their pattern and initials: the portrait on the pre-race
// collector cards, the little pictures on the helmet buttons of the pick screen, the name screen. Everyone in the
// game is a person in a helmet, so this is what a face looks like here.
import type { HelmetLook } from '../shared/rally.ts';

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...kids: SVGElement[]): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const c of kids) e.append(c);
  return e;
};

/** Is the colour light (a white helmet gets a dark outline detail)? Plain luminance from a #rrggbb string. */
function light(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160;
}

export interface HelmetOpts {
  color: string;
  trim: string;
  design: HelmetLook;
  /** Two letters on the side of the helmet. */
  initials?: string;
  /** Draw shoulders in race overalls under the helmet (a portrait), not only the helmet. */
  shoulders?: boolean;
  cls?: string;
}

/** The helmet's silhouette: a dome, a chin guard, seen from the front-left. */
const DOME = 'M10 64 C8 30 32 8 56 10 C82 12 94 38 92 64 L92 74 C92 80 86 84 80 84 L26 84 C16 84 10 78 10 70 Z';

/** The pattern of one design, drawn inside the dome (clipped to it); `ears` are drawn outside. */
function pattern(design: HelmetLook, trim: string, dark: string): SVGElement[] {
  const arc = (dy: number, w: number, extra: Record<string, string | number> = {}): SVGElement => svgEl('path', { d: `M14 ${52 + dy} C26 ${14 + dy} 76 ${10 + dy} 90 ${48 + dy}`, fill: 'none', stroke: trim, 'stroke-width': w, ...extra });
  switch (design) {
    case 'twin':
      return [arc(-2, 5, { transform: 'translate(-6 0)' }), arc(-2, 5, { transform: 'translate(8 6)' })];
    case 'checker':
      return [arc(0, 11, { stroke: dark }), arc(0, 11, { 'stroke-dasharray': '6 6' })];
    case 'star':
      return [svgEl('polygon', { points: '30,28 34,38 45,39 37,46 40,57 30,51 20,57 23,46 15,39 26,38', fill: trim, stroke: dark, 'stroke-width': 1.5 })];
    case 'flame':
      return [
        svgEl('path', { d: 'M10 78 C20 70 18 58 28 50 C28 60 36 60 34 70 C42 62 44 52 52 46 C52 60 60 66 58 78 Z', fill: trim }),
        svgEl('path', { d: 'M20 78 C26 72 28 66 32 62 C34 68 38 70 38 78 Z', fill: dark, opacity: 0.35 }),
      ];
    case 'dots':
      return [[22, 30, 7], [40, 22, 6], [58, 20, 6], [30, 52, 6], [18, 60, 5]].map(([x, y, r]) => svgEl('circle', { cx: x!, cy: y!, r: r!, fill: trim }));
    case 'bolt':
      return [svgEl('polygon', { points: '40,16 22,50 34,50 26,76 52,38 38,38 48,16', fill: trim, stroke: dark, 'stroke-width': 1.5, 'stroke-linejoin': 'round' })];
    case 'wing':
      return [0, 1, 2].map((k) => svgEl('path', { d: `M12 ${60 - k * 11} C26 ${56 - k * 11} 40 ${46 - k * 12} 54 ${34 - k * 9} C46 ${46 - k * 9} 30 ${54 - k * 8} 12 ${66 - k * 11} Z`, fill: trim }));
    case 'ears':
      return [arc(0, 7)];
    default:
      return [arc(0, 9)];
  }
}

/** A helmet as an SVG element, 100 wide by 100 (portrait: 110) tall; size it with CSS. */
export function helmetSvg(o: HelmetOpts): SVGSVGElement {
  const id = `hm${++uid}`;
  const dark = light(o.color) ? '#3a3a42' : '#0b0d12';
  const svg = svgEl('svg', { viewBox: o.shoulders ? '0 -10 100 124' : '0 -8 100 100', class: `rg-helmet${o.cls ? ` ${o.cls}` : ''}`, role: 'img', 'aria-hidden': 'true', focusable: 'false' });
  const defs = svgEl('defs', {}, svgEl('clipPath', { id }, svgEl('path', { d: DOME })));
  svg.append(defs);
  if (o.shoulders) {
    // the race overalls: shoulders in the trim colour with a collar and a stripe
    svg.append(
      svgEl('path', { d: 'M2 114 C6 96 26 88 50 88 C74 88 94 96 98 114 Z', fill: o.trim, stroke: dark, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
      svgEl('path', { d: 'M30 90 L50 104 L70 90 L64 88 L50 98 L36 88 Z', fill: dark, opacity: 0.8 }),
      svgEl('path', { d: 'M6 108 C10 100 24 94 38 93 L36 100 C24 101 14 105 10 112 Z', fill: o.color, opacity: 0.9 }),
    );
  }
  if (o.design === 'ears') {
    for (const sx of [0, 1]) {
      const x = sx ? 62 : 22;
      svg.append(
        svgEl('path', { d: `M${x} 22 C${x - 10} -6 ${x + 2} -12 ${x + 8} -6 C${x + 16} 2 ${x + 14} 14 ${x + 10} 24 Z`, fill: o.color, stroke: dark, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
        svgEl('path', { d: `M${x + 4} 18 C${x} 2 ${x + 4} -4 ${x + 7} 0 C${x + 11} 6 ${x + 10} 12 ${x + 8} 20 Z`, fill: o.trim, opacity: 0.85 }),
      );
    }
  }
  svg.append(svgEl('path', { d: DOME, fill: o.color }));
  svg.append(svgEl('g', { 'clip-path': `url(#${id})` }, ...pattern(o.design, o.trim, dark)));
  // a soft shine, the visor with its glint, and the chin guard's edge
  svg.append(
    svgEl('path', { d: 'M20 40 C24 24 38 16 52 16', fill: 'none', stroke: '#ffffff', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.35 }),
    svgEl('path', { d: 'M44 42 C56 38 86 38 92 46 L92 64 C84 70 56 70 46 62 Z', fill: '#0d1016', stroke: dark, 'stroke-width': 2 }),
    svgEl('path', { d: 'M54 46 C62 44 76 44 84 47', fill: 'none', stroke: '#8fb8ff', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.85 }),
    svgEl('path', { d: 'M14 74 L88 74', stroke: dark, 'stroke-width': 2, opacity: 0.45 }),
    svgEl('path', { d: DOME, fill: 'none', stroke: dark, 'stroke-width': 3, 'stroke-linejoin': 'round' }),
  );
  if (o.initials) {
    const t = svgEl('text', { x: 27, y: 70, 'text-anchor': 'middle', 'font-family': 'system-ui, sans-serif', 'font-weight': 900, 'font-size': 17, fill: light(o.trim) ? '#15171c' : '#ffffff', stroke: light(o.trim) ? '#ffffff' : '#15171c', 'stroke-width': 2.2, 'paint-order': 'stroke' });
    t.textContent = o.initials.slice(0, 2).toUpperCase();
    svg.append(t);
  }
  return svg;
}
