// The run screens, as plain DOM builders: each takes the data and callbacks it needs and returns the
// element for the card. No state lives here; the App decides what happens on each press.
import { CAR_BODIES, CAR_DRIVERS, CAR_PAINTS, PART_MAX_LEVEL, CAR_PARTS, carStars, newCar, type CarBody, type CarDriver, type CarPart } from '../shared/rally.ts';
import { CAR_BODY_NAMES, CAR_BODY_TEXT, CAR_DRIVER_EMOJI, CAR_DRIVER_NAMES, CAR_PART_EMOJI, CAR_PART_NAMES, CAR_PART_TEXT, RALLY_COURSE_NAMES, RIVAL_NAMES } from '../shared/names.ts';
import { RALLY_COURSE_DEFS } from '../shared/rally.ts';
import { fmtTime } from '../rally/util.ts';
import { ACTS, NODE_EMOJI, NODE_NAMES, allNodes, type MapNode, type NodeType } from '../run/map.ts';
import { BODY_UNLOCK, unlockedBodies, unlockedTrinkets, type Meta } from '../run/meta.ts';
import { canUpgrade, healPrice, repairPrice, rerollPrice, trinketPrice } from '../run/economy.ts';
import { EVENTS, choiceAllowed, eventById } from '../run/events.ts';
import { currentNode, currentPlan } from '../run/flow.ts';
import { mapOf, reachable, type RunState, type Screen } from '../run/state.ts';
import { TRINKETS, trinketById } from '../run/trinkets.ts';
import { btn, el, plural } from './dom.ts';
import { ACT_NAMES, chip, seedLabel, statusBar, trinketCard, trinketIcons } from './parts.ts';
import { countUp } from './juice.ts';
import type { Settings } from '../settings.ts';
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
    newBtn.textContent = 'Tryck igen: den gamla rundan försvinner';
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
  calm.append(el('span', null, '🌈 Lugnt läge'), el('small', null, o.meta.calm ? 'På: 5 hjärtan och snällare rivaler' : 'Av: 3 hjärtan'));
  const left = el(
    'div',
    'rg-title-left',
    el('h1', 'arc-title', 'Galna Rallyt'),
    el('p', 'arc-sub', 'Kör, samla galna prylar och slå bossarna!'),
    el('div', 'rg-deco', ...['🏎️', '🐮', '🍌', '🦆', '🥞'].map((e) => el('span', null, e))),
    el('div', 'rg-trophy', `🏆 ${o.meta.trophies}`, el('small', null, o.meta.runs ? ` · ${plural(o.meta.runs, 'runda', 'rundor')} körda` : ' · första rundan väntar')),
  );
  const right = el('div', 'rg-title-right');
  if (o.saved) {
    const s = o.saved;
    right.append(
      go('▶ Fortsätt runda', o.onContinue, 'rg-continue'),
      el('div', 'rg-saveinfo', `Akt ${s.act + 1}/${ACTS} · ${s.hearts}/${s.maxHearts} ❤️ · ${s.kronor} kr · ${s.trinkets.reduce((a, t) => a + t.n, 0)} prylar`),
    );
  }
  right.append(newBtn, el('div', 'rg-pair', ghost('⚡ Snabbrace', o.onQuick), ghost('📖 Samling', o.onCollection)), el('div', 'rg-pair', calm, ghost('⚙️ Inställningar', o.onSettings)));
  if (o.homeHint) right.append(el('small', 'rg-homehint', 'Fusktips: Dela, sedan Lägg till på hemskärmen, så slipper du webbläsarens kant.'));
  return screen('rg-title', left, right);
}

// ---- pick the car and the driver ----

export interface PickSel {
  body: CarBody;
  driver: CarDriver;
  paint: string;
}

