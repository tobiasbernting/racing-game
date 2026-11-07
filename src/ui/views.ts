// The run screens, as plain DOM builders: each takes the data and callbacks it needs and returns the
// element for the card. No state lives here; the App decides what happens on each press.
import { CAR_BODIES, CAR_DRIVERS, CAR_PAINTS, PART_MAX_LEVEL, CAR_PARTS, type CarBody, type CarDriver, type CarPart } from '../shared/rally.ts';
import { CAR_BODY_NAMES, CAR_DRIVER_EMOJI, CAR_DRIVER_NAMES, CAR_PART_EMOJI, CAR_PART_NAMES, CAR_PART_TEXT, RALLY_COURSE_NAMES, RIVAL_NAMES } from '../shared/names.ts';
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
import { ACT_NAMES, chip, statusBar, trinketCard, trinketIcons } from './parts.ts';

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
  right.append(newBtn, el('div', 'rg-pair', ghost('⚡ Snabbrace', o.onQuick), ghost('📖 Samling', o.onCollection)), calm);
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
  const draw = (): void => {
    bodies.replaceChildren(
      ...CAR_BODIES.map((b) => {
        const locked = !open.includes(b);
        const x = btn('rg-chipbtn', locked ? `🔒 ${CAR_BODY_NAMES[b]}` : CAR_BODY_NAMES[b], () => {
          sel.body = b;
          draw();
          o.onChange(sel);
        });
        x.disabled = locked;
        if (locked) x.append(el('small', null, `${BODY_UNLOCK[b]} 🏆`));
        x.setAttribute('aria-pressed', String(sel.body === b));
        return x;
      }),
    );
    drivers.replaceChildren(
      ...CAR_DRIVERS.map((d) => {
        const x = btn('rg-chipbtn', `${CAR_DRIVER_EMOJI[d]} ${CAR_DRIVER_NAMES[d]}`, () => {
          sel.driver = d;
          draw();
          o.onChange(sel);
        });
        x.setAttribute('aria-pressed', String(sel.driver === d));
        return x;
      }),
    );
    paints.replaceChildren(
      ...CAR_PAINTS.slice(0, 12).map((c) => {
        const x = btn('rg-swatch', '', () => {
          sel.paint = c;
          draw();
          o.onChange(sel);
        });
        x.style.background = c;
        x.setAttribute('aria-label', c);
        x.setAttribute('aria-pressed', String(sel.paint === c));
        return x;
      }),
    );
  };
  draw();
  return screen(
    'rg-pick',
    el('h2', 'rg-h', 'Välj bil och förare'),
    el(
      'div',
      'rg-pickbody',
      el('div', 'arc-preview rg-preview'),
      el('div', 'rg-picks', el('div', 'arc-h', 'Bil'), bodies, el('div', 'arc-h', 'Förare'), drivers, el('div', 'arc-h', 'Färg'), paints),
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
    el('div', 'rg-maphint', run.at === null ? 'Välj var du ska börja – tryck på en glödande plats!' : 'Tryck på en glödande plats för att åka dit.'),
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

export function postraceView(run: RunState, scr: Extract<Screen, { kind: 'postrace' }>, o: { onNext(): void }): HTMLElement {
  const s = scr.summary;
  const head = !s.finished ? 'Nästan i mål!' : s.place === 1 ? '🏆 Du vann!' : `${s.place}:a plats`;
  const medal = s.medal ? { gold: '🥇', silver: '🥈', bronze: '🥉' }[s.medal] : '';
  const lines: Node[] = [];
  if (s.finished) lines.push(el('div', 'rg-time', `⏱️ ${fmtTime(s.time / 1000)} ${medal}`));
  lines.push(
    el(
      'div',
      'rg-kronor',
      el('b', null, `+${s.total} kr`),
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
    el('div', 'rg-shopbody', el('div', 'rg-shophead', el('h2', 'rg-h', '🛒 Mackens kiosk'), el('span', 'rg-note', o.note || 'Köp prylar – samma pryl två gånger gör den starkare!')), el('div', 'rg-cards shop', ...cards), el('div', 'rg-svcs', heal, repair, re)),
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

export function menuView(run: RunState, o: { onClose(): void; onTitle(): void }): HTMLElement {
  return screen('rg-menu', statusBar(run), el('div', 'rg-menubody', el('h2', 'rg-h', 'Paus'), go('Fortsätt spela', o.onClose), ghost('💾 Spara och gå till titeln', o.onTitle), el('small', null, 'Rundan sparas av sig själv efter varje plats.')));
}

// ---- the end of a run ----

export interface OverInfo {
  won: boolean;
  trophies: number;
  total: number;
  unlockedBodies: CarBody[];
  unlockedTrinkets: string[];
}

export function funnyStats(run: RunState): string[] {
  const s = run.stats;
  const out: string[] = [];
  if (s.bounces > 0) out.push(`🦆 Studsade ${plural(s.bounces, 'gång', 'gånger')}`);
  if (s.driftSeconds >= 1) out.push(`🌀 Sladdade i ${Math.round(s.driftSeconds)} sekunder`);
  if (s.bananas > 0) out.push(`🍌 Tappade ${plural(s.bananas, 'bananskal', 'bananskal')}${s.bananaHits ? ` (${s.bananaHits} träffar!)` : ''}`);
  if (s.quacks > 0) out.push(`📣 Kvackade ${plural(s.quacks, 'gång', 'gånger')}`);
  if (s.squashed > 0) out.push(`🥞 Gjorde ${plural(s.squashed, 'bil', 'bilar')} till pannkaka`);
  if (s.jumps > 0) out.push(`🦘 Hoppade ${plural(s.jumps, 'gång', 'gånger')}`);
  if (s.coins > 0) out.push(`🪙 Samlade ${plural(s.coins, 'mynt', 'mynt')}`);
  if (s.boosts > 0) out.push(`🔥 Boostade ${plural(s.boosts, 'gång', 'gånger')}`);
  out.push(`💰 Tjänade ${s.kronorEarned} kr`);
  out.push(`🏁 Vann ${s.wins} av ${plural(s.races, 'lopp', 'lopp')}`);
  return out;
}

export function overView(run: RunState, info: OverInfo, o: { onAgain(): void; onTitle(): void }): HTMLElement {
  const stats = funnyStats(run);
  // the funniest first: the biggest count among the silly ones
  const unlocked = [
    ...info.unlockedBodies.map((b) => `🚗 Ny bil: ${CAR_BODY_NAMES[b]}`),
    ...info.unlockedTrinkets.map((id) => {
      const d = trinketById(id);
      return `${d?.emoji ?? '🎁'} Ny pryl: ${d?.name ?? id}`;
    }),
  ];
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
        el('div', 'rg-trophy big', `+${info.trophies} 🏆`, el('small', null, ` (totalt ${info.total})`)),
        unlocked.length ? el('ul', 'rg-unlocks', ...unlocked.slice(0, 5).map((u) => el('li', null, u))) : null,
        el('div', 'arc-h', 'Dina prylar'),
        run.trinkets.length ? trinketIcons(run.trinkets, 24) : el('small', null, 'Inga prylar den här gången'),
      ),
      el('div', 'rg-overright', el('div', 'arc-h', 'Rundans galna siffror'), el('ul', 'rg-stats', ...stats.map((l) => el('li', null, l)))),
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

