// The run screens, as plain DOM builders: each takes the data and callbacks it needs and returns the
// element for the card. No state lives here; the App decides what happens on each press.
import { CAR_BODIES, CAR_PAINTS, HELMET_DESIGNS, HELMET_NAMES, carStars, newCar, type CarBody, type CarStyle } from '../shared/rally.ts';
import type { StyleBook } from '../run/styles.ts';
import { CAR_BODY_NAMES, CAR_BODY_TEXT, RALLY_COURSE_NAMES } from '../shared/names.ts';
import { NAME_MAX, displayName, nameOk, nameProblem, suggestRallyName, tidyName } from '../shared/rallyname.ts';
import { helmetSvg } from './helmet.ts';
import { trickFor } from '../run/plan.ts';
import { ARCHETYPE_EMOJI, ARCHETYPE_NAMES, ARCHETYPE_TEXT } from '../shared/rivals.ts';
import { BOSS_RULES, archetypeCounts, rivalModById } from '../shared/field.ts';
import { rivalById } from '../shared/rivals.ts';
import { KIND_EMOJI, KIND_NAMES, KIND_TEXT, PLACE_POINTS, RACE_KINDS, TAKEDOWN_POINTS } from '../shared/kinds.ts';
import { RALLY_COURSE_DEFS } from '../shared/rally.ts';
import { fmtTime } from '../rally/util.ts';
import { ACTS, NODE_EMOJI, NODE_NAMES, allNodes, nodeEmoji, type MapNode, type NodeType } from '../run/map.ts';
import { ARENAS, DERBY_EMOJI, DERBY_NAME, DERBY_SECONDS, DERBY_TEXT } from '../shared/derby.ts';
import type { Meta } from '../run/meta.ts';
import { MEDALS, earned, medalCount, progressText } from '../run/medals.ts';
import { parseSeedCode, seedLabelOf } from '../run/seedcode.ts';
import { LEANS, LEAN_EMOJI, LEAN_NAMES, LEAN_TEXT, kitOf, type Lean } from '../shared/abilities.ts';
import { healPrice, repairPrice, rerollPrice, trinketPrice, upgradePrice, workshopFree } from '../run/economy.ts';
import { NODE_RISE, upgradeById } from '../run/upgrades.ts';
import { EVENTS, choiceAllowed, eventById } from '../run/events.ts';
import { currentNode, currentPlan } from '../run/flow.ts';
import { DIFFICULTIES, DIFFS, diffOf, heartRuleText, type Difficulty } from '../run/difficulty.ts';
import { mapOf, reachable, type RewardGrade, type RunState, type Screen } from '../run/state.ts';
import { TRINKETS, trinketById } from '../run/trinkets.ts';
import { btn, el, plural } from './dom.ts';
import { treeLabel, upgradeCard } from './upgrades.ts';
import { ACT_NAMES, arrowSvg, chip, seedChip, statusBar, trinketCard, trinketIcons } from './parts.ts';
import { countUp } from './juice.ts';
import type { Settings } from '../settings.ts';
import { SCHEMES, SCHEME_NAMES, SCHEME_TEXT, SIZES, SIZE_NAMES, isManual, type ControlPrefs, type Scheme } from '../controls.ts';
import type { RunEnd } from '../run/state.ts';

const screen = (cls: string, ...kids: (Node | null)[]): HTMLElement => el('div', `rg-screen ${cls}`, ...kids.filter((k): k is Node => !!k));
const foot = (...kids: Node[]): HTMLElement => el('div', 'rg-foot', ...kids);
const go = (label: string, onClick: () => void, cls = ''): HTMLButtonElement => btn(`rg-go ${cls}`.trim(), label, onClick);
const ghost = (label: string, onClick: () => void): HTMLButtonElement => btn('rg-btn', label, onClick);

// ---- title ----

export interface TitleOpts {
  meta: Meta;
  saved: RunState | null;
  onNew(): void;
  onContinue(): void;
  onQuick(): void;
  /** The styling garage, on the vehicle picked last. */
  onGarage(): void;
  /** How the vehicle picked last looks (the helmet beside the name). */
  style: CarStyle;
  onCollection(): void;
  onSettings(): void;
  /** A line of help for phones that cannot go fullscreen by themselves (iPhone in Safari). */
  homeHint?: boolean;
}

export function titleView(o: TitleOpts): HTMLElement {
  const newBtn = btn('rg-btn' + (o.saved ? '' : ' rg-big'), '🏁 Ny runda');
  let armed: ReturnType<typeof setTimeout> | null = null;
  newBtn.addEventListener('click', () => {
    if (!o.saved || armed) {
      if (armed) clearTimeout(armed);
      o.onNew();
      return;
    }
    newBtn.textContent = 'Tryck igen. Gamla rundan dör.';
    newBtn.classList.add('warn');
    armed = setTimeout(() => {
      armed = null;
      newBtn.textContent = '🏁 Ny runda';
      newBtn.classList.remove('warn');
    }, 3500);
  });
  const left = el(
    'div',
    'rg-title-left',
    el('h1', 'arc-title', 'Galna Rallyt'),
    el('p', 'arc-sub', 'Ingen runda blir den andra lik. Samla galna talismaner. Krossa bossarna.'),
    el('div', 'rg-deco', ...['🏎️', '🎲', '🌭', '🪩', '⛑️'].map((e) => el('span', null, e))),
    o.meta.name ? el('div', 'rg-whoami', helmetSvg({ color: o.style.helmetColor || o.style.paint, trim: '#f2f2f2', design: o.style.helmet, cls: 'rg-whoami-h' }), el('span', null, 'Förare: ', el('b', null, displayName(o.meta)))) : null,
    el('div', 'rg-diffnote', `${diffOf(o.meta.diff).emoji} Svårighet: `, el('b', null, diffOf(o.meta.diff).name), el('small', null, ' (välj när du startar en runda)')),
    el('div', 'rg-trophy', `🏆 ${o.meta.trophies}`, el('small', null, o.meta.runs ? ` · ${plural(o.meta.runs, 'runda', 'rundor')} krossade` : ' · inga rundor än. Visa vad du går för.')),
  );
  const right = el('div', 'rg-title-right');
  if (o.saved) {
    const s = o.saved;
    right.append(
      go('▶ Fortsätt runda', o.onContinue, 'rg-continue'),
      el('div', 'rg-saveinfo', `Akt ${s.act + 1}/${ACTS} · ${s.hearts}/${s.maxHearts} ❤️ · ${s.kronor} kr · ${plural(s.trinkets.reduce((a, t) => a + t.n, 0), 'talisman', 'talismaner')}`),
    );
  }
  right.append(el('div', 'rg-newwrap', arrowSvg('rg-arrow'), newBtn), el('div', 'rg-pair', ghost('⚡ Snabbrace', o.onQuick), ghost('🎨 Garaget', o.onGarage)), el('div', 'rg-pair', ghost('📖 Skrytlådan', o.onCollection), ghost('⚙️ Inställningar', o.onSettings)));
  if (o.homeHint) right.append(el('small', 'rg-homehint', 'Fusktips: Dela, sedan Lägg till på hemskärmen. Ingen webbläsarkant.'));
  return screen('rg-title', left, right);
}

// ---- pick the car and the helmet ----

export interface PickSel {
  diff: Difficulty;
  /** The vehicle; its paint, helmet and the rest of its look come from the garage's StyleBook. */
  body: CarBody;
  /** A typed seed ("Eget frö"); left out, the run gets a random one. */
  seed?: number;
}