export function pickView(meta: Meta, sel: PickSel, o: { onChange(s: PickSel): void; onStart(s: PickSel): void; onBack(): void }): HTMLElement {
  const open = unlockedBodies(meta.trophies);
  const bodies = el('div', 'rg-row');
  const drivers = el('div', 'rg-row');
  const paints = el('div', 'rg-row');
  // built once, only the pressed state changes (so keyboard focus stays where it is)
  const pressed: [HTMLElement, () => boolean][] = [];
  // one line about the car you stand on: what it is good at, and its stars
  const desc = el('div', 'rg-bodydesc');
  const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);
  const describe = (): void => {
    const st = carStars(newCar(1, sel.body, ''));
    desc.replaceChildren(
      el('span', 'rg-bd-text', `${CAR_BODY_NAMES[sel.body]}: ${CAR_BODY_TEXT[sel.body]}`),
      el('span', 'rg-bd-stars', `Fart ${stars(st.speed)}  Grepp ${stars(st.grip)}  Tålighet ${stars(st.tough)}`),
    );
  };
  const pick = (b: HTMLElement, isOn: () => boolean, set: () => void): void => {
    b.addEventListener('click', () => {
      set();
      pressed.forEach(([x, on]) => x.setAttribute('aria-pressed', String(on())));
      describe();
      o.onChange(sel);
    });
    pressed.push([b, isOn]);
    b.setAttribute('aria-pressed', String(isOn()));
  };
  for (const b of CAR_BODIES) {
    const locked = !open.includes(b);
    const x = btn('rg-chipbtn', locked ? `🔒 ${CAR_BODY_NAMES[b]}` : CAR_BODY_NAMES[b]);
    x.disabled = locked;
    if (locked) x.append(el('small', null, `${BODY_UNLOCK[b]} 🏆`));
    pick(x, () => sel.body === b, () => (sel.body = b));
    bodies.append(x);
  }
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
      el('div', 'rg-picks', el('div', 'arc-h', 'Bil'), bodies, desc, el('div', 'arc-h', 'Förare'), drivers, el('div', 'arc-h', 'Färg'), paints),
    ),
    foot(ghost('← Tillbaka', o.onBack), go('Kör!', () => o.onStart(sel))),
  );
}

// ---- the map ----

export interface MapOpts {
  run: RunState;
  onEnter(id: string): void;
  onBag(): void;
  onMenu(): void;
}

const nodeLabel = (n: MapNode): string => {
  if (n.type === 'boss') return 'Bossen';
  if (n.course && n.type !== 'shop') return `${NODE_NAMES[n.type]} · ${RALLY_COURSE_NAMES[n.course]}`;
  return NODE_NAMES[n.type];
};

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
    const cls = ['rg-node', `t-${n.type}`, can ? 'reach' : '', done.has(n.id) ? 'done' : '', n.id === run.at ? 'here' : '', !can && !done.has(n.id) ? 'far' : ''].filter(Boolean).join(' ');
    const b = btn(cls, [el('span', 'rg-ne', NODE_EMOJI[n.type]), done.has(n.id) ? el('span', 'rg-tick', '✔') : null], () => o.onEnter(n.id));
    b.style.left = `${p.x}%`;
    b.style.top = `${p.y}%`;
    b.disabled = !can;
    b.title = nodeLabel(n);
    b.setAttribute('aria-label', nodeLabel(n));
    field.append(b);
  }
  const legend = el('div', 'rg-legend');
  for (const t of ['race', 'challenge', 'elite', 'shop', 'workshop', 'event', 'boss'] as NodeType[]) legend.append(el('span', null, `${NODE_EMOJI[t]} ${NODE_NAMES[t]}`));
  const menu = btn('rg-icon', '☰', o.onMenu);
  menu.setAttribute('aria-label', 'Meny');
  return screen(
    'rg-mapscreen',
    statusBar(run, btn('rg-icon wide', '🎒 Prylar', o.onBag), menu),
    field,
    legend,
    el('div', 'rg-maphint', run.at === null ? 'Välj var du ska börja – tryck på en glödande plats!' : 'Tryck på en glödande plats för att åka dit.', el('small', 'rg-seed', seedLabel(run.seed))),
  );
}

// ---- before the race ----

