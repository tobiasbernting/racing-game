// The run screens, as plain DOM builders: each takes the data and callbacks it needs and returns the
// element for the card. No state lives here; the App decides what happens on each press.
import { CAR_BODIES, CAR_DRIVERS, CAR_PAINTS, carStars, newCar, type CarBody, type CarDriver } from '../shared/rally.ts';
import { CAR_BODY_NAMES, CAR_BODY_TEXT, CAR_DRIVER_EMOJI, CAR_DRIVER_NAMES, RALLY_COURSE_NAMES } from '../shared/names.ts';
import { ARCHETYPE_EMOJI, ARCHETYPE_NAMES, ARCHETYPE_TEXT } from '../shared/rivals.ts';
import { BOSS_RULES, archetypeCounts, rivalModById } from '../shared/field.ts';
import { rivalById } from '../shared/rivals.ts';
import { KIND_EMOJI, KIND_NAMES, KIND_TEXT, PLACE_POINTS, RACE_KINDS, TAKEDOWN_POINTS } from '../shared/kinds.ts';
import { RALLY_COURSE_DEFS } from '../shared/rally.ts';
import { fmtTime } from '../rally/util.ts';
import { ACTS, NODE_EMOJI, NODE_NAMES, allNodes, nodeEmoji, type MapNode, type NodeType } from '../run/map.ts';
import { ARENAS, DERBY_EMOJI, DERBY_NAME, DERBY_SECONDS, DERBY_TEXT } from '../shared/derby.ts';
import { isUnlocked, unlockedTrinkets, type Meta } from '../run/meta.ts';
import { challengeFor, progressText } from '../run/unlocks.ts';
import { LEANS, LEAN_EMOJI, LEAN_NAMES, LEAN_TEXT, kitOf, type Lean } from '../shared/abilities.ts';
import { healPrice, repairPrice, rerollPrice, trinketPrice } from '../run/economy.ts';
import { EVENTS, choiceAllowed, eventById } from '../run/events.ts';
import { currentNode, currentPlan } from '../run/flow.ts';
import { SCRAP_PER_HEART, mapOf, reachable, type RunState, type Screen } from '../run/state.ts';
import { TRINKETS, trinketById } from '../run/trinkets.ts';
import { btn, el, plural } from './dom.ts';
import { upgradeCard, workshopPanel } from './upgrades.ts';
import { ACT_NAMES, arrowSvg, chip, seedLabel, statusBar, trinketCard, trinketIcons } from './parts.ts';
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
  onCollection(): void;
  onCalm(on: boolean): void;
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
  const calm = btn('rg-btn rg-toggle', '', () => {
    o.onCalm(!o.meta.calm);
  });
  calm.setAttribute('aria-pressed', String(o.meta.calm));
  calm.append(el('span', null, '🛋️ Söndagsåkare'), el('small', null, o.meta.calm ? 'På: 5 hjärtan, snällare rivaler' : 'Av: 3 hjärtan, ingen nåd'));
  const left = el(
    'div',
    'rg-title-left',
    el('h1', 'arc-title', 'Galna Rallyt'),
    el('p', 'arc-sub', 'Ingen runda blir den andra lik. Samla galna prylar. Krossa bossarna.'),
    el('div', 'rg-deco', ...['🏎️', '🎲', '🌭', '🪩', '🐄'].map((e) => el('span', null, e))),
    el('div', 'rg-trophy', `🏆 ${o.meta.trophies}`, el('small', null, o.meta.runs ? ` · ${plural(o.meta.runs, 'runda', 'rundor')} krossade` : ' · inga rundor än. Visa vad du går för.')),
  );
  const right = el('div', 'rg-title-right');
  if (o.saved) {
    const s = o.saved;
    right.append(
      go('▶ Fortsätt runda', o.onContinue, 'rg-continue'),
      el('div', 'rg-saveinfo', `Akt ${s.act + 1}/${ACTS} · ${s.hearts}/${s.maxHearts} ❤️ · ${s.kronor} kr · ${s.trinkets.reduce((a, t) => a + t.n, 0)} prylar`),
    );
  }
  right.append(el('div', 'rg-newwrap', arrowSvg('rg-arrow'), newBtn), el('div', 'rg-pair', ghost('⚡ Snabbrace', o.onQuick), ghost('📖 Skrytlådan', o.onCollection)), el('div', 'rg-pair', calm, ghost('⚙️ Inställningar', o.onSettings)));
  if (o.homeHint) right.append(el('small', 'rg-homehint', 'Fusktips: Dela, sedan Lägg till på hemskärmen. Ingen webbläsarkant.'));
  return screen('rg-title', left, right);
}

