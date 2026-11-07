// The front end around the rally game: title screen, course and car pick, the race, pause and the result
// screen. Plain DOM. It builds the GameContext (input, audio, quality, touch) and starts the rally with a
// RallyOptions; the race reports its result through options.onDone and ctx.end.
import { Input } from './arcade/input.ts';
import type { Button, GameContext, GameFactory, GameInstance, TouchLayout } from './arcade/types.ts';
import { RALLY_HOW_TO, rallyTouch } from './rally/info.ts';
import type { RallyOptions, RallyResult } from './rally/options.ts';
import { CAR_BODIES, CAR_PAINTS, RALLY_COURSES, RALLY_COURSE_DEFS, defaultRules, newCar, type CarBody, type RallyCourse } from './shared/rally.ts';
import { CAR_BODY_NAMES, RALLY_COURSE_NAMES } from './shared/names.ts';
import { loadPrefs, savePrefs, type Prefs } from './prefs.ts';
import { fmtTime } from './rally/util.ts';

type State = 'menu' | 'loading' | 'playing' | 'paused' | 'result';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
}

export class App {
  private root = el('div', 'arcade');
  private stage = el('div', 'arc-stage');
  private touchEl = el('div', 'arc-touch');
  private bar = el('div', 'arc-bar');
  private card = el('div', 'arc-card');
  private rotate = el('div', 'arc-rotate', 'Vrid telefonen till liggande läge 📱↔️');
  private input = new Input();
  private audio: AudioContext | null = null;
  private master: GainNode | null = null;
  private state: State = 'menu';
  private inst: GameInstance | null = null;
  /** Guards against a game that finished loading after the player left. */
  private run = 0;
  private touch: boolean;
  private quality: 'high' | 'low';
  private prefs: Prefs;
  private opts: RallyOptions | null = null;
  private result: RallyResult | null = null;
  private preview: { update(car: ReturnType<typeof newCar>): void; dispose(): void } | null = null;
  private factory: Promise<GameFactory> | null = null;