export function preraceView(run: RunState, o: { onGo(): void; onBack(): void }): HTMLElement {
  const plan = currentPlan(run)!;
  const node = currentNode(run)!;
  const r = plan.rules;
  const chips = [
    chip(`${RALLY_COURSE_DEFS[plan.course].emoji} ${RALLY_COURSE_NAMES[plan.course]}`),
    chip(`🔁 ${plural(r.laps, 'varv', 'varv')}`),
    chip(`🚗 ${plural(r.ai, 'rival', 'rivaler')}`),
    r.weather === 'rain' ? chip('🌧️ Regn') : null,
    r.time === 'night' ? chip('🌙 Natt') : r.time === 'sunset' ? chip('🌇 Solnedgång') : null,
    r.difficulty === 'hard' ? chip('💪 Svårt') : r.difficulty === 'easy' ? chip('🌈 Lugnt') : null,
    r.damage ? chip('🔧 Bilen kan skadas') : null,
  ].filter((x): x is HTMLElement => !!x);
  const rivals = el('ul', 'rg-rivals');
  const faces: CarDriver[] = ['cow', 'horse', 'pig', 'rooster', 'sheep'];
  for (let i = 0; i < r.ai; i++) {
    const boss = i === 0 ? plan.twist?.boss : undefined;
    rivals.append(el('li', boss ? 'boss' : '', `${CAR_DRIVER_EMOJI[boss?.face ?? faces[i]!]} ${boss?.name ?? RIVAL_NAMES[i]}`));
  }
  const info: Node[] = [el('div', 'rg-chips', ...chips)];
  if (plan.boss) info.push(el('div', 'rg-bossbox', el('div', 'rg-bossname', `${plan.boss.emoji} ${plan.boss.name}`), el('p', null, plan.boss.intro), el('p', 'rg-trick', `⚠️ ${plan.boss.trick}`)));
  if (plan.goal) info.push(el('div', 'rg-goal', '🎯 ', el('b', null, plan.goal.text), el('small', null, ' Klarar du det får du extra kronor och en pryl!')));
  if (node.type === 'elite') info.push(el('div', 'rg-goal', '💀 Tuffare rivaler, men du får välja en pryl om du tar dig i mål!'));
  return screen(
    'rg-pre',
    statusBar(run),
    el(
      'div',
      'rg-prebody',
      el('div', 'rg-preleft', el('div', 'rg-pretitle', el('span', 'rg-bigem', NODE_EMOJI[node.type]), el('h2', null, plan.title)), ...info),
      el('div', 'rg-preright', el('div', 'arc-h', 'Rivaler'), rivals, el('div', 'arc-h', 'Dina prylar'), run.trinkets.length ? trinketIcons(run.trinkets, 12) : el('small', null, 'Inga än')),
    ),
    foot(ghost('← Till kartan', o.onBack), go('Kör! 🏁', o.onGo)),
  );
}

// ---- after the race ----

export function postraceView(run: RunState, scr: Extract<Screen, { kind: 'postrace' }>, o: { onNext(): void; onCount?: () => void }): HTMLElement {
  const s = scr.summary;
  const head = !s.finished ? 'Nästan i mål!' : s.place === 1 ? '🏆 Du vann!' : `${s.place}:a plats`;
  const medal = s.medal ? { gold: '🥇', silver: '🥈', bronze: '🥉' }[s.medal] : '';
  const lines: Node[] = [];
  if (s.finished) lines.push(el('div', 'rg-time', `⏱️ ${fmtTime(s.time / 1000)} ${medal}`));
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
      ? el('div', 'rg-heartline lost', '💔 −1 hjärta', el('small', null, run.status === 'dead' ? ' – det var det sista…' : ` – ${run.hearts} kvar`))
      : el('div', 'rg-heartline', '❤️ Alla hjärtan kvar'),
  );
  if (s.goal) lines.push(el('div', `rg-goal ${s.goal.met ? 'ok' : 'miss'}`, s.goal.met ? '✅ Utmaning klar! ' : '❌ Inte denna gång. ', el('small', null, s.goal.text)));
  if (s.reward) lines.push(el('div', 'rg-goal ok', '🎁 Du får välja en pryl!'));
  return screen('rg-post', statusBar(run), el('div', 'rg-postbody', el('h2', 'rg-bigh', head), ...lines), foot(go(run.status === 'dead' ? 'Fortsätt' : s.reward ? 'Välj pryl 🎁' : 'Till kartan', o.onNext)));
}

// ---- reward ----

