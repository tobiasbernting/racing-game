// The run screens, as plain DOM builders: each takes the data and callbacks it needs and returns the
// element for the card. No state lives here; the App decides what happens on each press.
import { CAR_BODIES, CAR_DRIVERS, CAR_PAINTS, PART_MAX_LEVEL, CAR_PARTS, carStars, newCar, type CarBody, type CarDriver, type CarPart } from '../shared/rally.ts';
import { CAR_BODY_NAMES, CAR_BODY_TEXT, CAR_DRIVER_EMOJI, CAR_DRIVER_NAMES, CAR_PART_EMOJI, CAR_PART_NAMES, CAR_PART_TEXT, RALLY_COURSE_NAMES } from '../shared/names.ts';
import { ARCHETYPE_EMOJI, ARCHETYPE_NAMES, ARCHETYPE_TEXT } from '../shared/rivals.ts';
import { BOSS_RULES, archetypeCounts, rivalModById } from '../shared/field.ts';
import { rivalById } from '../shared/rivals.ts';
import { KIND_EMOJI, KIND_NAMES, KIND_TEXT, PLACE_POINTS, RACE_KINDS, TAKEDOWN_POINTS } from '../shared/kinds.ts';
import { partOfChoice } from '../run/economy.ts';
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
    el('p', 'arc-sub', 'Kör som en galning. Samla skräp. Krossa bossarna.'),
    el('div', 'rg-deco', ...['🏎️', '💨', '🌭', '🧦', '💩'].map((e) => el('span', null, e))),
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
  right.append(newBtn, el('div', 'rg-pair', ghost('⚡ Snabbrace', o.onQuick), ghost('📖 Skrytlådan', o.onCollection)), el('div', 'rg-pair', calm, ghost('⚙️ Inställningar', o.onSettings)));
  if (o.homeHint) right.append(el('small', 'rg-homehint', 'Fusktips: Dela, sedan Lägg till på hemskärmen. Ingen webbläsarkant.'));
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
      el('span', 'rg-bd-stars', `Fart ${stars(st.speed)}  Grepp ${stars(st.grip)}  Hållbarhet ${stars(st.tough)}`),
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
  const kind = n.kind ? ` · ${KIND_NAMES[n.kind]}` : '';
  if (n.type === 'boss') return `Bossen. Den är sur.${kind}`;
  if (n.course && n.type !== 'shop') return `${NODE_NAMES[n.type]} · ${RALLY_COURSE_NAMES[n.course]}${kind}`;
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
    const b = btn(cls, [el('span', 'rg-ne', NODE_EMOJI[n.type]), n.kind ? el('span', `rg-kb k-${n.kind}`, KIND_EMOJI[n.kind]) : null, done.has(n.id) ? el('span', 'rg-tick', '✔') : null], () => o.onEnter(n.id));
    b.style.left = `${p.x}%`;
    b.style.top = `${p.y}%`;
    b.disabled = !can;
    b.title = nodeLabel(n);
    b.setAttribute('aria-label', nodeLabel(n));
    field.append(b);
  }
  const legend = el('div', 'rg-legend');
  for (const t of ['race', 'challenge', 'elite', 'shop', 'workshop', 'event', 'boss'] as NodeType[]) legend.append(el('span', null, `${NODE_EMOJI[t]} ${NODE_NAMES[t]}`));
  const kinds = el('div', 'rg-legend rg-kinds', ...RACE_KINDS.map((k) => el('span', `k-${k}`, `${KIND_EMOJI[k]} ${KIND_NAMES[k]}`, el('small', null, k === 'rally' ? ' ren racing' : k === 'mixed' ? ' racing med knuffar' : ' vrak och poäng'))));
  const menu = btn('rg-icon', '☰', o.onMenu);
  menu.setAttribute('aria-label', 'Meny');
  return screen(
    'rg-mapscreen',
    statusBar(run, btn('rg-icon wide', '🎒 Skräpet', o.onBag), menu),
    field,
    legend,
    kinds,
    el('div', 'rg-maphint', run.at === null ? 'Välj en glödande plats. Börja nånstans.' : 'Nästa stopp: en glödande plats.', el('small', 'rg-seed', seedLabel(run.seed))),
  );
}