/** The stars of a vehicle's stats, the lean, passive, active and starting talisman. Every vehicle is open from the start. */
export function kitCard(body: CarBody): HTMLElement {
  const k = kitOf(body);
  const st = carStars(newCar(1, body, ''));
  const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);
  const t = trinketById(k.trinket);
  const kids: Node[] = [];
  kids.push(
    el('div', 'rg-kit-head', el('span', `rg-lean lean-${k.lean}`, `${LEAN_EMOJI[k.lean]} ${LEAN_NAMES[k.lean]}`), el('small', null, LEAN_TEXT[k.lean]), el('span', 'rg-kit-text', CAR_BODY_TEXT[body])),
    el('div', 'rg-kit-stars', el('span', null, `Fart ${stars(st.speed)}`), el('span', null, `Grepp ${stars(st.grip)}`), el('span', null, `Hållbarhet ${stars(st.tough)}`)),
    el('div', 'rg-kit-grid',
      el('div', 'rg-kit-row', el('span', 'rg-kit-k', 'Passiv'), el('div', null, el('b', null, k.passive.name), el('small', null, k.passive.text))),
      el('div', 'rg-kit-row', el('span', 'rg-kit-k act', 'Aktiv'), el('div', null, el('b', null, `${k.active.emoji} ${k.active.name}`, el('em', null, ` · ${k.active.cooldown} s`)), el('small', null, k.active.text))),
      el('div', 'rg-kit-row', el('span', 'rg-kit-k', 'Starttalisman'), el('div', null, el('b', null, `${t?.emoji ?? '🎁'} ${t?.name ?? k.trinket}`), el('small', null, t?.text ?? ''))),
    ),
  );
  return el('div', 'rg-kit', ...kids);
}

export function pickView(meta: Meta, sel: PickSel, book: StyleBook, o: { onChange(s: PickSel): void; onStart(s: PickSel): void; onBack(): void; onGarage(): void }): HTMLElement {
  /** The look of the vehicle picked now (paint and helmet are changed in place here, the garage does the rest). */
  const look = (): CarStyle => book[sel.body];
  const restyle = (patch: Partial<CarStyle>): void => {
    book[sel.body] = { ...look(), ...patch };
  };
  const bodies = el('div', 'rg-row');
  const helmets = el('div', 'rg-row rg-helmrow');
  const paints = el('div', 'rg-row');
  // built once, only the pressed state changes (so keyboard focus stays where it is)
  const pressed: [HTMLElement, () => boolean][] = [];
  const desc = el('div', 'rg-bodydesc');
  let applyFilterLater = (): void => {};
  // a typed seed: collapsed behind a small link, checked as it is typed (a wrong one stops the start with a friendly line)
  const seedInput = el('input', 'rg-seedin');
  seedInput.type = 'text';
  seedInput.placeholder = 'KOSSA-4821';
  seedInput.maxLength = 24;
  seedInput.autocomplete = 'off';
  seedInput.spellcheck = false;
  seedInput.setAttribute('autocapitalize', 'characters');
  seedInput.setAttribute('autocorrect', 'off');
  seedInput.setAttribute('aria-label', 'Eget frö');
  const seedMsg = el('p', 'rg-seedmsg');
  seedMsg.setAttribute('role', 'status');
  const checkSeed = (loud: boolean): boolean => {
    const text = seedInput.value;
    seedMsg.className = 'rg-seedmsg';
    if (!text.trim()) {
      sel.seed = undefined;
      seedMsg.textContent = loud ? '' : 'Lämna tomt för en slumpad runda. Samma kod och svårighet ger exakt samma runda för alla.';
      return true;
    }
    const r = parseSeedCode(text);
    if (r.ok) {
      sel.seed = r.seed;
      seedMsg.textContent = `✅ ${r.code}: samma kod och svårighet ger samma karta, banor och erbjudanden.`;
      seedMsg.classList.add('ok');
      return true;
    }
    sel.seed = undefined;
    seedMsg.textContent = r.message;
    seedMsg.classList.add('bad');
    return false;
  };
  seedInput.addEventListener('input', () => {
    checkSeed(true);
    o.onChange(sel);
  });
  const seedBox = el('div', 'rg-seedbox', el('label', 'rg-seedlab', 'Eget frö', seedInput), seedMsg);
  seedBox.hidden = true;
  const seedLink = btn('rg-seedlink', '🌱 Frö', () => {
    seedBox.hidden = !seedBox.hidden;
    seedLink.setAttribute('aria-expanded', String(!seedBox.hidden));
    if (!seedBox.hidden) {
      checkSeed(false);
      seedInput.focus({ preventScroll: true });
    }
  });
  seedLink.setAttribute('aria-expanded', 'false');
  const start = go('Kör!', () => {
    if (seedInput.value.trim() && !checkSeed(true)) {
      seedBox.hidden = false;
      seedLink.setAttribute('aria-expanded', 'true');
      seedInput.focus({ preventScroll: true });
      return;
    }
    o.onStart(sel);
  });
  let describe = (): void => {
    desc.replaceChildren(kitCard(sel.body));
  };
  const pick = (b: HTMLElement, isOn: () => boolean, set: () => void): void => {
    b.addEventListener('click', () => {
      set();
      pressed.forEach(([x, on]) => x.setAttribute('aria-pressed', String(on())));
      describe();
      applyFilterLater();
      o.onChange(sel);
    });
    pressed.push([b, isOn]);
    b.setAttribute('aria-pressed', String(isOn()));
  };
  // twenty vehicles: a filter on the lean (Alla, Ram, Race, Blandat) over a grid you can scroll
  type LeanFilter = 'all' | Lean;
  let filter: LeanFilter = 'all';
  const chips: [CarBody, HTMLElement][] = [];
  const applyFilter = (): void => {
    for (const [b, x] of chips) x.hidden = filter !== 'all' && kitOf(b).lean !== filter && sel.body !== b;
  };
  const filterRow = el('div', 'rg-filter');
  filterRow.setAttribute('role', 'group');
  filterRow.setAttribute('aria-label', 'Visa fordon');
  const filters: [LeanFilter, string][] = [['all', 'Alla'], ...LEANS.map((l): [LeanFilter, string] => [l, `${LEAN_EMOJI[l]} ${LEAN_NAMES[l]}`])];
  const filterBtns: [HTMLElement, LeanFilter][] = [];
  for (const [f, label] of filters) {
    const x = btn('rg-chipbtn rg-filterbtn', label);
    x.setAttribute('aria-pressed', String(f === filter));
    x.addEventListener('click', () => {
      filter = f;
      for (const [fb, ff] of filterBtns) fb.setAttribute('aria-pressed', String(ff === f));
      applyFilter();
    });
    filterBtns.push([x, f]);
    filterRow.append(x);
  }
  bodies.className = 'rg-bodygrid';
  for (const b of CAR_BODIES) {
    const name = CAR_BODY_NAMES[b];
    const x = btn(`rg-chipbtn${name.length >= 11 ? ' long' : ''}`, name);
    x.append(el('small', null, `${LEAN_EMOJI[kitOf(b).lean]} ${LEAN_NAMES[kitOf(b).lean]}`));
    pick(x, () => sel.body === b, () => (sel.body = b));
    x.addEventListener('click', () => x.scrollIntoView?.({ inline: 'center', block: 'nearest' }));
    chips.push([b, x]);
    bodies.append(x);
  }
  applyFilterLater = applyFilter;
  // the helmet: eight patterns (each button shows the pattern in the helmet's colour as it is now)
  const helmBtns: [HTMLElement, (typeof HELMET_DESIGNS)[number]][] = [];
  const drawHelmets = (): void => {
    for (const [b, d] of helmBtns) b.replaceChildren(helmetSvg({ color: look().helmetColor || look().paint, trim: '#f2f2f2', design: d }));
  };
  for (const d of HELMET_DESIGNS) {
    const x = btn('rg-chipbtn rg-helmbtn', '');
    x.setAttribute('aria-label', `Hjälm: ${HELMET_NAMES[d]}`);
    x.title = HELMET_NAMES[d];
    pick(x, () => look().helmet === d, () => restyle({ helmet: d }));
    helmBtns.push([x, d]);
    helmets.append(x);
  }
  // the colours: one row that paints the car or the helmet, whichever of the two buttons in front is pressed
  let paintFor: 'car' | 'helmet' = 'car';
  const paintBtns: [HTMLElement, 'car' | 'helmet'][] = [];
  const swatches: [HTMLElement, 'car' | 'helmet'][] = [];
  const showSwatches = (): void => {
    for (const [b, w] of paintBtns) b.setAttribute('aria-pressed', String(paintFor === w));
    for (const [x, w] of swatches) x.hidden = w !== paintFor;
  };
  for (const [w, label] of [['car', '🚗 Bil'], ['helmet', '⛑️ Hjälm']] as const) {
    const x = btn('rg-chipbtn rg-paintfor', label, () => {
      paintFor = w;
      showSwatches();
    });
    paintBtns.push([x, w]);
    paints.append(x);
  }
  for (const c of CAR_PAINTS.slice(0, 12)) {
    const x = btn('rg-swatch', '');
    x.style.background = c;
    x.setAttribute('aria-label', `Bilfärg ${c}`);
    pick(x, () => look().paint === c, () => restyle({ paint: c }));
    swatches.push([x, 'car']);
    paints.append(x);
  }
  // "som bilen": the helmet in the car's own paint
  const same = btn('rg-swatch rg-same', '🚗');
  same.setAttribute('aria-label', 'Hjälmen i bilens färg');
  pick(same, () => !look().helmetColor, () => restyle({ helmetColor: '' }));
  swatches.push([same, 'helmet']);
  paints.append(same);
  for (const c of CAR_PAINTS.slice(0, 12)) {
    const x = btn('rg-swatch', '');
    x.style.background = c;
    x.setAttribute('aria-label', `Hjälmfärg ${c}`);
    pick(x, () => look().helmetColor === c, () => restyle({ helmetColor: c }));
    swatches.push([x, 'helmet']);
    paints.append(x);
  }
  showSwatches();
  drawHelmets();
  const describeBase = describe;
  describe = (): void => {
    describeBase();
    drawHelmets();
  };
  describe();
  // the difficulty: four buttons and the one-line rule of the chosen one (remembered as the default for next time)
  const diffRow = el('div', 'rg-diffs');
  diffRow.setAttribute('role', 'group');
  diffRow.setAttribute('aria-label', 'Svårighet');
  const diffLine = el('p', 'rg-diffline');
  const diffBtns: [HTMLElement, Difficulty][] = [];
  const drawDiff = (): void => {
    for (const [b, d] of diffBtns) b.setAttribute('aria-pressed', String(sel.diff === d));
    diffLine.textContent = diffOf(sel.diff).blurb;
    diffLine.className = `rg-diffline d-${sel.diff}`;
  };
  for (const d of DIFFICULTIES) {
    const def = DIFFS[d];
    const x = btn(`rg-chipbtn rg-diffbtn d-${d}`, [el('span', 'rg-dn', `${def.emoji} ${def.name}`), el('small', null, `${def.hearts} ❤️`)], () => {
      sel.diff = d;
      drawDiff();
      o.onChange(sel);
    });
    diffBtns.push([x, d]);
    diffRow.append(x);
  }
  drawDiff();
  return screen(
    'rg-pick',
    el('h2', 'rg-h', 'Välj svårighet, bil och hjälm'),
    el('div', 'rg-diffbox', diffRow, diffLine),
    el(
      'div',
      'rg-pickbody',
      el('div', 'arc-preview rg-preview'),
      el('div', 'rg-picks', el('div', 'arc-h rg-subh', `Bil · ${CAR_BODIES.length} fordon`), filterRow, bodies, desc, el('div', 'arc-h rg-subh', 'Hjälm'), helmets, el('div', 'arc-h rg-subh', 'Färg (mer i 🎨 Styla)'), paints),
    ),
    seedBox,
    foot(ghost('← Tillbaka', o.onBack), seedLink, ghost('🎨 Styla', o.onGarage), start),
  );
}