export function rewardView(run: RunState, scr: Extract<Screen, { kind: 'reward' }>, o: { onPick(i: number): void }): HTMLElement {
  const title = scr.source === 'boss' ? 'Bossen är besegrad! Välj en pryl' : scr.source === 'elite' ? 'Elitbelöning! Välj en pryl' : 'Välj en pryl!';
  const cards = scr.choices.map((id, i) => {
    const d = trinketById(id)!;
    return trinketCard(d, { n: run.trinkets.find((t) => t.id === id)?.n, onClick: () => o.onPick(i), tag: run.trinkets.some((t) => t.id === id) ? 'Staplas!' : undefined });
  });
  return screen('rg-reward', statusBar(run), el('h2', 'rg-h', title), el('div', 'rg-cards', ...cards), foot(ghost('Hoppa över (+30 kr)', () => o.onPick(-1))));
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
    return trinketCard(d, { price: it.sold ? undefined : price, note: it.sold ? 'Såld!' : undefined, n: run.trinkets.find((t) => t.id === it.id)?.n, disabled: it.sold || run.kronor < price, onClick: () => o.onBuy(i) });
  });
  const heal = btn('rg-svc', [el('span', 'rg-sve', '❤️'), el('span', null, 'Läk ett hjärta'), el('b', null, scr.healed ? 'Köpt' : run.hearts >= run.maxHearts ? 'Full' : `${healPrice(run)} kr`)], o.onHeal);
  heal.disabled = scr.healed || run.hearts >= run.maxHearts || run.kronor < healPrice(run);
  const repair = btn('rg-svc', [el('span', 'rg-sve', '🔧'), el('span', null, 'Laga bilen'), el('b', null, scr.repaired || run.car.damage <= 0 ? 'Hel' : `${repairPrice(run)} kr`)], o.onRepair);
  repair.disabled = scr.repaired || run.car.damage <= 0 || run.kronor < repairPrice(run);
  const re = btn('rg-svc', [el('span', 'rg-sve', '🎲'), el('span', null, 'Nya varor'), el('b', null, `${rerollPrice(scr)} kr`)], o.onReroll);
  re.disabled = run.kronor < rerollPrice(scr);
  return screen(
    'rg-shop',
    statusBar(run),
    el('div', 'rg-shopbody', el('div', 'rg-shophead', el('h2', 'rg-h', '🛒 Mackens kiosk'), el('div', 'rg-svcs', heal, repair, re)), el('span', 'rg-note', o.note || 'Köp prylar – samma pryl två gånger gör den starkare!'), el('div', 'rg-cards shop', ...cards)),
    foot(go('Lämna kiosken', o.onLeave)),
  );
}

// ---- workshop ----