// ---- pick the car and the driver ----

export interface PickSel {
  body: CarBody;
  driver: CarDriver;
  paint: string;
}

/** The stars of a vehicle's stats, the lean, passive, active and starting trinket; or, if it is locked, what opens it. */
export function kitCard(meta: Meta, body: CarBody): HTMLElement {
  const k = kitOf(body);
  const st = carStars(newCar(1, body, ''));
  const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);
  const open = isUnlocked(meta, body);
  const ch = challengeFor(body);
  const t = trinketById(k.trinket);
  const kids: Node[] = [];
  if (!open && ch) {
    const have = Math.min(ch.goal, meta.progress[ch.id] ?? 0);
    const bar = el('div', 'rg-kit-bar');
    const fill = el('i');
    fill.style.width = `${Math.round((have / ch.goal) * 100)}%`;
    bar.append(fill);
    kids.push(el('div', 'rg-kit-lock', el('b', null, `🔒 Låses upp: ${ch.title}`), bar, el('small', null, progressText(ch, have))));
  }
  kids.push(
    el('div', 'rg-kit-head', el('span', `rg-lean lean-${k.lean}`, `${LEAN_EMOJI[k.lean]} ${LEAN_NAMES[k.lean]}`), el('small', null, LEAN_TEXT[k.lean]), el('span', 'rg-kit-text', CAR_BODY_TEXT[body])),
    el('div', 'rg-kit-stars', el('span', null, `Fart ${stars(st.speed)}`), el('span', null, `Grepp ${stars(st.grip)}`), el('span', null, `Hållbarhet ${stars(st.tough)}`)),
    el('div', 'rg-kit-grid',
      el('div', 'rg-kit-row', el('span', 'rg-kit-k', 'Passiv'), el('div', null, el('b', null, k.passive.name), el('small', null, k.passive.text))),
      el('div', 'rg-kit-row', el('span', 'rg-kit-k act', 'Aktiv'), el('div', null, el('b', null, `${k.active.emoji} ${k.active.name}`, el('em', null, ` · ${k.active.cooldown} s`)), el('small', null, k.active.text))),
      el('div', 'rg-kit-row', el('span', 'rg-kit-k', 'Startpryl'), el('div', null, el('b', null, `${t?.emoji ?? '🎁'} ${t?.name ?? k.trinket}`), el('small', null, t?.text ?? ''))),
    ),
  );
  return el('div', `rg-kit${open ? '' : ' locked'}`, ...kids);
}