  constructor(private parent: HTMLElement) {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.touch = coarse;
    const small = Math.min(screen.width, screen.height) < 700;
    this.quality = coarse || small ? 'low' : 'high';
    this.prefs = loadPrefs();
    this.root.append(this.stage, this.touchEl, this.bar, this.card, this.rotate);
    parent.append(this.root);

    const pause = el('button', 'arc-btn-round', '⏸');
    pause.title = 'Paus';
    pause.setAttribute('aria-label', 'Paus');
    pause.addEventListener('click', () => this.pause());
    this.bar.append(pause);

    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onHidden);
    // a touch on a screen that also has a mouse: show the touch buttons from now on
    this.root.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType !== 'touch' || this.touch) return;
        this.touch = true;
        if (this.state === 'playing' && this.opts) this.buildTouch(rallyTouch(this.opts));
      },
      true,
    );
    // the page never scrolls or zooms
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('gesturestart', (e) => e.preventDefault());
    this.menu();
    // so a test (or a curious grown-up) can reach the app
    (window as unknown as { __app: App }).__app = this;
  }

  // ---- state ----

  private set(s: State): void {
    this.state = s;
    this.root.dataset.state = s;
  }

  private show(...kids: Node[]): void {
    this.card.className = 'arc-card show' + (this.state === 'menu' ? ' menu' : '');
    this.card.replaceChildren(...kids);
  }

  private hideCard(): void {
    this.card.className = 'arc-card';
    this.card.replaceChildren();
  }

  private disposePreview(): void {
    this.preview?.dispose();
    this.preview = null;
  }

  private ensureAudio(): void {
    if (this.audio) {
      void this.audio.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.audio = new AC();
      this.master = this.audio.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.audio.destination);
      void this.audio.resume().catch(() => {});
    } catch {
      this.audio = null;
      this.master = null;
    }
  }

  // ---- menu ----

  private menu(): void {
    this.stopGame();
    this.set('menu');
    this.touchEl.replaceChildren();
    this.stage.replaceChildren();
    const p = this.prefs;

    const courseRow = el('div', 'arc-row');
    const bodyRow = el('div', 'arc-row');
    const paintRow = el('div', 'arc-row');
    const previewBox = el('div', 'arc-preview');
    const mkCar = () => newCar(1, p.body, CAR_BODY_NAMES[p.body], p.paint);

    const chips = <T extends string>(row: HTMLElement, items: readonly T[], label: (t: T) => string, get: () => T, set: (t: T) => void): void => {
      const draw = (): void => {
        row.replaceChildren(
          ...items.map((it) => {
            const b = el('button', 'arc-chip', label(it));
            b.type = 'button';
            b.setAttribute('aria-pressed', String(get() === it));
            b.addEventListener('click', () => {
              set(it);
              savePrefs(p);
              draw();
              this.preview?.update(mkCar());
            });
            return b;
          }),
        );
      };
      draw();
    };
    chips(courseRow, RALLY_COURSES, (c: RallyCourse) => `${RALLY_COURSE_DEFS[c].emoji} ${RALLY_COURSE_NAMES[c]}`, () => p.course, (c) => (p.course = c));
    chips(bodyRow, CAR_BODIES, (b: CarBody) => CAR_BODY_NAMES[b], () => p.body, (b) => (p.body = b));
    const paints = CAR_PAINTS.slice(0, 12);
    const drawPaints = (): void => {
      paintRow.replaceChildren(
        ...paints.map((c) => {
          const b = el('button', 'arc-chip arc-swatch');
          b.type = 'button';
          b.style.background = c;
          b.setAttribute('aria-label', c);
          b.setAttribute('aria-pressed', String(p.paint === c));
          b.addEventListener('click', () => {
            p.paint = c;
            savePrefs(p);
            drawPaints();
            this.preview?.update(mkCar());
          });
          return b;
        }),
      );
    };
    drawPaints();

    const go = el('button', 'arc-go', 'Kör!');
    go.type = 'button';
    go.addEventListener('click', () => void this.start());
    const how = el('ul', 'arc-how', ...(this.touch ? RALLY_HOW_TO.touch : RALLY_HOW_TO.keys).map((l) => el('li', null, l)));

    this.show(
      el(
        'div',
        'arc-panel menu-panel',
        el('div', 'arc-head', el('h1', 'arc-title', 'Galna Rallyt'), el('p', 'arc-sub', 'Kom först i mål!')),
        el('div', 'arc-picks', el('div', 'arc-h', 'Bana'), courseRow, el('div', 'arc-h', 'Bil'), bodyRow, previewBox, paintRow),
        go,
        how,
      ),
    );
    go.focus({ preventScroll: true });
    void this.mountPreview(previewBox, mkCar());
  }

  private async mountPreview(box: HTMLElement, car: ReturnType<typeof newCar>): Promise<void> {
    this.disposePreview();
    if (getComputedStyle(box).display === 'none') return;
    try {
      const { mountCarPreview } = await import('./rally/preview.ts');
      if (this.state !== 'menu' || !box.isConnected) return;
      this.preview = mountCarPreview(box, car, { spin: true, quality: this.quality, background: 'radial-gradient(ellipse at 50% 40%, #3a2b63 0%, #1a1233 70%)' });
    } catch (err) {
      console.warn('car preview unavailable', err);
      box.style.display = 'none';
    }
  }

  // ---- playing ----

  private rallyOptions(): RallyOptions {
    const p = this.prefs;
    const car = newCar(1, p.body, CAR_BODY_NAMES[p.body], p.paint);
    return {
      rules: { ...defaultRules(), course: p.course },
      car,
      onDone: (r) => {
        this.result = r;
      },
    };
  }

  private async start(): Promise<void> {
    this.stopGame();
    const run = ++this.run;
    this.disposePreview();
    this.set('loading');
    this.ensureAudio();
    this.show(el('div', 'arc-panel', el('div', 'arc-loading', '🏎️ Laddar…')));
    this.opts = this.rallyOptions();
    this.result = null;
    let factory: GameFactory;
    try {
      this.factory ??= import('./rally/index.ts').then((m) => m.default);
      factory = await this.factory;
    } catch (err) {
      console.error(err);
      this.factory = null;
      if (run === this.run) this.error('Spelet gick inte att ladda. Kolla nätet och försök igen.');
      return;
    }
    if (run !== this.run) return;
    this.input.clear();
    this.hideCard();
    this.set('playing');
    this.buildTouch(rallyTouch(this.opts));
    let ended = false;
    const dprCap = this.quality === 'low' ? 1.5 : 2;
    const ctx: GameContext = {
      root: this.stage,
      input: this.input,
      audio: this.audio,
      out: this.master,
      player: { name: 'Du', color: this.prefs.paint },
      touch: this.touch,
      quality: this.quality,
      dpr: Math.min(window.devicePixelRatio || 1, dprCap),
      options: this.opts,
      end: (score, detail) => {
        if (ended || run !== this.run) return;
        ended = true;
        // let the game's last frame show behind the card
        queueMicrotask(() => this.finish(score, detail));
      },
      requestPause: () => this.pause(),
    };
    try {
      this.inst = factory(ctx);
    } catch (err) {
      console.error(err);
      this.error('Något gick fel när spelet startade.');
    }
  }

  private stopGame(): void {
    this.run++;
    this.inst?.destroy();
    this.inst = null;
    this.stage.replaceChildren();
    this.stage.removeAttribute('style');
    this.input.clear();
    this.touchEl.replaceChildren();
    this.hideCard();
    this.disposePreview();
  }

  private error(msg: string): void {
    this.set('menu');
    const b = el('button', 'arc-btn', 'Till menyn');
    b.addEventListener('click', () => this.menu());
    this.show(el('div', 'arc-panel', el('div', 'arc-detail', msg), b));
  }

  // ---- pause ----

  private pause(): void {
    if (this.state !== 'playing' || !this.inst) return;
    this.set('paused');
    this.inst.pause();
    this.input.clear();
    const cont = el('button', 'arc-go', 'Fortsätt');
    cont.addEventListener('click', () => this.resume());
    const again = el('button', 'arc-btn', 'Starta om');
    again.addEventListener('click', () => void this.start());
    const quit = el('button', 'arc-btn', 'Till menyn');
    quit.addEventListener('click', () => this.menu());
    this.show(el('div', 'arc-panel', el('h1', 'arc-title', 'Paus'), cont, el('div', 'arc-stack', again, quit)));
    cont.focus({ preventScroll: true });
  }

  private resume(): void {
    if (this.state !== 'paused' || !this.inst) return;
    this.hideCard();
    this.input.clear();
    this.set('playing');
    this.inst.resume();
  }

  // ---- result ----

  private finish(score: number, detail?: string): void {
    if (this.state !== 'playing') return;
    this.set('result');
    this.input.clear();
    this.touchEl.replaceChildren();
    const r = this.result;
    const title = r ? (r.finished ? (r.place === 1 ? '🏆 Du vann!' : `${r.place}:a plats`) : 'Nästan i mål!') : 'Målgång';
    const lines: Node[] = [el('h1', 'arc-title', title)];
    if (r) {
      if (r.finished) lines.push(el('div', 'arc-detail', `⏱️ ${fmtTime(r.time / 1000)}${r.medal ? ' ' + { gold: '🥇', silver: '🥈', bronze: '🥉' }[r.medal] : ''}`));
      lines.push(el('div', 'arc-kr', `+${r.kronor} kr`));
    } else {
      lines.push(el('div', 'arc-detail', detail ?? `${score} poäng`));
    }
    const again = el('button', 'arc-go', 'Kör igen');
    again.addEventListener('click', () => void this.start());
    const menu = el('button', 'arc-btn', 'Till menyn');
    menu.addEventListener('click', () => this.menu());
    lines.push(again, el('div', 'arc-stack', menu));
    // the game's last frame stays behind the card
    this.show(el('div', 'arc-panel', ...lines));
    again.focus({ preventScroll: true });
  }

  // ---- keys and focus ----

  private onKey = (e: KeyboardEvent): void => {
    if (e.type === 'keydown' && e.code === 'Escape' && !e.repeat) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      e.preventDefault();
      return;
    }
    if (this.state !== 'playing') return;
    if (this.input.keyEvent(e)) e.preventDefault();
  };

  private onBlur = (): void => {
    this.input.clear();
    this.pause();
  };

  private onHidden = (): void => {
    if (document.hidden) {
      this.input.clear();
      this.pause();
    }
  };

  // ---- touch controls ----

  private hold(node: HTMLElement, b: Button): void {
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      node.setPointerCapture(e.pointerId);
      node.classList.add('down');
      this.input.touchButton(b, true);
    };
    const up = (e: PointerEvent): void => {
      e.stopPropagation();
      if (!node.classList.contains('down')) return;
      node.classList.remove('down');
      this.input.touchButton(b, false);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', up);
  }

  private buildTouch(rallyOpts: RallyOptions | TouchLayout): void {
    this.touchEl.replaceChildren();
    this.input.touchStickMove(0, 0);
    if (!this.touch) return;
    const layout: TouchLayout = 'pad' in rallyOpts ? rallyOpts : rallyTouch(rallyOpts);
    const left = el('div', `arc-pad ${layout.pad}`);
    if (layout.pad === 'dpad' || layout.pad === 'leftright') {
      const dirs: [Button, string][] = layout.pad === 'dpad' ? [['up', '▲'], ['left', '◀'], ['right', '▶'], ['down', '▼']] : [['left', '◀'], ['right', '▶']];
      for (const [b, label] of dirs) {
        const k = el('div', `arc-key ${b}`, label);
        this.hold(k, b);
        left.append(k);
      }
    }
    const right = el('div', 'arc-buttons-pad');
    layout.buttons.forEach((bt, i) => {
      const k = el('div', `arc-fire n${i}`, bt.label);
      this.hold(k, bt.button);
      right.append(k);
    });
    this.touchEl.append(left, right);
  }
}
