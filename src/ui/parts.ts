// Pieces shared by the run screens: the status bar, trinket cards and chips.
import { ACTS } from '../run/map.ts';
import { type RunState } from '../run/state.ts';
import { RARITY_NAMES, trinketById, type Owned, type TrinketDef } from '../run/trinkets.ts';
import { btn, el } from './dom.ts';

export const ACT_NAMES = ['Landsbygden', 'Vildmarken', 'Galna stan'] as const;

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

/** The strip on top of every run screen: act, hearts, kronor, trinkets, and whatever buttons go on the right. */
export function statusBar(run: RunState, ...right: (Node | null)[]): HTMLElement {
  return el(
    'div',
    'rg-top',
    el('span', 'rg-act', `Akt ${run.act + 1}/${ACTS}`, el('small', null, ` ${ACT_NAMES[Math.min(run.act, ACTS - 1)]}`)),
    hearts(run.hearts, run.maxHearts),
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
  if (o.n && o.n > 0) kids.push(el('span', 'rg-own', `Du har ×${o.n}`));
  if (o.tag) kids.push(el('span', 'rg-tag', o.tag));
  const cls = `rg-tcard r-${def.rarity}`;
  if (!o.onClick) return el('div', cls, ...kids);
  const b = btn(cls, kids, o.onClick);
  b.disabled = !!o.disabled;
  return b;
}
