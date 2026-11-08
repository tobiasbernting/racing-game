// Pieces shared by the run screens: the status bar, talisman cards and chips.
import { ACTS } from '../run/map.ts';
import { type RunState } from '../run/state.ts';
import { RARITY_NAMES, trinketById, type Owned, type TrinketDef } from '../run/trinkets.ts';
import { btn, el } from './dom.ts';
import { DIFFS } from '../run/difficulty.ts';
import { seedCode, seedLabelOf } from '../run/seedcode.ts';

export { ACT_NAMES } from '../run/summary.ts';
import { ACT_NAMES } from '../run/summary.ts';

export function hearts(h: number, max: number): HTMLElement {
  const box = el('span', 'rg-hearts');
  box.setAttribute('aria-label', `${h} av ${max} hjärtan`);
  for (let i = 0; i < max; i++) box.append(el('i', i < h ? 'on' : 'off', i < h ? '❤️' : '🖤'));
  return box;
}

/** Emoji icons of the owned trinkets with a ×n badge. */
export function trinketIcons(owned: readonly Owned[], max = 16): HTMLElement {
  const row = el('span', 'rg-icons');
  owned.slice(0, max).forEach((o) => {
    const d = trinketById(o.id);
    if (!d) return;
    const e = el('i', 'rg-ico', d.emoji);
    e.title = `${d.name}${o.n > 1 ? ` ×${o.n}` : ''}`;
    if (o.n > 1) e.append(el('b', null, `×${o.n}`));
    row.append(e);
  });
  if (owned.length > max) row.append(el('i', 'rg-ico more', `+${owned.length - max}`));
  return row;
}

/** The difficulty on the status bar of the map and the race cards (Normal shows nothing: it is the way the game is meant). */
export function diffBadge(run: Pick<RunState, 'diff'>): HTMLElement | null {
  if (run.diff === 'normal') return null;
  const d = DIFFS[run.diff];
  const b = el('span', `rg-diffbadge d-${run.diff}`, `${d.emoji} ${d.name}`);
  b.title = d.blurb;
  return b;
}

/** The strip on top of every run screen: act, hearts, kronor, trinkets, and whatever buttons go on the right. */
export function statusBar(run: RunState, ...right: (Node | null)[]): HTMLElement {
  return el(
    'div',
    'rg-top',
    el('span', 'rg-act', `Akt ${run.act + 1}/${ACTS}`, el('small', null, ` ${ACT_NAMES[Math.min(run.act, ACTS - 1)]}`)),
    hearts(run.hearts, run.maxHearts),
    diffBadge(run),
    el('span', 'rg-kr', `💰 ${run.kronor} kr`),
    trinketIcons(run.trinkets),
    el('span', 'rg-grow'),
    ...right,
  );
}

export function chip(text: string, cls = ''): HTMLElement {
  return el('span', `rg-chip ${cls}`.trim(), text);
}

/** A card for a trinket: icon, name, line, rarity and price (or a note). */
export function trinketCard(def: TrinketDef, o: { n?: number; price?: number; onClick?: () => void; disabled?: boolean; note?: string; tag?: string }): HTMLElement {
  const foot = el('span', 'rg-tfoot', el('span', `rg-rar r-${def.rarity}`, RARITY_NAMES[def.rarity]));
  if (o.price !== undefined) foot.append(el('b', 'rg-price', `${o.price} kr`));
  if (o.note) foot.append(el('em', null, o.note));
  const kids = [el('span', 'rg-tem', def.emoji), el('span', 'rg-tname', def.name), el('span', 'rg-ttext', def.text), foot];
  if (o.n && o.n > 0) kids.push(el('span', 'rg-own', `Du äger ×${o.n}`));
  if (o.tag) kids.push(el('span', 'rg-tag', o.tag));
  const cls = `rg-tcard r-${def.rarity}`;
  if (!o.onClick) return el('div', cls, ...kids);
  const b = btn(cls, kids, o.onClick);
  b.disabled = !!o.disabled;
  return b;
}

/** The run's seed as a short code a kid can read out ("Frö: KOSSA-4821"). */
export const seedLabel = (seed: number): string => `Frö: ${seedLabelOf(seed)}`;

/** Copies text to the clipboard: the async API where the page may use it, else a hidden textarea. True when it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // blocked (an insecure page, no permission): fall through to the old way
  }
  try {
    const t = document.createElement('textarea');
    t.value = text;
    t.setAttribute('readonly', '');
    t.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(t);
    t.select();
    t.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch {
    return false;
  }
}

/** The seed code with a small copy button ("📋"): on a press it says "Kopierat!" for a moment. */
export function seedChip(seed: number, cls = 'rg-seed'): HTMLElement {
  const code = seedCode(seed);
  const text = seedLabelOf(seed);
  const b = btn('rg-copy', '📋', () => {
    void copyText(text).then((ok) => {
      b.textContent = ok ? '✓ Kopierat' : 'Markera och kopiera själv';
      setTimeout(() => (b.textContent = '📋'), 1600);
    });
  });
  b.setAttribute('aria-label', `Kopiera frökoden ${text}`);
  b.title = code ? 'Kopiera koden. Samma kod och svårighet ger exakt samma runda.' : 'Kopiera koden';
  return el('span', cls, 'Frö: ', el('b', 'rg-code', text), b);
}

/** A hand-drawn arrow, a wobbly stroke with a two-line head, for the sticker look (colour from CSS `color`). */
export function arrowSvg(cls: string): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 80 40');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M3 28 C 14 8, 30 6, 46 16 S 62 26, 74 18 M74 18 L 63 9 M74 18 L 62 25');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}
