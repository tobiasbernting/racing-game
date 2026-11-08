// The car that grows, on screen: the upgrade card (after a win and in the workshop), the tree panel (taken, open and
// locked nodes, the combos) and the Bygget screen. Pure DOM builders, like views.ts: they take the run and callbacks.
import { kitOf } from '../shared/abilities.ts';
import { CAR_BODY_NAMES } from '../shared/names.ts';
import { upgradePrice, workshopFree } from '../run/economy.ts';
import type { RunState } from '../run/state.ts';
import { buildMix } from '../run/summary.ts';
import {
  COMBOS,
  CAPSTONE_NEEDS,
  TREES,
  TREE_INFO,
  activeCombos,
  canTake,
  lineById,
  lockedWhy,
  reqName,
  takeNode,
  treeCount,
  treeLines,
  upgradeById,
  nodeId,
  type ComboDef,
  type TreeId,
  type TreeKey,
  type UpgradeDef,
} from '../run/upgrades.ts';
import { btn, el } from './dom.ts';
import { statusBar } from './parts.ts';

export const TREE_COLOR: Record<TreeKey, string> = { ram: '#e8452c', race: '#2f9be8', fuffens: '#6fbf3a', stunt: '#a45be8', girig: '#f0b400', car: '#19c3b3' };
const ROMAN = ['', 'I', 'II', 'III'];

export interface TreeLabel {
  name: string;
  emoji: string;
}

/** Name and emoji of a tree key; the vehicle's own upgrades are named after the vehicle's ability. */
export function treeLabel(tree: TreeKey, body: RunState['car']['body']): TreeLabel {
  if (tree === 'car') return { name: 'Fordonet', emoji: kitOf(body).active.emoji };
  return TREE_INFO[tree];
}

/** The combos that switch on when this node is taken. */
export function comboAfter(run: RunState, id: string): ComboDef[] {
  const now = new Set(activeCombos({ owned: run.trinkets, ups: run.up }).map((c) => c.id));
  const ups = [...run.up];
  takeNode(ups, id);
  return activeCombos({ owned: run.trinkets, ups }).filter((c) => !now.has(c.id));
}

const tierText = (u: UpgradeDef): string => {
  const l = lineById(u.line)!;
  return u.cap ? 'Toppen' : l.tiers.length > 1 ? `Nivå ${ROMAN[u.tier]} av ${ROMAN[l.tiers.length]}` : 'Nivå I';
};

/** An upgrade as a card: the picture, the name, what it does, its tree and tier, and any combo it completes. */
export function upgradeCard(run: RunState, id: string, o: { onClick?: () => void; price?: string; disabled?: boolean }): HTMLElement {
  const u = upgradeById(id)!;
  const lab = treeLabel(u.tree, run.car.body);
  const combos = comboAfter(run, id);
  const foot = el('span', 'rg-tfoot', el('span', 'up-chip', `${lab.emoji} ${lab.name}`), el('span', 'up-tier', tierText(u)));
  if (o.price) foot.append(el('b', 'rg-price', o.price));
  const kids: (Node | null)[] = [el('span', 'rg-tem', u.emoji), el('span', 'rg-tname', u.name), el('span', 'rg-ttext', u.text), foot];
  if (combos.length) kids.push(el('span', 'rg-tag up-combo', `⭐ Kombo: ${combos.map((c) => c.name).join(', ')}`));
  const cls = `rg-tcard up-card${u.cap ? ' r-legendary' : u.tier >= 2 ? ' r-rare' : ''}`;
  const card = o.onClick ? btn(cls, kids, o.onClick) : el('div', cls, ...kids);
  card.style.setProperty('--tc', TREE_COLOR[u.tree]);
  if (o.disabled && card instanceof HTMLButtonElement) card.disabled = true;
  return card;
}

// ---------------------------------------------------------------------------
// The tree panel
// ---------------------------------------------------------------------------

type TabId = TreeKey | 'combos';

export interface TreePanelOpts {
  /** `view` only reads (the Bygget screen); `buy` takes nodes (the workshop). */
  mode: 'view' | 'buy';
  onBuy?(id: string): void;
}

// the tab and the node a player looked at last stay across redraws (the screen is rebuilt after every purchase)
let lastTab: TabId | null = null;
let lastSel: string | null = null;

const tabsFor = (run: RunState): TabId[] => [...TREES, 'car', 'combos'];