// ---- before the race ----

export function preraceView(run: RunState, o: { onGo(): void; onBack(): void }): HTMLElement {
  const plan = currentPlan(run)!;
  const node = currentNode(run)!;
  const r = plan.rules;
  const kind = plan.kind;
  const chips = [
    chip(`${KIND_EMOJI[kind]} ${KIND_NAMES[kind]}`, `k-${kind}`),
    chip(`${RALLY_COURSE_DEFS[plan.course].emoji} ${RALLY_COURSE_NAMES[plan.course]}`),
    chip(`🔁 ${plural(r.laps, 'varv', 'varv')}`),
    chip(`🏎️ ${plural(r.ai, 'rival', 'rivaler')}`),
    r.weather === 'rain' ? chip('🌧️ Regn') : null,
    r.time === 'night' ? chip('🌙 Natt') : r.time === 'sunset' ? chip('🌇 Solnedgång') : null,
    r.difficulty === 'hard' ? chip('💀 Hårt') : r.difficulty === 'easy' ? chip('🛋️ Söndagsåkning') : null,
    plan.field.hazards.oil + plan.field.hazards.hay + plan.field.hazards.pothole > 0 ? chip('🛢️ Hinder på vägen') : null,
    plan.field.narrow < 1 ? chip('↔️ Smal väg') : null,
  ].filter((x): x is HTMLElement => !!x);
  const rivals = el('ul', 'rg-rivals');
  const talkers: { name: string; talk: string }[] = [];
  for (const sp of plan.field.rivals) {
    const boss = sp.boss ? plan.twist?.boss : undefined;
    const rv = sp.boss ? undefined : rivalById(sp.id);
    if (rv) talkers.push({ name: rv.name, talk: rv.talk });
    const icons = el('span', 'rg-mods');
    for (const id of sp.mods) {
      const m = rivalModById(id);
      if (m) icons.append(Object.assign(el('i', 'rg-mod', m.emoji), { title: `${m.name}: ${m.text}` }));
    }
    const face = CAR_DRIVER_EMOJI[boss?.face ?? rv?.face ?? 'human'];
    const li = el(
      'li',
      sp.boss ? 'boss' : '',
      el('span', 'rg-rname', `${face} ${boss?.name ?? rv?.name ?? '???'}`, el('em', `rg-arch a-${sp.archetype}`, ` ${ARCHETYPE_EMOJI[sp.archetype]} ${ARCHETYPE_NAMES[sp.archetype]}`), icons),
      el('small', null, sp.boss ? (plan.boss?.nick ?? '') : rv?.nick ?? ''),
    );
    li.title = `${ARCHETYPE_NAMES[sp.archetype]}: ${ARCHETYPE_TEXT[sp.archetype]}`;
    rivals.append(li);
  }
  const talk = talkers.length ? talkers[node.seed % talkers.length]! : null;
  const counts = archetypeCounts(plan.field);
  const info: Node[] = [el('div', 'rg-chips', ...chips), el('div', `rg-kindbox k-${kind}`, el('b', null, `${KIND_EMOJI[kind]} ${KIND_NAMES[kind]}: `), KIND_TEXT[kind], kind === 'carnage' ? el('small', null, ` Poäng för placering: ${PLACE_POINTS.join('/')} och ${TAKEDOWN_POINTS} per vrak. Placeringen på poäng avgör priset och hjärtat.`) : null)];
  if (plan.boss) {
    const rules = plan.field.rivals[0]?.rules.filter((x) => x === 'lastlap' || kind === 'carnage') ?? [];
    info.push(el('div', 'rg-bossbox', el('div', 'rg-bossname', `${plan.boss.emoji} ${plan.boss.name}`), el('div', 'rg-bossnick', plan.boss.nick), el('p', 'rg-quote', plan.boss.intro), el('p', 'rg-trick', `⚠️ ${plan.boss.trick}`), ...rules.map((x) => el('p', 'rg-trick', `${BOSS_RULES[x].emoji} ${BOSS_RULES[x].text}`))));
  }
  if (plan.goal) info.push(el('div', 'rg-goal', '🎯 ', el('b', null, plan.goal.text), el('small', null, ' Fixar du det får du extra kronor och en pryl.')));
  if (node.type === 'elite') info.push(el('div', 'rg-goal', '💀 Mördarrivaler. Tar du dig i mål får du välja en pryl.'));
  info.push(
    el(
      'div',
      'rg-heartrule',
      run.calm
        ? '❤️ Sist eller bryter: −❤️'
        : plan.boss
          ? `❤️ Bossen: förlorar du${kind === 'carnage' ? ' på poäng' : ''} är det −❤️❤️. Vinn och få ❤️ tillbaka.`
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
      el('div', 'rg-preleft', el('div', 'rg-pretitle', el('span', 'rg-bigem', NODE_EMOJI[node.type]), el('h2', null, plan.title)), ...info),
      el('div', 'rg-preright', el('div', 'arc-h', `Motståndare  ${mix}`), rivals, talk ? el('div', 'rg-talk', el('b', null, `${talk.name}:`), ` ”${talk.talk}”`) : null, el('div', 'arc-h', 'Ditt skräp'), run.trinkets.length ? trinketIcons(run.trinkets, 12) : el('small', null, 'Inget än. Fattigt.')),
    ),
    foot(ghost('← Fega ur', o.onBack), go('KÖR! 🏁', o.onGo)),
  );
}