// ---- the map ----

export interface MapOpts {
  run: RunState;
  onEnter(id: string): void;
  onBag(): void;
  onBuild(): void;
  onMenu(): void;
}

const nodeLabel = (n: MapNode): string => {
  const kind = n.kind ? ` · ${KIND_NAMES[n.kind]}` : '';
  if (n.derby) return `${DERBY_NAME} · ${ARENAS[n.derby].name}${n.type === 'boss' ? ' · Bossen' : n.type === 'elite' ? ' · Dödslopp' : ''}${kind}`;
  if (n.type === 'boss') return `Bossen. Den är sur.${kind}`;
  if (n.course && n.type !== 'shop') return `${NODE_NAMES[n.type]} · ${RALLY_COURSE_NAMES[n.course]}${kind}`;
  return NODE_NAMES[n.type];
};

/** A button for the map's top bar: a picture and a word; on a narrow screen only the picture (the word stays as its name). */
function iconBtn(emoji: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = btn('rg-icon wide', [el('span', null, emoji), el('span', 'rg-bt', ` ${label}`)], onClick);
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}

export function mapView(o: MapOpts): HTMLElement {
  const run = o.run;
  const m = mapOf(run);
  const reach = new Set(reachable(run).map((n) => n.id));
  const done = new Set(run.path);
  const cols = m.rows.length;
  const pos = (n: MapNode): { x: number; y: number } => {
    // a little deterministic wobble so the map feels hand-drawn
    const j = ((n.seed >>> 5) % 100) / 100 - 0.5;
    return { x: ((n.row + 0.5) / cols) * 100, y: ((n.col + 0.5) / n.of) * 100 + (n.row === cols - 1 ? 0 : j * (26 / n.of)) };
  };
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'rg-links');
  const field = el('div', 'rg-map');
  const nodes = allNodes(m);
  for (const n of nodes) {
    for (const id of n.next) {
      const t = nodes.find((x) => x.id === id)!;
      const a = pos(n);
      const b = pos(t);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
      const walked = done.has(n.id) && (done.has(t.id) || reach.has(t.id));
      const live = n.id === run.at && reach.has(t.id);
      line.setAttribute('class', walked || live ? (live ? 'live' : 'walked') : '');
      svg.append(line);
    }
  }
  if (run.at === null) {
    // the start: roads in from the left edge to the first row
    for (const n of m.rows[0]!) {
      const b = pos(n);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', '50');
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
      line.setAttribute('class', 'live');
      svg.append(line);
    }
  }
  field.append(svg);
  if (run.at === null) field.append(el('span', 'rg-start', 'START'));
  for (const n of nodes) {
    const p = pos(n);
    const can = reach.has(n.id);
    const cls = ['rg-node', `t-${n.type}`, n.derby ? 'derby' : '', can ? 'reach' : '', done.has(n.id) ? 'done' : '', n.id === run.at ? 'here' : '', !can && !done.has(n.id) ? 'far' : ''].filter(Boolean).join(' ');
    const b = btn(cls, [el('span', 'rg-ne', nodeEmoji(n)), n.kind ? el('span', `rg-kb k-${n.kind}`, KIND_EMOJI[n.kind]) : null, n.derby ? el('span', 'rg-derby', 'DERBY') : null, done.has(n.id) ? el('span', 'rg-tick', '✔') : null], () => o.onEnter(n.id));
    b.style.left = `${p.x}%`;
    b.style.top = `${p.y}%`;
    b.disabled = !can;
    b.title = nodeLabel(n);
    b.setAttribute('aria-label', nodeLabel(n));
    field.append(b);
  }
  const legend = el('div', 'rg-legend');
  for (const t of ['race', 'challenge', 'elite', 'shop', 'workshop', 'event', 'boss'] as NodeType[]) legend.append(el('span', null, `${NODE_EMOJI[t]} ${NODE_NAMES[t]}`));
  if (nodes.some((n) => n.derby)) legend.append(el('span', 'rg-lg-derby', `${DERBY_EMOJI} ${DERBY_NAME}`, el('small', null, ' arena, mest poäng vinner')));
  const kinds = el('div', 'rg-legend rg-kinds', ...RACE_KINDS.map((k) => el('span', `k-${k}`, `${KIND_EMOJI[k]} ${KIND_NAMES[k]}`, el('small', null, k === 'rally' ? ' ren racing' : k === 'mixed' ? ' racing med knuffar' : ' vrak och poäng'))));
  const menu = btn('rg-icon', '☰', o.onMenu);
  menu.setAttribute('aria-label', 'Meny');
  return screen(
    'rg-mapscreen',
    statusBar(
      run,
      run.interest ? el('span', 'rg-interest', `🏦 +${run.interest}`, el('span', 'rg-bt', ' kr ränta')) : null,
      iconBtn('🧰', 'Bygget', o.onBuild),
      iconBtn('🎒', 'Talismanerna', o.onBag),
      menu,
    ),
    field,
    legend,
    kinds,
    el('div', 'rg-maphint', arrowSvg('rg-arrow sm'), run.at === null ? 'Välj en glödande plats. Börja nånstans.' : 'Nästa stopp: en glödande plats.', seedChip(run.seed)),
  );
}

// ---- before the race ----