function nodeState(run: RunState, u: UpgradeDef): 'taken' | 'open' | 'locked' {
  if (run.up.includes(u.id)) return 'taken';
  return canTake(run.up, u.id, run.car.body) ? 'open' : 'locked';
}

export function treePanel(run: RunState, o: TreePanelOpts): HTMLElement {
  const body = run.car.body;
  // the first tab: the tree walked furthest, else the one looked at last, else Ram
  const walked = [...TREES].sort((a, b) => treeCount(run.up, b) - treeCount(run.up, a))[0]!;
  let tab: TabId = lastTab ?? (treeCount(run.up, walked) > 0 ? walked : 'ram');
  let sel: string | null = lastSel && upgradeById(lastSel) ? lastSel : null;
  const root = el('div', `up-panel up-${o.mode}`);
  const tabs = el('div', 'up-tabs');
  tabs.setAttribute('role', 'tablist');
  const content = el('div', 'up-body');
  const detail = el('div', 'up-detail');
  root.append(tabs, content, detail);

  const count = (t: TabId): string => {
    if (t === 'combos') return `${activeCombos({ owned: run.trinkets, ups: run.up }).length}`;
    const total = treeLines(t, body).reduce((a, l) => a + l.tiers.length, 0);
    return `${treeCount(run.up, t)}/${total}`;
  };

  const drawDetail = (): void => {
    detail.replaceChildren();
    const u = sel ? upgradeById(sel) : null;
    detail.classList.toggle('has', !!u && tab !== 'combos');
    if (!u || tab === 'combos') {
      detail.append(el('span', 'up-hint', o.mode === 'buy' ? 'Tryck på en uppgradering för att läsa om den.' : 'Tryck på en uppgradering för att läsa om den. Fyllda är dina.'));
      return;
    }
    const st = nodeState(run, u);
    const lab = treeLabel(u.tree, body);
    const kids: (Node | null)[] = [
      el('span', 'up-d-i', u.emoji),
      el('div', 'up-d-t', el('b', null, `${u.name} `, el('small', null, `${lab.emoji} ${lab.name} · ${tierText(u)}`)), el('span', null, u.text)),
    ];
    const act = el('div', 'up-d-a');
    if (st === 'taken') act.append(el('span', 'up-ok', '✔ Din'));
    else if (st === 'locked') act.append(el('span', 'up-why', `🔒 ${lockedWhy(run.up, u.id, body)}`));
    else if (o.mode === 'buy') {
      const free = workshopFree(run, u.id);
      const price = free ? 0 : upgradePrice(run, u.id);
      const poor = run.kronor < price;
      const b = btn('rg-go up-take', free ? 'Ta gratis' : poor ? `${price} kr (för dyr)` : `Köp ${price} kr`, () => o.onBuy?.(u.id));
      b.disabled = poor;
      act.append(b);
    } else act.append(el('span', 'up-open', 'Öppen: dyker upp efter en vinst eller i Skruvhörnan'));
    const combos = st === 'open' ? comboAfter(run, u.id) : [];
    if (combos.length) act.append(el('span', 'up-combo-tag', `⭐ Kombo: ${combos.map((c) => c.name).join(', ')}`));
    detail.append(...kids.filter((k): k is Node => !!k), act);
  };

  const nodeBtn = (u: UpgradeDef): HTMLElement => {
    const st = nodeState(run, u);
    const color = TREE_COLOR[u.tree];
    let sub = '';
    if (st === 'taken') sub = '✔';
    else if (st === 'locked') sub = '🔒';
    else if (o.mode === 'buy') sub = workshopFree(run, u.id) ? 'GRATIS' : `${upgradePrice(run, u.id)} kr`;
    else sub = 'öppen';
    const b = btn(`up-node st-${st}${u.cap ? ' cap' : ''}${sel === u.id ? ' sel' : ''}`, [el('i', null, u.cap ? '👑' : ROMAN[u.tier]!), el('span', 'up-nn', u.name), el('small', null, sub)], () => {
      sel = u.id;
      lastSel = u.id;
      draw();
    });
    b.style.setProperty('--tc', color);
    b.setAttribute('aria-pressed', String(sel === u.id));
    b.setAttribute('aria-label', `${u.name}, ${tierText(u)}, ${st === 'taken' ? 'tagen' : st === 'open' ? 'öppen' : 'låst'}`);
    return b;
  };

  const drawCombos = (): HTMLElement => {
    const list = el('div', 'up-combos');
    const act = new Set(activeCombos({ owned: run.trinkets, ups: run.up }).map((c) => c.id));
    const ordered = [...COMBOS].sort((a, b) => Number(act.has(b.id)) - Number(act.has(a.id)));
    list.append(el('p', 'up-treetext', `Ha båda halvorna och kombon vaknar. ${act.size} av ${COMBOS.length} aktiva.`));
    for (const c of ordered) {
      const on = act.has(c.id);
      list.append(
        el('div', `up-combocard${on ? ' on' : ''}`, el('span', 'up-c-i', c.emoji), el('div', null, el('b', null, c.name, on ? el('em', null, ' · AKTIV') : null), el('span', null, c.text), el('small', null, `${reqName(c.a)}  +  ${reqName(c.b)}`))),
      );
    }
    return list;
  };

  const drawBody = (): void => {
    content.replaceChildren();
    if (tab === 'combos') {
      content.append(drawCombos());
      return;
    }
    const info = tab === 'car' ? { text: `${CAR_BODY_NAMES[body]}: två uppgraderingar av ${kitOf(body).active.name}.` } : TREE_INFO[tab];
    content.append(el('p', 'up-treetext', info.text, tab !== 'car' ? el('small', null, ` Toppen öppnas efter ${CAPSTONE_NEEDS} noder i trädet.`) : null));
    const lines = treeLines(tab, body);
    for (const l of lines) {
      const row = el('div', `up-line${l.cap ? ' cap' : ''}`);
      row.style.setProperty('--tc', TREE_COLOR[l.tree]);
      row.append(el('div', 'up-lh', el('span', 'up-le', l.emoji), el('b', null, l.name)));
      const tiers = el('div', 'up-tiers');
      l.tiers.forEach((_t, i) => tiers.append(nodeBtn(upgradeById(nodeId(l.id, i + 1))!)));
      row.append(tiers);
      content.append(row);
    }
  };

  const draw = (): void => {
    tabs.replaceChildren(
      ...tabsFor(run).map((t) => {
        const lab = t === 'combos' ? { name: 'Kombos', emoji: '⭐' } : treeLabel(t, body);
        const b = btn('up-tab', [el('span', 'up-te', lab.emoji), el('span', 'up-tn', lab.name), el('small', null, count(t))], () => {
          tab = t;
          lastTab = t;
          if (sel && upgradeById(sel)?.tree !== t) sel = null;
          draw();
        });
        if (t !== 'combos') b.style.setProperty('--tc', TREE_COLOR[t]);
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(tab === t));
        b.setAttribute('aria-pressed', String(tab === t));
        return b;
      }),
    );
    // the body keeps its scroll position across a redraw
    const top = content.scrollTop;
    drawBody();
    content.scrollTop = top;
    drawDetail();
  };
  if (tab !== 'combos' && sel && upgradeById(sel)?.tree !== tab) sel = null;
  draw();
  return root;
}