// ---- after the race ----

export function postraceView(run: RunState, scr: Extract<Screen, { kind: 'postrace' }>, o: { onNext(): void; onCount?: () => void }): HTMLElement {
  const s = scr.summary;
  const head = !s.finished ? 'Du kom aldrig i mål. Aj.' : s.place === 1 ? '🏆 DU VANN!' : s.place === 2 ? '2:a. Första förloraren.' : s.place === 3 ? '3:a. Nära pallen, långt från ära.' : `${s.place}:a plats. Fy.`;
  const medal = s.medal ? { gold: '🥇', silver: '🥈', bronze: '🥉' }[s.medal] : '';
  const lines: Node[] = [];
  if (s.finished) lines.push(el('div', 'rg-time', `⏱️ ${fmtTime(s.time / 1000)} ${medal}`));
  if (s.kind === 'carnage' && s.points !== undefined) {
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
  if (s.goal) lines.push(el('div', `rg-goal ${s.goal.met ? 'ok' : 'miss'}`, s.goal.met ? '✅ Utmaning krossad! ' : '❌ Misslyckades. Skärp dig. ', el('small', null, s.goal.text)));
  if (s.reward) lines.push(el('div', 'rg-goal ok', s.rewardKind === 'second' ? '🥈 Tröstpris: välj en av två.' : s.rewardKind === 'win' ? '🏆 Vinst! Välj ditt byte.' : '🎁 Du får välja en pryl.'));
  return screen('rg-post', statusBar(run), el('div', 'rg-postbody', el('h2', 'rg-bigh', head), ...lines), foot(go(run.status === 'dead' ? 'Fortsätt' : s.reward ? (s.rewardKind === 'second' ? 'Ta tröstpriset 🎁' : 'Välj ditt byte 🎁') : 'Till kartan', o.onNext)));
}

// ---- reward ----

export function rewardView(run: RunState, scr: Extract<Screen, { kind: 'reward' }>, o: { onPick(i: number): void }): HTMLElement {
  const title =
    scr.source === 'boss' ? 'Bossen ligger i diket! Ta ett byte' : scr.source === 'elite' ? 'Du överlevde dödsloppet! Ta ett byte' : scr.source === 'consolation' ? 'Tvåa. Ta ett tröstpris' : 'Vinst! Välj ditt byte';
  const cards = scr.choices.map((id, i) => {
    const part = partOfChoice(id);
    if (part) {
      const lvl = run.car.parts[part] ?? 0;
      return btn('rg-tcard r-rare rg-partcard', [el('span', 'rg-tem', CAR_PART_EMOJI[part]), el('span', 'rg-tname', `${CAR_PART_NAMES[part]} nivå ${lvl + 1}`), el('span', 'rg-ttext', CAR_PART_TEXT[part]), el('span', 'rg-tfoot', el('span', 'rg-rar r-rare', 'Uppgradering'))], () => o.onPick(i));
    }
    const d = trinketById(id)!;
    return trinketCard(d, { n: run.trinkets.find((t) => t.id === id)?.n, onClick: () => o.onPick(i), tag: run.trinkets.some((t) => t.id === id) ? 'Staplas! Stinkigare!' : undefined });
  });
  return screen('rg-reward', statusBar(run), el('h2', 'rg-h', title), el('div', 'rg-cards', ...cards), foot(ghost('Nej tack (+30 kr)', () => o.onPick(-1))));
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

export function workshopView(run: RunState, scr: Extract<Screen, { kind: 'workshop' }>, o: { onUpgrade(p: CarPart): void; onRepair(): void; onPaint(c: string): void; onLeave(): void }): HTMLElement {
  const parts = CAR_PARTS.map((p) => {
    const lvl = run.car.parts[p] ?? 0;
    const pips = el('span', 'rg-pips', ...Array.from({ length: PART_MAX_LEVEL }, (_, i) => el('i', i < lvl ? 'on' : '', i < lvl ? '●' : '○')));
    const can = !scr.used && canUpgrade(run, p);
    const b = btn('rg-part', [el('span', 'rg-pe', CAR_PART_EMOJI[p]), el('span', 'rg-pn', CAR_PART_NAMES[p]), pips, el('small', null, lvl >= PART_MAX_LEVEL ? 'Maxat' : CAR_PART_TEXT[p])], () => o.onUpgrade(p));
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
  const repair = btn('rg-btn', `🔧 Laga allt${run.car.damage > 0 ? '' : ' (den är hel)'}`, o.onRepair);
  repair.disabled = scr.used || run.car.damage <= 0;
  return screen(
    'rg-work',
    statusBar(run),
    el(
      'div',
      'rg-workbody',
      el('div', 'rg-shophead', el('h2', 'rg-h', '🔧 Skruvhörnan'), el('span', 'rg-note', scr.used ? 'Klart! Bilen är mer rätt nu.' : 'Välj EN sak. Gratis. Skruva!')),
      el('div', 'rg-parts', ...parts),
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

export function menuView(run: RunState, o: { onClose(): void; onTitle(): void; onSettings(): void }): HTMLElement {
  return screen(
    'rg-menu',
    statusBar(run),
    el('div', 'rg-menubody', el('h2', 'rg-h', 'Paus'), go('Fortsätt köra', o.onClose), ghost('⚙️ Inställningar', o.onSettings), ghost('💾 Spara och sticka', o.onTitle), el('small', null, `Rundan sparas av sig själv efter varje plats. ${seedLabel(run.seed)}`)),
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
    toggle('🎵', 'Musik', 'Soundtracket till kaoset', () => s.music, (v) => { s.music = v; o.onChange(); }),
    toggle('📳', 'Skakningar', 'Kameran vibrerar vid krascher och landningar', () => s.shake, (v) => { s.shake = v; o.onChange(); }),
    toggle('🛋️', 'Söndagsåkare', '5 hjärtan och rivaler som tar det lugnt (gäller nästa runda)', () => o.calm, (v) => { o.calm = v; o.onCalm(v); }),
    toggle('📈', 'Visa FPS', 'Siffran som skvallrar när det laggar', () => s.fps, (v) => { s.fps = v; o.onChange(); }),
    o.fullscreen === null ? null : btn('rg-btn rg-set', '⛶ Helskärm på/av (ingen kant, ingen nåd)', o.onFullscreen),
  );
  return screen('rg-settings', el('div', 'rg-top', el('h2', 'rg-h tight', '⚙️ Inställningar')), el('div', 'rg-setbody', grid), foot(go('Klart, KÖR!', o.onClose)));
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
  add(s.bounces, `🤸 Studsade ${plural(s.bounces, 'gång', 'gånger')}`);
  add(Math.round(s.driftSeconds), `🌀 Sladdade i ${Math.round(s.driftSeconds)} sekunder`);
  add(s.bananas, `🐌 Slemmade ner banan ${plural(s.bananas, 'gång', 'gånger')}${s.bananaHits ? ` (${s.bananaHits} offer!)` : ''}`);
  add(s.quacks, `💨 Pruttade och rapade ${plural(s.quacks, 'gång', 'gånger')}`);
  add(s.squashed, `🧦 Sockade ner ${plural(s.squashed, 'bil', 'bilar')}`);
  add(s.jumps, `🦘 Hoppade ${plural(s.jumps, 'gång', 'gånger')}`);
  add(s.coins, `🪙 Samlade ${plural(s.coins, 'mynt', 'mynt')}`, false);
  add(s.boosts, `🔥 Boostade ${plural(s.boosts, 'gång', 'gånger')}`, false);
  out.push({ text: `💰 Tjänade ${s.kronorEarned} kr`, n: 0, silly: false });
  out.push({ text: `🏁 Vann ${s.wins} av ${plural(s.races, 'lopp', 'lopp')}. ${s.wins === 0 ? 'Aj.' : 'Respekt.'}`, n: 0, silly: false });
  return out;
}

export function overView(run: RunState, info: OverInfo, o: { onAgain(): void; onTitle(): void }): HTMLElement {
  const stats = funnyStats(run);
  const hero = stats.filter((x) => x.silly).sort((a, b) => b.n - a.n)[0];
  const unlocked = [
    ...info.unlockedBodies.map((b) => `🚗 Ny bil: ${CAR_BODY_NAMES[b]}`),
    ...info.unlockedTrinkets.map((id) => {
      const d = trinketById(id);
      return `${d?.emoji ?? '🎁'} Nytt skräp: ${d?.name ?? id}`;
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
        el('h1', 'arc-title', info.won ? 'DU KROSSADE ALLA!' : 'Rundan är slut. Du dog.'),
        el('p', 'arc-sub', info.won ? '🏆 Alla bossar ligger i diket. Du är kung.' : `Du kom till akt ${run.act + 1} av ${ACTS} (${ACT_NAMES[Math.min(run.act, ACTS - 1)]}). Inte illa. Inte bra.`),
        el('div', 'rg-overcar', `🚗 ${CAR_BODY_NAMES[run.car.body]} med ${CAR_DRIVER_EMOJI[run.car.style.driver ?? 'human']} ${CAR_DRIVER_NAMES[run.car.style.driver ?? 'human']}`),
        el('div', 'rg-trophy big', `+${info.trophies} 🏆`, el('small', null, ` (totalt ${info.total})`)),
        why ? el('small', 'rg-why', why) : null,
        unlocked.length ? el('ul', 'rg-unlocks', ...unlocked.slice(0, 5).map((u) => el('li', null, u))) : null,
        el('div', 'arc-h', `Ditt skräp${total ? ` (${total})` : ''}`),
        run.trinkets.length ? trinketIcons(run.trinkets, 24) : el('small', null, 'Inget skräp den här gången'),
      ),
      el(
        'div',
        'rg-overright',
        el('div', 'arc-h', 'Rundans pinsamma siffror'),
        hero ? el('div', 'rg-hero', hero.text) : null,
        el('ul', 'rg-stats', ...stats.filter((x) => x !== hero).map((x) => el('li', null, x.text))),
        el('small', 'rg-seed', seedLabel(run.seed)),
      ),
    ),
    foot(ghost('Till titeln', o.onTitle), go('Igen! 🏁', o.onAgain)),
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