export function pickView(meta: Meta, sel: PickSel, o: { onChange(s: PickSel): void; onStart(s: PickSel): void; onBack(): void }): HTMLElement {
  const bodies = el('div', 'rg-row');
  const drivers = el('div', 'rg-row');
  const paints = el('div', 'rg-row');
  // built once, only the pressed state changes (so keyboard focus stays where it is)
  const pressed: [HTMLElement, () => boolean][] = [];
  const desc = el('div', 'rg-bodydesc');
  let applyFilterLater = (): void => {};
  const start = go('Kör!', () => {
    if (isUnlocked(meta, sel.body)) o.onStart(sel);
  });
  const describe = (): void => {
    desc.replaceChildren(kitCard(meta, sel.body));
    const locked = !isUnlocked(meta, sel.body);
    start.disabled = locked;
    start.textContent = locked ? '🔒 Låst' : 'Kör!';
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
    const locked = !isUnlocked(meta, b);
    const ch = challengeFor(b);
    const name = CAR_BODY_NAMES[b];
    const x = btn(`rg-chipbtn${locked ? ' locked' : ''}${name.length >= 11 ? ' long' : ''}`, locked ? `🔒 ${name}` : name);
    if (locked && ch) x.append(el('small', null, `${Math.min(ch.goal, meta.progress[ch.id] ?? 0)}/${ch.goal}`));
    else x.append(el('small', null, `${LEAN_EMOJI[kitOf(b).lean]} ${LEAN_NAMES[kitOf(b).lean]}`));
    pick(x, () => sel.body === b, () => (sel.body = b));
    chips.push([b, x]);
    bodies.append(x);
  }
  applyFilterLater = applyFilter;
  const openCount = CAR_BODIES.filter((b) => isUnlocked(meta, b)).length;
  for (const d of CAR_DRIVERS) {
    const x = btn('rg-chipbtn', `${CAR_DRIVER_EMOJI[d]} ${CAR_DRIVER_NAMES[d]}`);
    pick(x, () => sel.driver === d, () => (sel.driver = d));
    drivers.append(x);
  }
  for (const c of CAR_PAINTS.slice(0, 12)) {
    const x = btn('rg-swatch', '');
    x.style.background = c;
    x.setAttribute('aria-label', c);
    pick(x, () => sel.paint === c, () => (sel.paint = c));
    paints.append(x);
  }
  describe();
  return screen(
    'rg-pick',
    el('h2', 'rg-h', 'Välj bil och förare'),
    el(
      'div',
      'rg-pickbody',
      el('div', 'arc-preview rg-preview'),
      el('div', 'rg-picks', el('div', 'arc-h', `Bil · ${openCount} av ${CAR_BODIES.length} upplåsta`), filterRow, bodies, desc, el('div', 'arc-h', 'Förare'), drivers, el('div', 'arc-h', 'Färg'), paints),
    ),
    foot(ghost('← Tillbaka', o.onBack), start),
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
  if (nodes.some((n) => n.derby)) legend.append(el('span', 'rg-lg-derby', `${DERBY_EMOJI} ${DERBY_NAME}`, el('small', null, ' arena, sista bilen vinner')));
  const kinds = el('div', 'rg-legend rg-kinds', ...RACE_KINDS.map((k) => el('span', `k-${k}`, `${KIND_EMOJI[k]} ${KIND_NAMES[k]}`, el('small', null, k === 'rally' ? ' ren racing' : k === 'mixed' ? ' racing med knuffar' : ' vrak och poäng'))));
  const menu = btn('rg-icon', '☰', o.onMenu);
  menu.setAttribute('aria-label', 'Meny');
  return screen(
    'rg-mapscreen',
    statusBar(
      run,
      run.interest ? el('span', 'rg-interest', `🏦 +${run.interest}`, el('span', 'rg-bt', ' kr ränta')) : null,
      iconBtn('🧰', 'Bygget', o.onBuild),
      iconBtn('🎒', 'Skräpet', o.onBag),
      menu,
    ),
    field,
    legend,
    kinds,
    el('div', 'rg-maphint', arrowSvg('rg-arrow sm'), run.at === null ? 'Välj en glödande plats. Börja nånstans.' : 'Nästa stopp: en glödande plats.', el('small', 'rg-seed', seedLabel(run.seed))),
  );
}

// ---- before the race ----

export function preraceView(run: RunState, o: { onGo(): void; onBack(): void }): HTMLElement {
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
  plan.field.rivals.forEach((sp, ix) => {
    const boss = sp.boss ? plan.twist?.boss : undefined;
    const rv = sp.boss ? undefined : rivalById(sp.id);
    if (rv) talkers.push({ name: rv.name, talk: rv.talk });
    const icons = el('span', 'rg-mods');
    for (const id of sp.mods) {
      const m = rivalModById(id);
      if (m) icons.append(Object.assign(el('i', 'rg-mod', m.emoji), { title: `${m.name}: ${m.text}` }));
    }
    const face = CAR_DRIVER_EMOJI[boss?.face ?? rv?.face ?? 'human'];
    const quote = sp.boss ? (plan.boss?.nick ?? '') : (rv?.nick ?? '');
    const card = el(
      'div',
      `rg-ccard a-${sp.archetype}${sp.boss ? ' boss' : ''}`,
      el('div', 'rg-cport', el('span', 'rg-cface', face), el('b', 'rg-cno', `#${ix + 2}`), icons),
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
      ? el('div', 'rg-kindbox rg-derbybox k-carnage', el('b', null, `${DERBY_EMOJI} ${DERBY_NAME}: `), DERBY_TEXT.replace(`${DERBY_NAME}: `, ''), el('small', null, ` Placeringen är i vilken ordning bilarna åker ut, och varje vrak ger ${TAKEDOWN_POINTS} p. ${arena.text}`))
      : el('div', `rg-kindbox k-${kind}`, el('b', null, `${KIND_EMOJI[kind]} ${KIND_NAMES[kind]}: `), KIND_TEXT[kind], kind === 'carnage' ? el('small', null, ` Poäng för placering: ${PLACE_POINTS.join('/')} och ${TAKEDOWN_POINTS} per vrak. Placeringen på poäng avgör priset och hjärtat.`) : null),
  ];
  if (plan.boss) {
    const rules = plan.field.rivals[0]?.rules.filter((x) => (x === 'lastlap' && !arena) || (x === 'regen' && kind === 'carnage')) ?? [];
    info.push(el('div', 'rg-bossbox', el('div', 'rg-bossname', `${plan.boss.emoji} ${plan.boss.name}`), el('div', 'rg-bossnick', plan.boss.nick), el('p', 'rg-quote', plan.boss.intro), el('p', 'rg-trick', `⚠️ ${arena && plan.boss.derbyTrick ? plan.boss.derbyTrick : plan.boss.trick}`), ...rules.map((x) => el('p', 'rg-trick', `${BOSS_RULES[x].emoji} ${BOSS_RULES[x].text}`))));
  }
  if (plan.goal) info.push(el('div', 'rg-goal', '🎯 ', el('b', null, plan.goal.text), el('small', null, ' Fixar du det får du extra kronor och en pryl.')));
  if (node.type === 'elite') info.push(el('div', 'rg-goal', arena ? '💀 Dödslopp i arenan. Ger alltid ett byte, även om du inte vinner.' : '💀 Mördarrivaler. Ett dödslopp ger alltid ett byte, även om du inte vinner.'));
  info.push(
    el(
      'div',
      'rg-heartrule',
      run.calm
        ? '❤️ Sist eller bryter: −❤️'
        : plan.boss
          ? `❤️ Bossen: ${arena ? 'vinner du inte derbyt' : `förlorar du${kind === 'carnage' ? ' på poäng' : ''}`} är det −❤️❤️. Vinn och få ❤️ tillbaka.`
          : arena
            ? '❤️ Åker du ut bland de första (nedre halvan): −❤️. Bryter du: −❤️❤️.'
            : `❤️ Hamnar du på nedre halvan${kind === 'carnage' ? ' på poäng' : ''}: −❤️. Bryter du: −❤️❤️.`,
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
      el('div', 'rg-preright', el('div', 'arc-h', `Motståndare  ${mix}`), rivals, talk ? el('div', 'rg-talk', el('b', null, `${talk.name}:`), ` ”${talk.talk}”`) : null, el('div', 'arc-h', 'Ditt skräp'), run.trinkets.length ? trinketIcons(run.trinkets, 12) : el('small', null, 'Inget än. Fattigt.')),
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
      : dv.alive
        ? `${s.place}:a på klockan. Tiden tog slut.`
        : s.place === s.n
          ? 'Först ut. Det gick fort.'
          : `${s.place}:a. Du blev utslagen som bil nummer ${s.n - s.place + 1}.`
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
        el('b', null, `🏟️ Plats ${s.place} av ${s.n}`),
        el('small', null, ` efter utslagsordningen${dv.timeUp ? ' (de som rullade till slutet rangordnas på hälsa)' : ''} · 💥 ${td} vrak × ${TAKEDOWN_POINTS} p = ${td * TAKEDOWN_POINTS} p${s.wrecked ? ' · du blev vrakad' : ''}`),
      ),
      el(
        'ol',
        'rg-dtable',
        ...dv.table.map((r) =>
          el('li', `${r.me ? 'me' : ''} ${r.alive ? 'alive' : 'out'}`, el('b', null, `${r.place}.`), el('span', 'rg-dn', r.name), el('small', null, r.alive ? `rullade kvar · ${r.hp} % hälsa` : `ute efter ${clock(r.outAt ?? 0)}`), r.takedowns ? el('em', null, `💥 ${r.takedowns}`) : null),
        ),
      ),
    );
  } else if (s.finished) lines.push(el('div', 'rg-time', `⏱️ ${fmtTime(s.time / 1000)} ${medal}`));
  if (!dv && s.kind === 'carnage' && s.points !== undefined) {
    // Blodbad is decided on points: say how the points came about
    const pp = s.roadPlace ? PLACE_POINTS[Math.min(PLACE_POINTS.length, s.roadPlace) - 1]! : 0;
    const td = s.takedowns ?? 0;
    lines.push(
      el('div', 'rg-points', el('b', null, `💥 Blodbad: ${s.points} p`), el('small', null, ` = ${pp} för ${s.roadPlace ?? '?'}:a plats på vägen + ${td} vrak × ${TAKEDOWN_POINTS} p${s.wrecked ? ` · du blev vrakad ${s.wrecked} ${s.wrecked === 1 ? 'gång' : 'gånger'}` : ''}. Plats ${s.place} av ${s.n} på poäng.`)),
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
      el('small', null, ` (lopp ${s.prize}${s.coins ? ` · mynt ${s.coins}` : ''}${s.bonus ? ` · prylar ${s.bonus}` : ''})`),
    ),
  );
  lines.push(
    s.heartLost
      ? el('div', 'rg-heartline lost', s.hearts === 2 ? '💔 −2 hjärtan' : '💔 −1 hjärta', el('small', null, run.status === 'dead' ? ' – det var sista. RIP.' : ` – ${run.hearts} kvar`))
      : el('div', 'rg-heartline', '❤️ Hjärtat klarade sig'),
  );
  // Skrotpant: wrecks buy hearts back
  if (s.scrapHearts) lines.push(el('div', 'rg-heartline', '🔩 Skrotpant: ❤️ tillbaka för vraken', el('small', null, ` (${SCRAP_PER_HEART} vrak = ett hjärta)`)));
  else if ((s.takedowns ?? 0) > 0 && s.scrapCount !== undefined) lines.push(el('div', 'rg-scrap', `🔩 Skrotpant: ${s.scrapCount} av ${SCRAP_PER_HEART} vrak till nästa ❤️`));
  if (s.goal) lines.push(el('div', `rg-goal ${s.goal.met ? 'ok' : 'miss'}`, s.goal.met ? '✅ Utmaning krossad! ' : '❌ Misslyckades. Skärp dig. ', el('small', null, s.goal.text)));
  if (s.reward) lines.push(el('div', 'rg-goal ok', s.rewardKind === 'second' ? '🥈 Tröstpris: välj en av två.' : s.rewardKind === 'win' ? '🏆 Vinst! Välj ditt byte.' : '🎁 Du får välja en pryl.'));
  return screen('rg-post', statusBar(run), el('div', 'rg-postbody', el('h2', 'rg-bigh', head), ...lines), foot(go(run.status === 'dead' ? 'Fortsätt' : s.reward ? (s.rewardKind === 'second' ? 'Ta tröstpriset 🎁' : 'Välj ditt byte 🎁') : 'Till kartan', o.onNext)));
}

// ---- reward ----

export function rewardView(run: RunState, scr: Extract<Screen, { kind: 'reward' }>, o: { onPick(i: number): void }): HTMLElement {
  const title =
    scr.source === 'boss' ? 'Bossen ligger i diket! Ta ett byte' : scr.source === 'elite' ? 'Du överlevde dödsloppet! Ta ett byte' : scr.source === 'consolation' ? 'Tvåa. Ta ett tröstpris' : 'Vinst! Välj ditt byte';
  const ups = scr.ups ?? [];
  const trinkets = scr.choices.map((id, i) => {
    const d = trinketById(id)!;
    return trinketCard(d, { n: run.trinkets.find((t) => t.id === id)?.n, onClick: () => o.onPick(i), tag: run.trinkets.some((t) => t.id === id) ? 'Staplas! Stinkigare!' : undefined });
  });
  const upCards = ups.map((id, j) => upgradeCard(run, id, { onClick: () => o.onPick(scr.choices.length + j) }));
  const trinketGrid = el('div', 'rg-cards', ...trinkets);
  const upGrid = el('div', 'rg-cards up-cards', ...upCards);
  const both = trinkets.length > 0 && upCards.length > 0;
  let show: 'ups' | 'trinkets' = upCards.length ? 'ups' : 'trinkets';
  const tabs = el('div', 'rg-rtabs');
  const draw = (): void => {
    trinketGrid.hidden = show !== 'trinkets';
    upGrid.hidden = show !== 'ups';
    tabs.replaceChildren(
      ...(
        [
          ['ups', `🛠️ Uppgraderingar (${upCards.length})`],
          ['trinkets', `🎁 Prylar (${trinkets.length})`],
        ] as const
      ).map(([k, label]) => {
        const b = btn('rg-chipbtn rg-rtab', label, () => {
          show = k;
          draw();
        });
        b.setAttribute('aria-pressed', String(show === k));
        return b;
      }),
    );
  };
  draw();
  const hint = both ? el('small', 'rg-rhint', 'Du får EN av dem. Bilen växer av uppgraderingar, prylar ändrar reglerna.') : null;
  return screen('rg-reward', statusBar(run), el('div', 'rg-rhead', el('h2', 'rg-h', title), both ? tabs : null), hint, upGrid, trinketGrid, foot(ghost('Nej tack (+30 kr)', () => o.onPick(-1))));
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
    el('div', 'rg-shopbody', el('div', 'rg-shophead', el('h2', 'rg-h', '🛒 Mackens kiosk'), el('div', 'rg-svcs', heal, repair, re)), el('span', 'rg-note', o.note || 'Köp skräp. Samma skräp två gånger gör det starkare. Och stinkigare.'), el('div', 'rg-cards shop', ...cards)),
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
  return screen(
    'rg-work',
    statusBar(run, btn('rg-icon wide up-leave', scr.used ? 'Klar → karta' : 'Strunt i det', o.onLeave)),
    el(
      'div',
      'rg-workbody',
      el('div', 'rg-shophead', el('h2', 'rg-h', '🔧 Skruvhörnan'), el('span', 'rg-note', scr.used ? 'Det gratis är taget. Resten kostar kronor.' : 'En billig uppgradering (nivå I eller II) är gratis. Resten kostar.')),
      workshopPanel(run, o.onBuy),
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
  return screen('rg-bag', statusBar(run), el('h2', 'rg-h', '🎒 Ditt skräp'), el('div', 'rg-cards bag', ...rows), foot(go('Stäng', o.onClose)));
}

export function menuView(run: RunState, o: { onClose(): void; onTitle(): void; onSettings(): void; onBuild(): void }): HTMLElement {
  return screen(
    'rg-menu',
    statusBar(run),
    el('div', 'rg-menubody', el('h2', 'rg-h', 'Paus'), go('Fortsätt köra', o.onClose), ghost('🧰 Bygget', o.onBuild), ghost('⚙️ Inställningar', o.onSettings), ghost('💾 Spara och sticka', o.onTitle), el('small', null, `Rundan sparas av sig själv efter varje plats. ${seedLabel(run.seed)}`)),
  );
}

// ---- settings ----

export interface SettingsOpts {
  settings: Settings;
  calm: boolean;
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
  onCalm(on: boolean): void;
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
    el('div', 'rg-setvol', el('span', 'rg-setlabel', '🔊 Ljud'), vols),
    controlsSection(o),
    toggle('🎵', 'Musik', 'Soundtracket till kaoset', () => s.music, (v) => { s.music = v; o.onChange(); }),
    toggle('📳', 'Skakningar', 'Kameran vibrerar vid krascher och landningar', () => s.shake, (v) => { s.shake = v; o.onChange(); }),
    toggle('🛋️', 'Söndagsåkare', '5 hjärtan och rivaler som tar det lugnt (gäller nästa runda)', () => o.calm, (v) => { o.calm = v; o.onCalm(v); }),
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

export function collectionView(meta: Meta, o: { onBack(): void }): HTMLElement {
  const bodies = CAR_BODIES.map((b) => {
    const open = isUnlocked(meta, b);
    const ch = challengeFor(b);
    const k = kitOf(b);
    return el(
      'div',
      `rg-body-card${open ? '' : ' locked'}`,
      el('span', 'rg-bcn', open ? `${k.active.emoji} ${CAR_BODY_NAMES[b]}` : `🔒 ${CAR_BODY_NAMES[b]}`),
      el('small', null, open ? `${LEAN_EMOJI[k.lean]} ${k.passive.name} · ${k.active.name}` : ch ? `${ch.title} (${Math.min(ch.goal, meta.progress[ch.id] ?? 0)}/${ch.goal})` : 'Låst'),
    );
  });
  const open = new Set(unlockedTrinkets(meta.trophies).map((t) => t.id));
  const seen = new Set(meta.seen);
  const cards = TRINKETS.map((t) => {
    if (seen.has(t.id)) return trinketCard(t, {});
    const lockedBy = open.has(t.id) ? 'Inte hittad än. Leta!' : `Låses upp vid ${t.unlock} 🏆`;
    return el('div', 'rg-tcard unseen', el('span', 'rg-tem', '❓'), el('span', 'rg-tname', '???'), el('span', 'rg-ttext', lockedBy));
  });
  return screen(
    'rg-coll',
    el('div', 'rg-top', el('h2', 'rg-h tight', '📖 Skrytlådan'), el('span', 'rg-grow'), el('span', 'rg-kr', `🏆 ${meta.trophies}`), el('span', 'rg-kr', `${seen.size}/${TRINKETS.length} skräp`)),
    el('div', 'rg-collbody', el('div', 'arc-h', 'Bilar'), el('div', 'rg-bodies', ...bodies), el('div', 'arc-h', 'Skräp'), el('div', 'rg-cards bag', ...cards)),
    foot(go('← Tillbaka', o.onBack)),
  );
}