export function workshopView(run: RunState, scr: Extract<Screen, { kind: 'workshop' }>, o: { onUpgrade(p: CarPart): void; onRepair(): void; onPaint(c: string): void; onLeave(): void }): HTMLElement {
  const parts = CAR_PARTS.map((p) => {
    const lvl = run.car.parts[p] ?? 0;
    const pips = el('span', 'rg-pips', ...Array.from({ length: PART_MAX_LEVEL }, (_, i) => el('i', i < lvl ? 'on' : '', i < lvl ? '●' : '○')));
    const can = !scr.used && canUpgrade(run, p);
    const b = btn('rg-part', [el('span', 'rg-pe', CAR_PART_EMOJI[p]), el('span', 'rg-pn', CAR_PART_NAMES[p]), pips, el('small', null, lvl >= PART_MAX_LEVEL ? 'Full nivå' : CAR_PART_TEXT[p])], () => o.onUpgrade(p));
    b.disabled = !can;
    return b;
  });
  const paints = el('div', 'rg-row');
  for (const c of CAR_PAINTS.slice(0, 12)) {
    const x = btn('rg-swatch', '', () => o.onPaint(c));
    x.style.background = c;
    x.setAttribute('aria-label', c);
    x.setAttribute('aria-pressed', String(run.car.style.paint === c));
    paints.append(x);
  }
  const repair = btn('rg-btn', `🔧 Laga bilen helt${run.car.damage > 0 ? '' : ' (den är hel)'}`, o.onRepair);
  repair.disabled = scr.used || run.car.damage <= 0;
  return screen(
    'rg-work',
    statusBar(run),
    el(
      'div',
      'rg-workbody',
      el('div', 'rg-shophead', el('h2', 'rg-h', '🔧 Verkstaden'), el('span', 'rg-note', scr.used ? 'Klart! Bilen blev bättre.' : 'Välj EN sak att fixa gratis:')),
      el('div', 'rg-parts', ...parts),
      el('div', 'rg-workrow', repair, el('div', 'rg-paintbox', el('span', 'arc-h', '🎨 Måla om (alltid gratis)'), paints)),
    ),
    foot(go(scr.used ? 'Klar – till kartan' : 'Hoppa över', o.onLeave)),
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
    if (b.disabled) b.append(el('small', null, 'Du har inte råd'));
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
    : [el('p', 'rg-note', 'Du har inga prylar än. Vinn elitlopp och bossar, eller handla i kiosken!')];
  return screen('rg-bag', statusBar(run), el('h2', 'rg-h', '🎒 Dina prylar'), el('div', 'rg-cards bag', ...rows), foot(go('Stäng', o.onClose)));
}

export function menuView(run: RunState, o: { onClose(): void; onTitle(): void; onSettings(): void }): HTMLElement {
  return screen(
    'rg-menu',
    statusBar(run),
    el('div', 'rg-menubody', el('h2', 'rg-h', 'Paus'), go('Fortsätt spela', o.onClose), ghost('⚙️ Inställningar', o.onSettings), ghost('💾 Spara och gå till titeln', o.onTitle), el('small', null, `Rundan sparas av sig själv efter varje plats. ${seedLabel(run.seed)}`)),
  );
}

// ---- settings ----

export interface SettingsOpts {
  settings: Settings;
  calm: boolean;
  /** Can the page go fullscreen (and is it, now)? Null: not supported here. */
  fullscreen: boolean | null;
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
    toggle('🎵', 'Musik', 'Soundtracken till kaoset', () => s.music, (v) => { s.music = v; o.onChange(); }),
    toggle('📳', 'Skakningar', 'Kameran får spel vid krascher och landningar', () => s.shake, (v) => { s.shake = v; o.onChange(); }),
    toggle('🌈', 'Lugnt läge', '5 hjärtan och rivaler som tar det lugnt (gäller nästa runda)', () => o.calm, (v) => { o.calm = v; o.onCalm(v); }),
    toggle('📈', 'Visa FPS', 'Siffran som skvallrar om du laggar', () => s.fps, (v) => { s.fps = v; o.onChange(); }),
    o.fullscreen === null ? null : btn('rg-btn rg-set', '⛶ Helskärm på/av (ingen kant, ingen nåd)', o.onFullscreen),
  );
  return screen('rg-settings', el('div', 'rg-top', el('h2', 'rg-h tight', '⚙️ Inställningar')), el('div', 'rg-setbody', grid), foot(go('Klart, kör!', o.onClose)));
}

// ---- the end of a run ----

export type OverInfo = RunEnd;

/** The silly numbers of a run: [text, count, silly]. The biggest silly count becomes the headline. */
export function funnyStats(run: RunState): { text: string; n: number; silly: boolean }[] {
  const s = run.stats;
  const out: { text: string; n: number; silly: boolean }[] = [];
  const add = (n: number, text: string, silly = true): void => {
    if (n > 0) out.push({ text, n, silly });
  };
  add(s.bounces, `🦆 Studsade ${plural(s.bounces, 'gång', 'gånger')}`);
  add(Math.round(s.driftSeconds), `🌀 Sladdade i ${Math.round(s.driftSeconds)} sekunder`);
  add(s.bananas, `🍌 Tappade ${plural(s.bananas, 'bananskal', 'bananskal')}${s.bananaHits ? ` (${s.bananaHits} träffar!)` : ''}`);
  add(s.quacks, `📣 Kvackade ${plural(s.quacks, 'gång', 'gånger')}`);
  add(s.squashed, `🥞 Gjorde ${plural(s.squashed, 'bil', 'bilar')} till pannkaka`);
  add(s.jumps, `🦘 Hoppade ${plural(s.jumps, 'gång', 'gånger')}`);
  add(s.coins, `🪙 Samlade ${plural(s.coins, 'mynt', 'mynt')}`, false);
  add(s.boosts, `🔥 Boostade ${plural(s.boosts, 'gång', 'gånger')}`, false);
  out.push({ text: `💰 Tjänade ${s.kronorEarned} kr`, n: 0, silly: false });
  out.push({ text: `🏁 Vann ${s.wins} av ${plural(s.races, 'lopp', 'lopp')}`, n: 0, silly: false });
  return out;
}