// ---------------------------------------------------------------------------
// The Bygget screen
// ---------------------------------------------------------------------------

/** A bar of the build by path (the same split as the result screen). */
function mixBar(run: RunState): HTMLElement {
  const mix = buildMix(run);
  const bar = el('div', 'up-mix');
  if (!mix.length) {
    bar.append(el('span', 'up-mix-empty', 'Ingenting än. Vinn ett lopp!'));
    return bar;
  }
  for (const m of mix) {
    const seg = el('span', 'up-seg', m.pct >= 14 ? `${m.emoji} ${m.pct} %` : m.emoji);
    seg.style.flexGrow = String(m.pct);
    seg.style.setProperty('--tc', TREE_COLOR[m.path as TreeKey] ?? '#9aa0a8');
    seg.title = `${m.name} ${m.pct} %`;
    bar.append(seg);
  }
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', mix.map((m) => `${m.pct} % ${m.name}`).join(', '));
  return bar;
}

export function buildScreen(run: RunState, o: { onClose(): void }): HTMLElement {
  const left = el('div', 'up-left', el('div', 'up-preview'), mixBar(run), el('small', 'up-vehicle', `${kitOf(run.car.body).active.emoji} ${CAR_BODY_NAMES[run.car.body]} · ${run.up.length} ${run.up.length === 1 ? 'uppgradering' : 'uppgraderingar'}`));
  const right = treePanel(run, { mode: 'view' });
  const close = btn('rg-icon wide up-close', '← Till kartan', o.onClose);
  return el('div', 'rg-screen up-build', statusBar(run, close), el('div', 'up-buildbody', left, right));
}

export type { TreeId };
