// "🎨 Garaget": the styling garage. A big live 3D car on a turntable next to (or above) the options; tabs for paint, pattern,
// stickers, wheels, spoiler, extras, horn, smoke, plate and helmet. Each of the twenty vehicles keeps its own look
// (the StyleBook); every change is saved at once. Plain DOM; the 3D preview is mounted by the App into `.gr-preview`.
import {
  CAR_BODIES,
  CAR_DECALS,
  CAR_EXTRAS,
  CAR_FINISHES,
  CAR_HORNS,
  CAR_LIVERIES,
  CAR_PAINTS,
  CAR_SMOKES,
  HELMET_DESIGNS,
  HELMET_NAMES,
  PLATE_MAX,
  newCar,
  type CarBody,
  type CarDecal,
  type CarStyle,
  type DecalSlot,
  DECAL_SLOTS,
} from '../shared/rally.ts';
import { CAR_BODY_NAMES } from '../shared/names.ts';
import { cleanStyle, fitOf, fitStyle, isHex, plateProblem, randomStyle, sameStyle, tidyPlate } from '../shared/styles.ts';
import { DECAL_NAMES, EXTRA_NAMES, FINISH_NAMES, GARAGE_TABS, HORN_NAMES, LIVERY_NAMES, SLOT_NAMES, SMOKE_COLORS, SMOKE_NAMES, SPONSOR_DECALS, SPOILER_NAMES, TAB_NAMES, WHEEL_NAMES, type GarageTab } from '../shared/stylenames.ts';
import { startStyle, type StyleBook } from '../run/styles.ts';
import { lockedBy, type LockKey } from '../run/stylelocks.ts';
import type { Hit } from '../rally/pick.ts';
import { btn, el } from './dom.ts';
import { helmetSvg } from './helmet.ts';

export interface GarageOpts {
  /** Every vehicle's saved look; the garage changes it in place and calls `onStyle` after each change. */
  book: StyleBook;
  /** The vehicle it opens on. */
  body: CarBody;
  /** Medal progress, for the prizes that are still locked. */
  progress: Readonly<Record<string, number>>;
  /** The look of `body` changed (save it, redraw the 3D car). */
  onStyle(body: CarBody, style: CarStyle): void;
  /** Another vehicle was picked: show it. */
  onBody(body: CarBody): void;
  /** Turn the 3D car to show a part. */
  focus(what: Hit['kind'] | DecalSlot): void;
  /** Night view on or off. */
  onNight(on: boolean): void;
  /** Play a horn. */
  onHorn(body: CarBody, kind: CarStyle['horn']): void;
  onBack(): void;
}

export interface GarageView {
  el: HTMLElement;
  /** A tap on the 3D car. */
  pick(hit: Hit): void;
  /** The tab that is open (for tests). */
  tab(): GarageTab;
}

const TAB_FOR_HIT: Record<Hit['kind'], GarageTab> = { decal: 'decals', wheels: 'wheels', spoiler: 'spoiler', plate: 'plate', head: 'helmet', body: 'paint' };

/** Stickers drawn as little pictures (the 3D car's own painter), once its module has loaded. */
const thumbs = new Map<string, string>();
let stickerFn: ((d: CarDecal, n: number) => HTMLCanvasElement) | null = null;
const thumbOf = (d: CarDecal, n: number): string | null => {
  const key = d === 'number' ? `number:${n}` : d;
  const hit = thumbs.get(key);
  if (hit) return hit;
  if (!stickerFn) return null;
  try {
    const url = stickerFn(d, n).toDataURL('image/png');
    thumbs.set(key, url);
    return url;
  } catch {
    return null;
  }
};