export function overView(run: RunState, info: OverInfo, o: { onAgain(): void; onTitle(): void }): HTMLElement {
  const stats = funnyStats(run);
  const hero = stats.filter((x) => x.silly).sort((a, b) => b.n - a.n)[0];
  const unlocked = [
    ...info.unlockedBodies.map((b) => `🚗 Ny bil: ${CAR_BODY_NAMES[b]}`),
    ...info.unlockedTrinkets.map((id) => {
      const d = trinketById(id);
      return `${d?.emoji ?? '🎁'} Ny pryl: ${d?.name ?? id}`;
    }),
  ];
  // where the trophies came from
  const why = [run.stats.bossesBeaten ? `${plural(run.stats.bossesBeaten, 'boss', 'bossar')} × 2` : '', info.won ? 'seger +3' : '', run.stats.races >= 3 ? 'körde några lopp +1' : ''].filter(Boolean).join(' · ');
  const total = run.trinkets.reduce((a, t) => a + t.n, 0);
  return screen(
    'rg-over',
    el(
      'div',
      'rg-overbody',
      el(
        'div',
        'rg-overleft',
        el('h1', 'arc-title', info.won ? 'Du vann Galna Rallyt!' : 'Rundan är slut'),
        el('p', 'arc-sub', info.won ? '🏆 Alla tre bossar är besegrade!' : `Du nådde akt ${run.act + 1} av ${ACTS} (${ACT_NAMES[Math.min(run.act, ACTS - 1)]}).`),
        el('div', 'rg-overcar', `🚗 ${CAR_BODY_NAMES[run.car.body]} med ${CAR_DRIVER_EMOJI[run.car.style.driver ?? 'human']} ${CAR_DRIVER_NAMES[run.car.style.driver ?? 'human']}`),
        el('div', 'rg-trophy big', `+${info.trophies} 🏆`, el('small', null, ` (totalt ${info.total})`)),
        why ? el('small', 'rg-why', why) : null,
        unlocked.length ? el('ul', 'rg-unlocks', ...unlocked.slice(0, 5).map((u) => el('li', null, u))) : null,
        el('div', 'arc-h', `Dina prylar${total ? ` (${total})` : ''}`),
        run.trinkets.length ? trinketIcons(run.trinkets, 24) : el('small', null, 'Inga prylar den här gången'),
      ),
      el(
        'div',
        'rg-overright',
        el('div', 'arc-h', 'Rundans galna siffror'),
        hero ? el('div', 'rg-hero', hero.text) : null,
        el('ul', 'rg-stats', ...stats.filter((x) => x !== hero).map((x) => el('li', null, x.text))),
        el('small', 'rg-seed', seedLabel(run.seed)),
      ),
    ),
    foot(ghost('Till titeln', o.onTitle), go('Ny runda', o.onAgain)),
  );
}

// ---- the collection ----

export function collectionView(meta: Meta, o: { onBack(): void }): HTMLElement {
  const bodies = CAR_BODIES.map((b) => {
    const open = BODY_UNLOCK[b] <= meta.trophies;
    return el('div', `rg-body-card${open ? '' : ' locked'}`, el('span', 'rg-bcn', open ? CAR_BODY_NAMES[b] : '🔒 ???'), el('small', null, open ? 'Upplåst' : `Kräver ${BODY_UNLOCK[b]} 🏆`));
  });
  const open = new Set(unlockedTrinkets(meta.trophies).map((t) => t.id));
  const seen = new Set(meta.seen);
  const cards = TRINKETS.map((t) => {
    if (seen.has(t.id)) return trinketCard(t, {});
    const lockedBy = open.has(t.id) ? 'Inte hittad än' : `Låses upp vid ${t.unlock} 🏆`;
    return el('div', 'rg-tcard unseen', el('span', 'rg-tem', '❓'), el('span', 'rg-tname', '???'), el('span', 'rg-ttext', lockedBy));
  });
  return screen(
    'rg-coll',
    el('div', 'rg-top', el('h2', 'rg-h tight', '📖 Samling'), el('span', 'rg-grow'), el('span', 'rg-kr', `🏆 ${meta.trophies}`), el('span', 'rg-kr', `${seen.size}/${TRINKETS.length} prylar`)),
    el('div', 'rg-collbody', el('div', 'arc-h', 'Bilar'), el('div', 'rg-bodies', ...bodies), el('div', 'arc-h', 'Prylar'), el('div', 'rg-cards bag', ...cards)),
    foot(go('← Tillbaka', o.onBack)),
  );
}