/** Two letters for a helmet: the first letters of the first two parts of a name ("Golf-Göran" gives GG, "Tina Kartörner" TK). */
export function initialsOf(name: string): string {
  const parts = name.split(/[\s-]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

export function preraceView(run: RunState, o: { onGo(): void; onBack(): void; name?: string }): HTMLElement {
  const plan = currentPlan(run)!;
  const node = currentNode(run)!;
  const r = plan.rules;
  const kind = plan.kind;
  const arena = plan.arena ? ARENAS[plan.arena] : null;
  const chips = [
    chip(`${KIND_EMOJI[kind]} ${KIND_NAMES[kind]}`, `k-${kind}`),
    arena ? chip(`${arena.emoji} ${arena.name}`) : chip(`${RALLY_COURSE_DEFS[plan.course].emoji} ${RALLY_COURSE_NAMES[plan.course]}`),
    arena ? chip(`⏱️ ${Math.floor(DERBY_SECONDS / 60)}:${String(DERBY_SECONDS % 60).padStart(2, '0')} på klockan`) : chip(`🔁 ${plural(r.laps, 'varv', 'varv')}`),
    chip(`🏎️ ${plural(r.ai, 'rival', 'rivaler')}`),
    r.weather === 'rain' ? chip('🌧️ Regn') : null,
    r.time === 'night' ? chip('🌙 Natt') : r.time === 'sunset' ? chip('🌇 Solnedgång') : null,
    r.difficulty === 'hard' ? chip('💀 Hårt') : r.difficulty === 'easy' ? chip('🛋️ Söndagsåkning') : null,
    !arena && plan.field.hazards.oil + plan.field.hazards.hay + plan.field.hazards.pothole > 0 ? chip('🛢️ Hinder på vägen') : null,
    !arena && plan.field.narrow < 1 ? chip('↔️ Smal väg') : null,
    chip(`${kitOf(run.car.body).active.emoji} ${kitOf(run.car.body).active.name} (F)`),
  ].filter((x): x is HTMLElement => !!x);
  // the rivals as collector cards: a portrait, the name, how they drive, three stats and a quote
  const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);
  const rate = (x: number, lo: number, hi: number): number => 1 + Math.round(Math.max(0, Math.min(1, (x - lo) / (hi - lo))) * 4);
  const rivals = el('div', 'rg-deck');
  const talkers: { name: string; talk: string }[] = [];
  // you first: your helmet, your name, the car's stars
  {
    const you = o.name || 'Du';
    const cs = carStars(run.car);
    const st = run.car.style;
    rivals.append(
      el(
        'div',
        'rg-ccard rg-you',
        el('div', 'rg-cport', helmetSvg({ color: st.helmetColor || st.paint, trim: st.paint2, design: st.helmet, initials: initialsOf(you), shoulders: true, cls: 'rg-chelm' }), el('b', 'rg-cno', '#1')),
        el('div', 'rg-cname', you),
        el('div', 'rg-arch rg-yourtag', '🧑 Du'),
        el('div', 'rg-cstats', el('span', null, 'Fart', el('i', null, stars(cs.speed))), el('span', null, 'Grepp', el('i', null, stars(cs.grip))), el('span', null, 'Hållbarhet', el('i', null, stars(cs.tough)))),
        el('p', 'rg-cquote', `”${CAR_BODY_NAMES[run.car.body]}. Dagens mål: kom först.”`),
      ),
    );
  }
  plan.field.rivals.forEach((sp, ix) => {
    const boss = sp.boss ? plan.twist?.boss : undefined;
    const rv = sp.boss ? undefined : rivalById(sp.id);
    if (rv) talkers.push({ name: rv.name, talk: rv.talk });
    const icons = el('span', 'rg-mods');
    for (const id of sp.mods) {
      const m = rivalModById(id);
      if (m) icons.append(Object.assign(el('i', 'rg-mod', m.emoji), { title: `${m.name}: ${m.text}` }));
    }
    const portrait = boss
      ? helmetSvg({ color: boss.color, trim: boss.trim, design: boss.helmet, initials: initialsOf(boss.name), shoulders: true, cls: 'rg-chelm' })
      : helmetSvg({ color: rv?.colors[0] ?? '#888888', trim: rv?.colors[1] ?? '#ffffff', design: rv?.helmet ?? 'stripe', initials: rv?.initials ?? '??', shoulders: true, cls: 'rg-chelm' });
    const quote = sp.boss ? (plan.boss?.nick ?? '') : (rv?.nick ?? '');
    const card = el(
      'div',
      `rg-ccard a-${sp.archetype}${sp.boss ? ' boss' : ''}`,
      el('div', 'rg-cport', portrait, el('b', 'rg-cno', `#${ix + 2}`), sp.boss && plan.boss ? el('span', 'rg-cemoji', plan.boss.emoji) : null, icons),
      el('div', 'rg-cname', boss?.name ?? rv?.name ?? '???'),
      el('div', `rg-arch a-${sp.archetype}`, `${ARCHETYPE_EMOJI[sp.archetype]} ${ARCHETYPE_NAMES[sp.archetype]}`),
      el(
        'div',
        'rg-cstats',
        el('span', null, 'Fart', el('i', null, stars(rate(sp.power, 0.9, 1.15)))),
        el('span', null, 'Knuff', el('i', null, stars(rate(sp.aggro, 0, 1)))),
        el('span', null, 'Skärpa', el('i', null, stars(rate(sp.skill, 0.75, 1)))),
      ),
      el('p', 'rg-cquote', `”${quote}”`),
    );
    card.title = `${ARCHETYPE_NAMES[sp.archetype]}: ${ARCHETYPE_TEXT[sp.archetype]}`;
    card.style.setProperty('--tilt', `${((ix * 37) % 7) - 3}deg`);
    rivals.append(card);
  });
  const talk = talkers.length ? talkers[node.seed % talkers.length]! : null;
  const counts = archetypeCounts(plan.field);
  const info: Node[] = [
    el('div', 'rg-chips', ...chips),
    arena
      ? el('div', 'rg-kindbox rg-derbybox k-carnage', el('b', null, `${DERBY_EMOJI} ${DERBY_NAME}: `), DERBY_TEXT.replace(`${DERBY_NAME}: `, ''), el('small', null, ` Poäng: skada du gör (en hel bil är 50 p), ${TAKEDOWN_POINTS} p per vrak och ${PLACE_POINTS[0]} till 2 p för hur länge du håller. ${arena.text}`))
      : el('div', `rg-kindbox k-${kind}`, el('b', null, `${KIND_EMOJI[kind]} ${KIND_NAMES[kind]}: `), KIND_TEXT[kind], kind === 'carnage' ? el('small', null, ` Poäng: skada du gör (en hel bil är 50 p), ${TAKEDOWN_POINTS} per vrak och ${PLACE_POINTS.join('/')} för placeringen. Placeringen på poäng avgör priset och hjärtat.`) : null),
  ];
  if (plan.boss) {
    const rules = plan.field.rivals[0]?.rules.filter((x) => (x === 'lastlap' && !arena) || (x === 'regen' && kind === 'carnage')) ?? [];
    info.push(el('div', 'rg-bossbox', plan.boss.title ? el('div', 'rg-bosstitle', `${plan.boss.title}`) : null, el('div', 'rg-bossname', `${plan.boss.emoji} ${plan.boss.name}`), el('div', 'rg-bossnick', plan.boss.nick), el('p', 'rg-quote', plan.boss.intro), el('p', 'rg-bossveh', `🚗 ${plan.boss.vehicle}`), el('p', 'rg-trick', `⚠️ ${arena && plan.boss.derbyTrick ? plan.boss.derbyTrick : trickFor(plan.boss, node.seed)}`), ...rules.map((x) => el('p', 'rg-trick', `${BOSS_RULES[x].emoji} ${BOSS_RULES[x].text}`))));
  }
  if (plan.goal) info.push(el('div', 'rg-goal', '🎯 ', el('b', null, plan.goal.text), el('small', null, ' Fixar du det får du extra kronor och en talisman.')));
  if (node.type === 'elite') info.push(el('div', 'rg-goal', arena ? '💀 Dödslopp i arenan. Ger alltid ett byte, även om du inte vinner.' : '💀 Mördarrivaler. Ett dödslopp ger alltid ett byte, även om du inte vinner.'));
  info.push(
    el(
      'div',
      'rg-heartrule',
      heartRuleText(run.diff, { boss: !!plan.boss, arena: !!arena, carnage: kind === 'carnage' }),
    ),
  );
  info.push(el('div', 'rg-winhint', '🎁 Vinn och du får välja ditt byte. Tvåan får ett litet tröstpris.'));
  const mix = [counts.rammer ? `${counts.rammer}× ${ARCHETYPE_EMOJI.rammer}` : '', counts.mixed ? `${counts.mixed}× ${ARCHETYPE_EMOJI.mixed}` : '', counts.racer ? `${counts.racer}× ${ARCHETYPE_EMOJI.racer}` : ''].filter(Boolean).join('  ');
  return screen(
    'rg-pre',
    statusBar(run),
    el(
      'div',
      'rg-prebody',
      el('div', 'rg-preleft', el('div', 'rg-pretitle', el('span', 'rg-bigem', nodeEmoji(node)), el('h2', null, plan.title)), ...info),
      el('div', 'rg-preright', el('div', 'arc-h', `Motståndare  ${mix}`), rivals, talk ? el('div', 'rg-talk', el('b', null, `${talk.name}:`), ` ”${talk.talk}”`) : null, el('div', 'arc-h', 'Dina talismaner'), run.trinkets.length ? trinketIcons(run.trinkets, 12) : el('small', null, 'Inget än. Fattigt.')),
    ),
    foot(ghost('← Fega ur', o.onBack), go('KÖR! 🏁', o.onGo)),
  );
}

// ---- after the race ----

export function postraceView(run: RunState, scr: Extract<Screen, { kind: 'postrace' }>, o: { onNext(): void; onCount?: () => void }): HTMLElement {
  const s = scr.summary;
  const dv = s.derby;
  const head = dv
    ? s.place === 1
      ? '🏆 DU VANN DERBYT!'
      : s.place === s.n
        ? `${s.place}:a på poäng. Slåss mer!`
        : `${s.place}:a på poäng${dv.alive ? '' : '. Du blev utslagen'}.`
    : !s.finished
      ? 'Du kom aldrig i mål. Aj.'
      : s.place === 1
        ? '🏆 DU VANN!'
        : s.place === 2
          ? '2:a. Första förloraren.'
          : s.place === 3
            ? '3:a. Nära pallen, långt från ära.'
            : `${s.place}:a plats. Fy.`;
  const medal = s.medal ? { gold: '🥇', silver: '🥈', bronze: '🥉' }[s.medal] : '';
  const lines: Node[] = [];
  if (dv) {
    // a derby: how it ended, and the final table
    const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
    const td = s.takedowns ?? 0;
    lines.push(
      el('div', 'rg-time', `⏱️ ${clock(dv.seconds)} av ${clock(dv.limit)}${dv.timeUp ? ' · tiden tog slut' : ''}`),
      el(
        'div',
        'rg-points rg-derbyres',
        el('b', null, `🏟️ Plats ${s.place} av ${s.n} på poäng · ${s.points ?? 0} p`),
        el('small', null, ` = ${s.dealt ?? 0} för skada du gjorde + ${td} vrak × ${TAKEDOWN_POINTS} p = ${td * TAKEDOWN_POINTS} + ${PLACE_POINTS[Math.min(PLACE_POINTS.length, s.survival ?? s.n) - 1]!} för hur länge du höll${s.wrecked ? ' (du blev vrakad)' : ''}. Mest poäng vinner, inte mest hälsa.`),
      ),
      el(
        'ol',
        'rg-dtable',
        ...dv.table.map((r) =>
          el('li', `${r.me ? 'me' : ''} ${r.alive ? 'alive' : 'out'}`, el('b', null, `${r.place}.`), el('span', 'rg-dn', r.name), el('small', null, `${r.points} p · ${r.alive ? `rullade kvar · ${r.hp} % hälsa` : `ute efter ${clock(r.outAt ?? 0)}`}`), el('em', null, `🔨 ${r.dealt}${r.takedowns ? ` · 💥 ${r.takedowns}` : ''}`)),
        ),
      ),
    );
  } else if (s.finished) lines.push(el('div', 'rg-time', `⏱️ ${fmtTime(s.time / 1000)} ${medal}`));
  if (!dv && s.kind === 'carnage' && s.points !== undefined) {
    // Blodbad is decided on points: say how the points came about
    const pp = s.roadPlace ? PLACE_POINTS[Math.min(PLACE_POINTS.length, s.roadPlace) - 1]! : 0;
    const td = s.takedowns ?? 0;
    lines.push(
      el('div', 'rg-points', el('b', null, `💥 Blodbad: ${s.points} p`), el('small', null, ` = ${s.dealt ?? 0} för skada du gjorde + ${td} vrak × ${TAKEDOWN_POINTS} p = ${td * TAKEDOWN_POINTS} + ${pp} för ${s.roadPlace ?? '?'}:a plats på vägen${s.wrecked ? ` · du blev vrakad ${s.wrecked} ${s.wrecked === 1 ? 'gång' : 'gånger'}` : ''}. Plats ${s.place} av ${s.n} på poäng.`)),
    );
  }
  const kr = el('b', null, `+${s.total} kr`);
  // the kronor count up on the card
  setTimeout(() => countUp(kr, s.total, { prefix: '+', suffix: ' kr', ms: 900, tick: o.onCount }), 350);
  lines.push(
    el(
      'div',
      'rg-kronor',
      kr,
      el('small', null, ` (lopp ${s.prize}${s.coins ? ` · mynt ${s.coins}` : ''}${s.bonus ? ` · talismaner ${s.bonus}` : ''})`),
    ),
  );
  lines.push(
    s.heartLost
      ? el('div', 'rg-heartline lost', s.hearts === 2 ? '💔 −2 hjärtan' : '💔 −1 hjärta', el('small', null, run.status === 'dead' ? ' – det var sista. RIP.' : ` – ${run.hearts} kvar`))
      : el('div', 'rg-heartline', '❤️ Hjärtat klarade sig'),
  );
  // Skrotpant: wrecks buy hearts back
  if (s.scrapHearts) lines.push(el('div', 'rg-heartline', '🔩 Skrotpant: ❤️ tillbaka för vraken', el('small', null, ` (${DIFFS[run.diff].scrapEvery} vrak = ett hjärta)`)));
  else if ((s.takedowns ?? 0) > 0 && s.scrapCount !== undefined && DIFFS[run.diff].scrapEvery > 0) lines.push(el('div', 'rg-scrap', `🔩 Skrotpant: ${s.scrapCount} av ${DIFFS[run.diff].scrapEvery} vrak till nästa ❤️`));
  if (s.goal) lines.push(el('div', `rg-goal ${s.goal.met ? 'ok' : 'miss'}`, s.goal.met ? '✅ Utmaning krossad! ' : '❌ Misslyckades. Skärp dig. ', el('small', null, s.goal.text)));
  if (s.reward) lines.push(el('div', `rg-goal ${s.rewardKind === 'plain' ? 'miss' : 'ok'}`, REWARD_LINE[s.rewardKind ?? 'win']));
  return screen('rg-post', statusBar(run), el('div', 'rg-postbody', el('h2', 'rg-bigh', head), ...lines), foot(go(run.status === 'dead' ? 'Fortsätt' : s.reward ? 'Välj ditt byte 🎁' : 'Till kartan', o.onNext)));
}

// ---- reward ----

/** The line on the card after a race: what the placing earned (every race gives a pick of three). */
const REWARD_LINE: Record<RewardGrade, string> = {
  boss: '👑 Bossen är slagen! Välj ditt byte: tre kort med de bästa oddsen.',
  elite: '💀 Dödsloppet vunnet! Välj ditt byte: tre kort med extra bra odds.',
  win: '🏆 Vinst! Välj ditt byte: tre kort med bättre odds på Grym och Legendarisk.',
  normal: '🎁 Bra körning. Välj ditt byte: tre kort med vanliga odds.',
  plain: '🧰 Nedre halvan eller bruten: du får välja ett byte, men bara bland Skräp och första stegen.',
};
const REWARD_TITLE: Record<RewardGrade, string> = {
  boss: 'Bossen ligger i diket! Ta ett byte',
  elite: 'Du vann dödsloppet! Ta ett byte',
  win: 'Vinst! Välj ditt byte',
  normal: 'Bra körning. Välj ditt byte',
  plain: 'Bara skräp kvar. Välj ändå',
};

export function rewardView(run: RunState, scr: Extract<Screen, { kind: 'reward' }>, o: { onPick(i: number): void }): HTMLElement {
  const ups = scr.ups ?? [];
  const kindTag = (card: HTMLElement, text: string): HTMLElement => {
    card.prepend(el('span', 'rg-kt', text));
    return card;
  };
  // three cards in one row, talismans and upgrades mixed (the picks index the talismans first, then the nodes)
  const trinkets = scr.choices.map((id, i) => {
    const d = trinketById(id)!;
    return kindTag(trinketCard(d, { n: run.trinkets.find((t) => t.id === id)?.n, onClick: () => o.onPick(i), tag: run.trinkets.some((t) => t.id === id) ? 'Staplas! Stinkigare!' : undefined }), '🎁 Talisman');
  });
  const upCards = ups.map((id, j) => {
    const lab = treeLabel(upgradeById(id)!.tree, run.car.body);
    return kindTag(upgradeCard(run, id, { onClick: () => o.onPick(scr.choices.length + j) }), `${lab.emoji} Uppgradering`);
  });
  const cards: HTMLElement[] = [];
  const [more, less] = trinkets.length >= upCards.length ? [trinkets, upCards] : [upCards, trinkets];
  for (let k = 0; k < more.length; k++) {
    cards.push(more[k]!);
    if (less[k]) cards.push(less[k]!);
  }
  return screen(
    `rg-reward g-${scr.grade}`,
    statusBar(run),
    el('div', 'rg-rhead', el('h2', 'rg-h', REWARD_TITLE[scr.grade])),
    el('small', 'rg-rhint', 'Du tar ETT kort. 🎁 Talismaner ändrar reglerna, uppgraderingar bygger bilen.'),
    el('div', 'rg-cards rg-three', ...cards),
    foot(ghost('Nej tack (+30 kr)', () => o.onPick(-1))),
  );
}

// ---- shop ----

export interface ShopOpts {
  onBuy(i: number): void;
  onHeal(): void;
  onRepair(): void;
  onReroll(): void;
  onLeave(): void;
  note: string;
}

export function shopView(run: RunState, scr: Extract<Screen, { kind: 'shop' }>, o: ShopOpts): HTMLElement {
  const cards = scr.stock.map((it, i) => {
    const d = trinketById(it.id)!;
    const price = trinketPrice(run, it.id);
    return trinketCard(d, { price: it.sold ? undefined : price, note: it.sold ? 'Såld, lillen!' : undefined, n: run.trinkets.find((t) => t.id === it.id)?.n, disabled: it.sold || run.kronor < price, onClick: () => o.onBuy(i) });
  });
  const heal = btn('rg-svc', [el('span', 'rg-sve', '❤️'), el('span', null, 'Lappa hjärtat'), el('b', null, scr.healed ? 'Köpt' : run.hearts >= run.maxHearts ? 'Full' : `${healPrice(run)} kr`)], o.onHeal);
  heal.disabled = scr.healed || run.hearts >= run.maxHearts || run.kronor < healPrice(run);
  const repair = btn('rg-svc', [el('span', 'rg-sve', '🔧'), el('span', null, 'Klistra bilen'), el('b', null, scr.repaired || run.car.damage <= 0 ? 'Hel' : `${repairPrice(run)} kr`)], o.onRepair);
  repair.disabled = scr.repaired || run.car.damage <= 0 || run.kronor < repairPrice(run);
  const re = btn('rg-svc', [el('span', 'rg-sve', '🎲'), el('span', null, 'Nytt lager'), el('b', null, `${rerollPrice(scr)} kr`)], o.onReroll);
  re.disabled = run.kronor < rerollPrice(scr);
  return screen(
    'rg-shop',
    statusBar(run),
    el('div', 'rg-shopbody', el('div', 'rg-shophead', el('h2', 'rg-h', '🛒 Mackens kiosk'), el('div', 'rg-svcs', DIFFS[run.diff].shopHearts ? heal : null, repair, re)), el('span', 'rg-note', o.note || 'Köp talismaner. Samma talisman två gånger gör den starkare. Och lite mystiskare.'), el('div', 'rg-cards shop', ...cards)),
    foot(go('Sticka', o.onLeave)),
  );
}

// ---- workshop ----

export function workshopView(run: RunState, scr: Extract<Screen, { kind: 'workshop' }>, o: { onBuy(id: string): void; onRepair(): void; onPaint(c: string): void; onLeave(): void }): HTMLElement {
  const paints = el('div', 'rg-row');
  for (const c of CAR_PAINTS.slice(0, 12)) {
    const x = btn('rg-swatch', '', () => o.onPaint(c));
    x.style.background = c;
    x.setAttribute('aria-label', c);
    x.setAttribute('aria-pressed', String(run.car.style.paint === c));
    paints.append(x);
  }
  const repair = btn('rg-btn', `🔧 Laga allt${run.car.damage > 0 ? '' : ' (den är hel)'}`, o.onRepair);
  repair.disabled = scr.used || run.car.damage <= 0;
  // the shelf: the two or three nodes for sale this visit, as cards that can be told from the talismans of the kiosk
  const shelf = scr.stock.map((id) => {
    const taken = run.up.includes(id);
    const free = workshopFree(run, id);
    const price = upgradePrice(run, id);
    const poor = !taken && !free && run.kronor < price;
    const card = upgradeCard(run, id, { onClick: () => o.onBuy(id), price: taken ? 'Tagen ✔' : free ? (scr.stock.filter((x) => workshopFree(run, x)).length > 1 ? 'GRATIS · ett val' : 'GRATIS') : `${price} kr`, disabled: taken || poor });
    if (poor) card.classList.add('poor');
    if (taken) card.classList.add('sold');
    return card;
  });
  return screen(
    'rg-work',
    statusBar(run, btn('rg-icon wide up-leave', scr.used ? 'Klar → karta' : 'Strunt i det', o.onLeave)),
    el(
      'div',
      'rg-workbody',
      el('div', 'rg-shophead', el('h2', 'rg-h', '🔧 Skruvhörnan'), el('span', 'rg-note', scr.used ? 'Det gratis är taget. Resten kostar kronor, och varje uppgradering du har gör nästa dyrare.' : `Det här hade jag inne idag. En billig (nivå I eller II) är gratis, resten kostar, och varje uppgradering du redan har gör nästa ${Math.round(NODE_RISE * 100)} % dyrare.`)),
      el('div', 'rg-cards up-cards rg-shelf', ...shelf),
      el('div', 'rg-workrow', repair, el('div', 'rg-paintbox', el('span', 'arc-h', '🎨 Måla om (gratis)'), paints)),
    ),
    foot(go(scr.used ? 'Klar – till kartan' : 'Strunt i det', o.onLeave)),
  );
}

// ---- events ----

export function eventView(run: RunState, scr: Extract<Screen, { kind: 'event' }>, o: { onChoose(i: number): void; onNext(): void }): HTMLElement {
  const ev = eventById(scr.eventId) ?? EVENTS[0]!;
  if (scr.outcome) {
    return screen(
      'rg-event',
      statusBar(run),
      el('div', 'rg-eventbody', el('div', 'rg-bigem big', ev.emoji), el('h2', 'rg-h', ev.title), el('p', 'rg-etext', scr.outcome.text), el('div', 'rg-chips', ...scr.outcome.lines.map((l) => chip(l, 'gain')))),
      foot(go('Fortsätt', o.onNext)),
    );
  }
  const choices = ev.choices.map((c, i) => {
    const b = btn('rg-choice', c.label, () => o.onChoose(i));
    b.disabled = !choiceAllowed(run, c);
    if (b.disabled) b.append(el('small', null, 'Du är barskrapad'));
    return b;
  });
  return screen('rg-event', statusBar(run), el('div', 'rg-eventbody', el('div', 'rg-bigem big', ev.emoji), el('h2', 'rg-h', ev.title), el('p', 'rg-etext', ev.text)), el('div', 'rg-choices', ...choices));
}

// ---- the bag and the menu on the map ----

export function bagView(run: RunState, o: { onClose(): void }): HTMLElement {
  const rows = run.trinkets.length
    ? run.trinkets.map((t) => {
        const d = trinketById(t.id)!;
        return trinketCard(d, { n: undefined, note: t.n > 1 ? `×${t.n}` : undefined });
      })
    : [el('p', 'rg-note', 'Tomt. Vinn dödslopp, krossa bossar eller handla i kiosken.')];
  return screen('rg-bag', statusBar(run), el('h2', 'rg-h', '🎒 Dina talismaner'), el('div', 'rg-cards bag', ...rows), foot(go('Stäng', o.onClose)));
}

export function menuView(run: RunState, o: { onClose(): void; onTitle(): void; onSettings(): void; onBuild(): void; onRestart(): void }): HTMLElement {
  return screen(
    'rg-menu',
    statusBar(run),
    el('div', 'rg-menubody', el('h2', 'rg-h', 'Paus'), go('Fortsätt köra', o.onClose), ghost('🧰 Bygget', o.onBuild), ghost('⚙️ Inställningar', o.onSettings), ghost('💾 Spara och sticka', o.onTitle), ghost('🏳️ Ge upp rundan', o.onRestart), el('small', null, `Rundan sparas av sig själv efter varje plats. Frö: ${seedLabelOf(run.seed)}`)),
  );
}

/** Are you sure? "Nej" is the main button (Enter lands on it); "Ja, börja om" is the red one. Escape also means no (see App). */
export function restartConfirmView(run: RunState, o: { onYes(): void; onNo(): void; onResult(): void }): HTMLElement {
  const yes = btn('rg-btn warn', 'Ja, börja om', o.onYes);
  const more = btn('rg-link', 'Ge upp och visa resultatet', o.onResult);
  const dlg = el('div', 'rg-menubody rg-confirm', el('h2', 'rg-h', 'Börja om?'), el('p', 'rg-note', 'Den här rundan är förlorad.'), go('Nej', o.onNo), yes, more, el('small', null, 'Inga troféer för en uppgiven runda. Det du redan klarat av för medaljerna sparas.'));
  dlg.setAttribute('role', 'alertdialog');
  dlg.setAttribute('aria-label', 'Ge upp rundan?');
  return screen('rg-menu', statusBar(run), dlg);
}

// ---- settings ----

export interface SettingsOpts {
  settings: Settings;
  /** What the player is called now (the button that opens the name screen shows it). */
  who: string;
  onName(): void;
  /** Can the page go fullscreen (and is it, now)? Null: not supported here. */
  fullscreen: boolean | null;
  /** How this player drives: the scheme, shifting, button size and so on (edited in place; `onControls` saves). */
  controls: ControlPrefs;
  /** A touch screen (the touch-only choices show) and whether the browser can vibrate. */
  touch: boolean;
  canVibrate: boolean;
  onControls(): void;
  /** Opens the editor where the buttons are dragged to where the thumbs want them. */
  onEditLayout(): void;
  onChange(): void;
  onFullscreen(): void;
  onClose(): void;
}

export function settingsView(o: SettingsOpts): HTMLElement {
  const s = o.settings;
  const vols = el('div', 'rg-vols');
  const volBtns: [HTMLElement, number][] = [];
  const paintVols = (): void => volBtns.forEach(([b, v]) => b.setAttribute('aria-pressed', String(Math.abs(s.volume - v) < 0.02)));
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    const b = btn('rg-chipbtn', v === 0 ? '🔇' : `${Math.round(v * 100)}%`, () => {
      s.volume = v;
      paintVols();
      o.onChange();
    });
    b.setAttribute('aria-label', v === 0 ? 'Ljud av' : `Ljud ${Math.round(v * 100)} procent`);
    volBtns.push([b, v]);
    vols.append(b);
  }
  paintVols();
  // where the short pop-ups for talismans, abilities and boosts show
  const popRow = el('div', 'rg-vols');
  const popBtns: [HTMLElement, Settings['popups']][] = [];
  const paintPops = (): void => popBtns.forEach(([b, v]) => b.setAttribute('aria-pressed', String(s.popups === v)));
  for (const [v, label] of [['mid', 'Mitten'], ['corner', 'Hörnet'], ['off', 'Av']] as const) {
    const b = btn('rg-chipbtn', label, () => {
      s.popups = v;
      paintPops();
      o.onChange();
    });
    popBtns.push([b, v]);
    popRow.append(b);
  }
  paintPops();
  const toggle = (icon: string, label: string, hint: string, get: () => boolean, set: (v: boolean) => void): HTMLButtonElement => {
    const b = btn('rg-btn rg-toggle rg-set', '');
    const draw = (): void => {
      b.setAttribute('aria-pressed', String(get()));
      b.replaceChildren(el('span', null, `${icon} ${label}: ${get() ? 'På' : 'Av'}`), el('small', null, hint));
    };
    b.addEventListener('click', () => {
      set(!get());
      draw();
    });
    draw();
    return b;
  };
  const grid = el(
    'div',
    'rg-setgrid',
    btn('rg-btn rg-set rg-setname', [el('span', null, `🧑 Du heter: ${o.who}`), el('small', null, 'Byt namn eller rallynamn')], o.onName),
    el('div', 'rg-setvol', el('span', 'rg-setlabel', '🔊 Ljud'), vols),
    controlsSection(o),
    toggle('🎵', 'Musik', 'Soundtracket till kaoset', () => s.music, (v) => { s.music = v; o.onChange(); }),
    toggle('📳', 'Skakningar', 'Kameran vibrerar vid krascher och landningar', () => s.shake, (v) => { s.shake = v; o.onChange(); }),
    el('div', 'rg-setvol', el('span', 'rg-setlabel', '💥 Pop-ups'), popRow),
    toggle('🛟', 'Ikappkörningshjälp', 'Sug bakom andra, lite draghjälp och en snällare bana när du hamnat långt efter. Ett liv: bara sugen', () => s.catchup, (v) => { s.catchup = v; o.onChange(); }),
    toggle('📈', 'Visa FPS', 'Siffran som skvallrar när det laggar', () => s.fps, (v) => { s.fps = v; o.onChange(); }),
    o.fullscreen === null ? null : btn('rg-btn rg-set', '⛶ Helskärm på/av (ingen kant, ingen nåd)', o.onFullscreen),
  );
  return screen('rg-settings', el('div', 'rg-top', el('h2', 'rg-h tight', '⚙️ Inställningar')), el('div', 'rg-setbody', grid), foot(go('Klart, KÖR!', o.onClose)));
}