export function garageView(o: GarageOpts): GarageView {
  let body = o.body;
  let tab: GarageTab = 'paint';
  let slot: DecalSlot = 'hood';
  /** The looks the vehicle had before each change, for "Ångra" (a few per vehicle). */
  const undo = new Map<CarBody, CarStyle[]>();
  let armed: ReturnType<typeof setTimeout> | null = null;

  const style = (): CarStyle => o.book[body];
  const locked = (key: LockKey) => lockedBy(o.progress, key);

  // ---- the frame ----
  const preview = el('div', 'gr-preview');
  preview.setAttribute('role', 'img');
  preview.setAttribute('aria-label', 'Din bil. Dra för att snurra, tryck på en del för att ändra den.');
  const nameEl = el('b', 'gr-name');
  const hint = el('div', 'gr-hint', 'Dra för att snurra. Tryck på en del av bilen!');
  const select = el('select', 'gr-select');
  select.setAttribute('aria-label', 'Fordon');
  for (const b of CAR_BODIES) {
    const op = el('option', null, CAR_BODY_NAMES[b]);
    op.value = b;
    select.append(op);
  }
  select.addEventListener('change', () => setBody(select.value as CarBody));
  const prev = btn('gr-step', '◀', () => step(-1));
  prev.setAttribute('aria-label', 'Förra fordonet');
  const next = btn('gr-step', '▶', () => step(1));
  next.setAttribute('aria-label', 'Nästa fordon');

  const tabs = el('div', 'gr-tabs');
  tabs.setAttribute('role', 'tablist');
  const tabBtns = new Map<GarageTab, HTMLButtonElement>();
  for (const t of GARAGE_TABS) {
    const b = btn('gr-tab', TAB_NAMES[t], () => openTab(t, true));
    b.setAttribute('role', 'tab');
    tabBtns.set(t, b);
    tabs.append(b);
  }
  const panel = el('div', 'gr-opts');
  panel.setAttribute('role', 'tabpanel');

  const randomBtn = btn('gr-act gr-random', '🎲 Slumpa', () => randomise());
  const undoBtn = btn('gr-act', '↩ Ångra', () => undoLast());
  const resetBtn = btn('gr-act', '↺ Återställ', () => reset());
  let night = false;
  const nightBtn = btn('gr-act gr-night', '🌙 Natt', () => {
    night = !night;
    nightBtn.textContent = night ? '☀️ Dag' : '🌙 Natt';
    o.onNight(night);
  });
  const actions = el('div', 'gr-actions', randomBtn, undoBtn, resetBtn, nightBtn);

  const root = el(
    'div',
    'rg-screen gr',
    el('div', 'gr-top', btn('rg-btn gr-back', '✅ Klar', () => o.onBack()), el('h2', 'gr-title', '🎨 Garaget'), el('div', 'gr-who', prev, select, next)),
    el('div', 'gr-body', el('div', 'gr-stage', preview, el('div', 'gr-stagebar', nameEl, hint), actions), el('div', 'gr-panel', tabs, panel)),
  );

  // ---- change a look ----

  /** Every control that shows a state registers here, so a change only flips pressed states (keyboard focus stays put). */
  let syncs: (() => void)[] = [];
  const sync = (): void => {
    for (const f of syncs) f();
    const st = style();
    undoBtn.disabled = !(undo.get(body)?.length);
    resetBtn.classList.toggle('warn', armed !== null);
    resetBtn.textContent = armed ? 'Tryck igen' : '↺ Återställ';
    resetBtn.disabled = sameStyle(st, startStyle(body)) && !armed;
    nameEl.textContent = `${CAR_BODY_NAMES[body]}`;
    select.value = body;
  };

  const commit = (next: CarStyle, remember = true): void => {
    const fitted = fitStyle(body, next);
    if (remember) {
      const list = undo.get(body) ?? [];
      list.push(structuredClone(style()));
      if (list.length > 20) list.shift();
      undo.set(body, list);
    }
    o.book[body] = fitted;
    o.onStyle(body, fitted);
    sync();
  };
  const change = (patch: Partial<CarStyle>): void => commit({ ...style(), ...patch });

  /** The colour picker fires many times while dragging: one change per frame, and one undo step for the whole drag. */
  let dragging = false;
  let raf = 0;
  const changeLive = (patch: Partial<CarStyle>): void => {
    const cur = { ...style(), ...patch };
    if (!dragging) {
      dragging = true;
      const list = undo.get(body) ?? [];
      list.push(structuredClone(style()));
      if (list.length > 20) list.shift();
      undo.set(body, list);
    }
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => commit(cur, false));
  };

  const randomise = (): void => {
    const st = randomStyle(body, Math.random, style(), (k) => !locked(k as LockKey));
    commit(st);
    openTab(tab, false);
  };
  const undoLast = (): void => {
    const list = undo.get(body);
    const prevStyle = list?.pop();
    if (!prevStyle) return;
    commit(prevStyle, false);
    openTab(tab, false);
  };
  const reset = (): void => {
    if (!armed) {
      armed = setTimeout(() => {
        armed = null;
        sync();
      }, 3500);
      sync();
      return;
    }
    clearTimeout(armed);
    armed = null;
    commit(startStyle(body));
    openTab(tab, false);
  };

  const setBody = (b: CarBody): void => {
    if (b === body) return;
    body = b;
    if (armed) {
      clearTimeout(armed);
      armed = null;
    }
    o.onBody(b);
    if (!GARAGE_TABS.includes(tab)) tab = 'paint';
    openTab(tab, true);
  };
  const step = (d: number): void => setBody(CAR_BODIES[(CAR_BODIES.indexOf(body) + d + CAR_BODIES.length) % CAR_BODIES.length]!);

  // ---- building blocks ----

  const section = (title: string, ...kids: (HTMLElement | null)[]): HTMLElement => el('div', 'gr-sec', el('div', 'arc-h gr-sech', title), ...kids);

  /** A button that shows a state: `on()` says whether it is the picked one. */
  const chip = (label: string | Node, on: () => boolean, set: () => void, cls = '', lock?: LockKey): HTMLButtonElement => {
    const m = lock ? locked(lock) : null;
    const b = btn(`rg-chipbtn gr-chip ${cls}`.trim(), m ? [typeof label === 'string' ? label : label, el('small', 'gr-lock', `🏅 Medalj: ${m.name}`)] : label, m ? undefined : set);
    if (m) {
      b.disabled = true;
      b.title = `${m.name}: ${m.title}`;
    }
    syncs.push(() => b.setAttribute('aria-pressed', String(on())));
    b.setAttribute('aria-pressed', String(on()));
    return b;
  };

  /** A palette of colour dots plus the colour picker for any colour. `none` adds a "no colour" dot. */
  const colours = (get: () => string, set: (c: string) => void, opts: { none?: { label: string; set: () => void; on: () => boolean } } = {}): HTMLElement => {
    const row = el('div', 'gr-swatches');
    if (opts.none) row.append(chip(opts.none.label, opts.none.on, opts.none.set, 'gr-nonechip'));
    for (const c of CAR_PAINTS) {
      const b = btn('rg-swatch gr-sw', '', () => set(c));
      b.style.background = c;
      b.setAttribute('aria-label', `Färg ${c}`);
      syncs.push(() => b.setAttribute('aria-pressed', String(get().toLowerCase() === c)));
      b.setAttribute('aria-pressed', String(get().toLowerCase() === c));
      row.append(b);
    }
    const input = el('input', 'gr-colorin');
    input.type = 'color';
    input.value = isHex(get()) ? get() : '#ff0000';
    input.setAttribute('aria-label', 'Egen färg');
    input.addEventListener('input', () => set(input.value));
    syncs.push(() => {
      if (isHex(get()) && document.activeElement !== input) input.value = get();
    });
    const custom = el('label', 'gr-custom rg-chipbtn', '🎨 Egen färg', input);
    return el('div', 'gr-colours', row, custom);
  };

  const chips = <T extends string>(list: readonly T[], names: Record<T, string>, get: () => T, set: (v: T) => void, lockOf?: (v: T) => LockKey | undefined): HTMLElement => {
    const row = el('div', 'gr-chips');
    for (const v of list) row.append(chip(names[v], () => get() === v, () => set(v), '', lockOf?.(v)));
    return row;
  };

  // ---- the tabs ----

  const fill = (): void => {
    syncs = [];
    panel.replaceChildren();
    const f = fitOf(body);
    const st = (): CarStyle => style();
    switch (tab) {
      case 'paint':
        panel.append(
          section('Lack', colours(() => st().paint, (c) => changeLive({ paint: c }))),
          section('Yta', chips(CAR_FINISHES, FINISH_NAMES, () => st().finish, (v) => change({ finish: v }))),
        );
        break;
      case 'pattern':
        panel.append(
          section('Mönster', chips(CAR_LIVERIES, LIVERY_NAMES, () => st().livery, (v) => change({ livery: v }), (v) => `livery:${v}`)),
          section('Andra färgen (för mönster, spoiler och kjolar)', colours(() => st().paint2, (c) => changeLive({ paint2: c }))),
        );
        break;
      case 'decals': {
        const slots = el('div', 'gr-chips gr-slots');
        for (const s of DECAL_SLOTS) {
          const b = chip(SLOT_NAMES[s], () => slot === s, () => {
            slot = s;
            o.focus(s);
            sync();
          }, 'gr-slot');
          slots.append(b);
        }
        const grid = el('div', 'gr-decals');
        const decalBtn = (d: CarDecal | null): HTMLButtonElement => {
          const m = d ? locked(`decal:${d}`) : null;
          const label = d ? DECAL_NAMES[d] : 'Ingen dekal';
          const b = btn('gr-decal', d ? '' : '🚫', m ? undefined : () => {
            const decals = { ...st().decals };
            if (d) decals[slot] = d;
            else delete decals[slot];
            change({ decals });
          });
          b.setAttribute('aria-label', m ? `${label}. Medalj: ${m.name}` : label);
          b.title = m ? `🏅 Medalj: ${m.name}` : label;
          if (d) {
            const url = thumbOf(d, st().number);
            if (url) {
              const img = el('img');
              img.src = url;
              img.alt = '';
              img.draggable = false;
              b.append(img);
            } else b.textContent = label.slice(0, 3);
          }
          if (m) {
            b.disabled = true;
            b.append(el('small', 'gr-lock', '🏅'));
          }
          syncs.push(() => b.setAttribute('aria-pressed', String((st().decals[slot] ?? null) === d)));
          b.setAttribute('aria-pressed', String((st().decals[slot] ?? null) === d));
          return b;
        };
        const sponsors = el('div', 'gr-decals');
        sponsors.append(decalBtn(null));
        for (const d of SPONSOR_DECALS) sponsors.append(decalBtn(d));
        const rest = CAR_DECALS.filter((d) => !SPONSOR_DECALS.includes(d));
        for (const d of rest) grid.append(decalBtn(d));
        const numberRow = el(
          'div',
          'gr-number',
          btn('rg-chipbtn gr-stepbtn', '−', () => change({ number: st().number <= 1 ? 99 : st().number - 1 })),
          el('output', 'gr-num', String(st().number)),
          btn('rg-chipbtn gr-stepbtn', '+', () => change({ number: st().number >= 99 ? 1 : st().number + 1 })),
        );
        numberRow.querySelectorAll('button')[0]!.setAttribute('aria-label', 'Lägre nummer');
        numberRow.querySelectorAll('button')[1]!.setAttribute('aria-label', 'Högre nummer');
        syncs.push(() => {
          numberRow.querySelector('output')!.textContent = String(st().number);
        });
        panel.append(section('Var på bilen? (tryck på bilen eller välj här)', slots), section('Sponsorer', sponsors), section('Klistermärken', grid), section('Racingnummer', numberRow));
        // the stickers are drawn by the 3D car's painter: pictures appear once it has loaded
        if (!stickerFn) void loadStickers().then(() => tab === 'decals' && fill());
        break;
      }
      case 'wheels':
        panel.append(
          f.wheels.length > 1 ? section('Fälgar', chips(f.wheels, WHEEL_NAMES, () => st().wheels, (v) => change({ wheels: v }), (v) => `wheels:${v}`)) : section('Däck', el('p', 'gr-note', 'Det här fordonet har egna terrängdäck. Du väljer färg på fälgarna.')),
          section('Fälgfärg', colours(() => st().rimColor, (c) => changeLive({ rimColor: c }))),
        );
        break;
      case 'spoiler':
        panel.append(section('Spoiler', chips(f.spoilers, SPOILER_NAMES, () => st().spoiler, (v) => change({ spoiler: v }))), section('Färg på spoilern', colours(() => st().paint2, (c) => changeLive({ paint2: c }))));
        if (f.spoilers.length < 4) panel.append(el('p', 'gr-note', 'De stora spoilrarna passar inte på det här fordonet.'));
        break;
      case 'extras': {
        const row = el('div', 'gr-chips');
        for (const e of f.extras) {
          row.append(
            chip(
              EXTRA_NAMES[e],
              () => st().extras.includes(e),
              () => change({ extras: st().extras.includes(e) ? st().extras.filter((x) => x !== e) : [...st().extras, e] }),
            ),
          );
        }
        panel.append(
          section('Tillbehör (flera på en gång)', row),
          section(
            'Underglöd (syns i mörker, prova 🌙 Natt)',
            colours(() => st().glow ?? '', (c) => changeLive({ glow: c }), { none: { label: '🚫 Ingen', on: () => !st().glow, set: () => change({ glow: null }) } }),
          ),
        );
        if (f.extras.length < CAR_EXTRAS.length) panel.append(el('p', 'gr-note', 'Sidokjolar och snorkel passar inte på det här fordonet.'));
        break;
      }
      case 'horn':
        panel.append(
          section(
            'Tuta (tryck för att lyssna)',
            chips(CAR_HORNS, HORN_NAMES, () => st().horn, (v) => {
              change({ horn: v });
              o.onHorn(body, v);
            }),
          ),
          el('p', 'gr-note', 'I loppet tutar du med H eller tutknappen.'),
        );
        break;
      case 'smoke': {
        const row = el('div', 'gr-chips');
        for (const s of CAR_SMOKES) {
          const dot = el('i', 'gr-dot');
          dot.style.background = SMOKE_COLORS[s];
          row.append(chip(el('span', 'gr-withdot', dot, SMOKE_NAMES[s].replace(/^\S+\s/, '')), () => st().smoke === s, () => change({ smoke: s }), '', `smoke:${s}`));
        }
        panel.append(section('Rök från däcken och turboflamma', row), el('p', 'gr-note', 'Syns när du sladdar och när du kör nitro.'));
        break;
      }
      case 'plate': {
        const input = el('input', 'gr-plate');
        input.type = 'text';
        input.maxLength = PLATE_MAX + 4;
        input.value = st().plate;
        input.placeholder = `RALLY ${st().number}`;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('autocapitalize', 'characters');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('aria-label', 'Text på skylten');
        const msg = el('p', 'gr-msg');
        msg.setAttribute('role', 'status');
        const show = (): void => {
          const bad = plateProblem(input.value);
          msg.textContent = bad || `${tidyPlate(input.value).length}/${PLATE_MAX} tecken. Tomt ger "RALLY ${st().number}".`;
          msg.classList.toggle('bad', !!bad);
          input.classList.toggle('bad', !!bad);
        };
        input.addEventListener('input', () => {
          const bad = plateProblem(input.value);
          show();
          if (!bad) {
            const t = tidyPlate(input.value);
            if (t !== st().plate) change({ plate: t });
          }
        });
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') input.blur();
        });
        show();
        panel.append(section('Skylt bak på bilen', input, msg));
        break;
      }
      case 'helmet': {
        const row = el('div', 'gr-chips gr-helmets');
        const helm = (d: (typeof HELMET_DESIGNS)[number]): HTMLButtonElement => {
          const b = chip('', () => st().helmet === d, () => change({ helmet: d }), 'gr-helmbtn');
          b.setAttribute('aria-label', `Hjälm: ${HELMET_NAMES[d]}`);
          b.title = HELMET_NAMES[d];
          const draw = (): void => b.replaceChildren(helmetSvg({ color: st().helmetColor || st().paint, trim: st().paint2, design: d }), el('small', null, HELMET_NAMES[d]));
          draw();
          syncs.push(draw);
          return b;
        };
        for (const d of HELMET_DESIGNS) row.append(helm(d));
        const all = btn('rg-chipbtn gr-all', '👥 Samma hjälm på alla fordon', () => {
          const h = { helmet: st().helmet, helmetColor: st().helmetColor };
          for (const b of CAR_BODIES) if (b !== body) o.book[b] = fitStyle(b, cleanStyle({ ...o.book[b], ...h }, o.book[b])), o.onStyle(b, o.book[b]);
          all.textContent = '✅ Klart!';
          setTimeout(() => (all.textContent = '👥 Samma hjälm på alla fordon'), 1500);
        });
        panel.append(
          section('Mönster', row),
          section('Hjälmens färg', colours(() => st().helmetColor, (c) => changeLive({ helmetColor: c }), { none: { label: '🚗 Som bilen', on: () => !st().helmetColor, set: () => change({ helmetColor: '' }) } })),
          all,
        );
        break;
      }
    }
    sync();
  };

  function openTab(t: GarageTab, jump: boolean): void {
    tab = t;
    for (const [k, b] of tabBtns) {
      b.setAttribute('aria-selected', String(k === t));
      b.classList.toggle('on', k === t);
    }
    fill();
    panel.scrollTop = 0;
    tabBtns.get(t)?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
    if (jump) {
      const what = t === 'decals' ? slot : t === 'wheels' ? 'wheels' : t === 'spoiler' ? 'spoiler' : t === 'plate' ? 'plate' : t === 'helmet' ? 'head' : null;
      if (what) o.focus(what);
    }
  }

  const loadStickers = async (): Promise<void> => {
    try {
      stickerFn = (await import('../rally/style.ts')).sticker;
    } catch {
      stickerFn = null;
    }
  };

  openTab('paint', false);
  void loadStickers().then(() => {
    if (tab === 'decals') fill();
  });
  sync();

  return {
    el: root,
    tab: () => tab,
    pick(hit) {
      if (hit.kind === 'decal') slot = hit.slot;
      openTab(TAB_FOR_HIT[hit.kind], false);
      o.focus(hit.kind === 'decal' ? hit.slot : hit.kind);
    },
  };
}

/** A new car for the 3D preview with this look. */
export const garageCar = (body: CarBody, style: CarStyle): ReturnType<typeof newCar> => {
  const c = newCar(1, body, CAR_BODY_NAMES[body]);
  c.style = style;
  return c;
};