/** The Kontroller part of the settings: scheme, shifting, button size and opacity, left-handed, move buttons, vibration. */
function controlsSection(o: SettingsOpts): HTMLElement {
  const c = o.controls;
  const box = el('div', 'rg-ctl');
  const row = <T extends string | number>(label: string, items: readonly T[], name: (t: T) => string, get: () => T, set: (t: T) => void, off?: () => boolean): HTMLElement => {
    const wrap = el('div', 'rg-ctlrow');
    const chips = el('div', 'rg-vols');
    const draw = (): void => {
      chips.replaceChildren(
        ...items.map((it) => {
          const b = btn('rg-chipbtn', name(it), () => {
            set(it);
            o.onControls();
            redraw();
          });
          b.setAttribute('aria-pressed', String(get() === it));
          b.disabled = !!off?.();
          return b;
        }),
      );
    };
    draw();
    (wrap as HTMLElement & { draw?: () => void }).draw = draw;
    wrap.append(el('span', 'rg-setlabel', label), chips);
    return wrap;
  };
  const note = el('p', 'rg-ctlnote');
  const rows: HTMLElement[] = [];
  const redraw = (): void => {
    for (const r of rows) (r as HTMLElement & { draw?: () => void }).draw?.();
    note.textContent = o.touch ? SCHEME_TEXT[c.scheme] : '';
    shiftNote.textContent = o.touch
      ? c.scheme === 'easy'
        ? 'Lätt växlar bilen själv. Välj Pedaler eller Proffs för att växla med knappar.'
        : c.scheme === 'pro'
          ? 'Proffs växlar alltid själv: − och + vid högertummen (eller dra upp och ned på GAS).'
          : 'Manuell växling ger − och + vid högertummen.'
      : 'Q / E eller LB / RB växlar upp och ned. Skifta när lampan blir röd för en liten extra spark.';
  };
  const shiftNote = el('p', 'rg-ctlnote');
  if (o.touch) {
    rows.push(row('🎮 Kontroller', SCHEMES, (s: Scheme) => SCHEME_NAMES[s], () => c.scheme, (s) => (c.scheme = s)));
    box.append(rows[0]!, note);
  } else box.append(el('div', 'rg-setlabel', '🎮 Kontroller'));
  rows.push(
    row('⚙️ Växling', ['auto', 'manual'] as const, (m) => (m === 'auto' ? 'Automat' : 'Manuell'), () => (isManual(c, o.touch) ? 'manual' : 'auto'), (m) => (c.manual = m === 'manual'), () => o.touch && c.scheme !== 'pedals'),
  );
  box.append(rows[rows.length - 1]!, shiftNote);
  if (o.touch) {
    rows.push(row('↔️ Knappstorlek', SIZES, (z) => SIZE_NAMES[z], () => c.size, (z) => (c.size = z)));
    rows.push(row('👻 Synlighet', [0.4, 0.6, 0.8, 1] as const, (v) => `${Math.round(v * 100)} %`, () => c.opacity, (v) => (c.opacity = v)));
    rows.push(row('🤚 Vänsterhänt', ['no', 'yes'] as const, (v) => (v === 'yes' ? 'På' : 'Av'), () => (c.lefty ? 'yes' : 'no'), (v) => (c.lefty = v === 'yes')));
    box.append(rows[rows.length - 3]!, rows[rows.length - 2]!, rows[rows.length - 1]!);
    box.append(btn('rg-btn rg-set', '✋ Flytta knappar (dra dem dit du vill)', o.onEditLayout));
    if (o.canVibrate) rows.push(row('📲 Vibration', ['no', 'yes'] as const, (v) => (v === 'yes' ? 'På' : 'Av'), () => (c.haptics ? 'yes' : 'no'), (v) => (c.haptics = v === 'yes')));
    else box.append(el('p', 'rg-ctlnote', 'Vibration finns inte i den här webbläsaren (iPhone och iPad kan inte). Ljudet och lampan säger samma sak.'));
    if (o.canVibrate) box.append(rows[rows.length - 1]!);
  }
  redraw();
  return box;
}

// ---- the end of a run: see result.ts ----

export type OverInfo = RunEnd;
export { resultView as overView } from './result.ts';

// ---- the collection ----

/** The best act reached and the runs won on a difficulty (Skrytlådan). */
function bestCard(meta: Meta, d: Difficulty): HTMLElement {
  const b = meta.best[d];
  const def = DIFFS[d];
  return el('div', `rg-best d-${d}`, el('b', null, `${def.emoji} ${def.name}`), el('small', null, b.act ? `Längst: akt ${b.act}/${ACTS} · ${plural(b.wins, 'seger', 'segrar')}` : 'Inte försökt än'));
}

/** One medal on the shelf: its picture, name, the sentence, a progress bar, and a MEDALJ! ribbon once it is earned. */
export function medalCard(progress: Readonly<Record<string, number>>, m: (typeof MEDALS)[number]): HTMLElement {
  const have = Math.min(m.goal, progress[m.id] ?? 0);
  const done = earned(progress, m);
  const bar = el('div', 'rg-kit-bar');
  const fill = el('i');
  fill.style.width = `${Math.round((have / m.goal) * 100)}%`;
  bar.append(fill);
  return el(
    'div',
    `rg-medal${done ? ' done' : ''}`,
    done ? el('span', 'rg-medal-rib', 'MEDALJ!') : null,
    el('span', 'rg-medal-i', done ? m.emoji : '🏅'),
    el('div', 'rg-medal-t', el('b', null, m.name), el('span', null, m.title), bar, el('small', null, progressText(m, have))),
  );
}

export function collectionView(meta: Meta, o: { onBack(): void }): HTMLElement {
  const medals = MEDALS.map((m) => medalCard(meta.progress, m));
  const seen = new Set(meta.seen);
  const cards = TRINKETS.map((t) => {
    if (seen.has(t.id)) return trinketCard(t, {});
    return el('div', 'rg-tcard unseen', el('span', 'rg-tem', '❓'), el('span', 'rg-tname', '???'), el('span', 'rg-ttext', 'Inte hittad än. Leta!'));
  });
  return screen(
    'rg-coll',
    el('div', 'rg-top', el('h2', 'rg-h tight', '📖 Skrytlådan'), el('span', 'rg-grow'), el('span', 'rg-kr', `🏆 ${meta.trophies}`), el('span', 'rg-kr', `🏅 ${medalCount(meta.progress)}/${MEDALS.length}`), el('span', 'rg-kr', `🎁 ${seen.size}/${TRINKETS.length}`)),
    el('div', 'rg-collbody', el('div', 'arc-h', 'Bästa rundorna'), el('div', 'rg-bests', ...DIFFICULTIES.map((d) => bestCard(meta, d))), el('div', 'arc-h', 'Medaljer'), el('div', 'rg-medals', ...medals), el('div', 'arc-h', 'Talismaner'), el('div', 'rg-cards bag', ...cards)),
    foot(go('← Tillbaka', o.onBack)),
  );
}

// ---- what is your name? ----

export interface NameOpts {
  /** What was typed before, and the rally name chosen before ('' for none). */
  name: string;
  alias: string;
  /** The very first launch: no way back, the button says "Kör".  */
  first: boolean;
  onDone(name: string, alias: string): void;
  onBack?(): void;
}

/**
 * "Vad heter du?": a text field (at most 16 letters, filtered like everything else in the game) and, when the game can make
 * a decent rally name from it, a suggestion with a 🎲 button for the next one. The player drives as the rally name or as the name they typed.
 */
export function nameView(o: NameOpts): HTMLElement {
  const input = el('input', 'rg-namein');
  input.type = 'text';
  input.value = o.name;
  input.maxLength = NAME_MAX;
  input.placeholder = 'Ditt namn';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'words');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('aria-label', 'Vad heter du?');
  input.enterKeyHint = 'done';
  const msg = el('p', 'rg-namemsg');
  msg.setAttribute('role', 'status');
  const choices = el('div', 'rg-namechoices');
  const dice = btn('rg-chipbtn rg-dice', '🎲 Nytt förslag');
  const box = el('div', 'rg-namebox', el('div', 'arc-h rg-subh', 'Rallynamn'), choices, dice);
  let candidate: string | null = o.alias || suggestRallyName(o.name, 0);
  let n = 0;
  let useAlias = o.name ? !!o.alias : true;
  const done = go(o.first ? 'Kör! 🏁' : 'Klart', () => {
    const name = tidyName(input.value);
    if (!nameOk(name)) {
      draw();
      input.focus({ preventScroll: true });
      return;
    }
    o.onDone(name, useAlias && candidate ? candidate : '');
  });
  const draw = (): void => {
    const typed = tidyName(input.value);
    const ok = nameOk(typed);
    msg.textContent = input.value.trim() && !ok ? nameProblem(input.value) : '';
    msg.className = `rg-namemsg${msg.textContent ? ' bad' : ''}`;
    done.disabled = !ok;
    box.hidden = !ok;
    if (!ok) return;
    choices.replaceChildren();
    if (!candidate) {
      choices.append(el('p', 'rg-namenone', `Inget rallynamn passade. Du kör som ${typed}.`));
      dice.hidden = true;
      useAlias = false;
      return;
    }
    dice.hidden = false;
    for (const [label, alias] of [[candidate, true], [typed, false]] as const) {
      const x = btn('rg-chipbtn rg-namechoice', [el('span', null, label), el('small', null, alias ? 'rallynamn' : 'ditt namn')]);
      x.setAttribute('aria-pressed', String(useAlias === alias));
      x.addEventListener('click', () => {
        useAlias = alias;
        draw();
      });
      choices.append(x);
    }
  };
  input.addEventListener('input', () => {
    n = 0;
    candidate = suggestRallyName(input.value, 0);
    useAlias = true;
    draw();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      done.click();
    }
  });
  dice.addEventListener('click', () => {
    n++;
    candidate = suggestRallyName(input.value, n) ?? candidate;
    useAlias = true;
    draw();
  });
  draw();
  return screen(
    'rg-namescreen',
    el('h2', 'rg-h', 'Vad heter du?'),
    el('p', 'rg-note rg-namehint', o.first ? 'Du kör som dig själv. Namnet syns i tabellen, på kortet och när du vinner.' : 'Namnet syns i tabellen, på kortet och när du vinner.'),
    el('label', 'rg-namelab', input),
    msg,
    box,
    foot(o.onBack ? ghost('← Tillbaka', o.onBack) : el('span'), done),
  );
}
