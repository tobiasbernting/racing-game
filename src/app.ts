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
import { buildMods } from './run/trinkets.ts';
import { chooseEvent, continueAfterRace, currentNode, currentPlan, enterNode, finishNode, pickReward, submitRace, backToMap } from './run/flow.ts';
import { buyHeart, buyRepair, buyTrinket, reroll, workshopPaint, workshopRepair, workshopUpgrade } from './run/economy.ts';
import { BODY_UNLOCK, trophiesFor, unlockedBodies, unlockedTrinkets, type Meta } from './run/meta.ts';
import { newSeed } from './run/rng.ts';
import { allNodes, type NodeType } from './run/map.ts';
import { clearRun, loadMeta, loadRun, saveMeta, saveRun } from './run/save.ts';
import { mapOf, newRun, trinketCount, type RunState } from './run/state.ts';
import { btn, arrowNav, el } from './ui/dom.ts';
import { confettiRain, pryl, sfx } from './ui/juice.ts';
import { saveSettings, settings } from './settings.ts';
import { trinketById } from './run/trinkets.ts';
import { bagView, collectionView, eventView, mapView, menuView, overView, pickView, postraceView, preraceView, rewardView, settingsView, shopView, titleView, workshopView, type PickSel } from './ui/views.ts';

type State = 'menu' | 'loading' | 'playing' | 'paused' | 'result';
/** Quick race (one race, the old front end) or a run (the roguelite). */
type Mode = 'quick' | 'run';

export class App {
  private root = el('div', 'arcade');
  private stage = el('div', 'arc-stage');
  private touchEl = el('div', 'arc-touch');
  private bar = el('div', 'arc-bar');
  private card = el('div', 'arc-card');
  private rotate = el('div', 'arc-rotate', 'Vrid telefonen. Liggande. Nu. 📱↔️');
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
  private mode: Mode = 'quick';
  private meta: Meta = loadMeta();
  private runState: RunState | null = null;
  private fpsEl: HTMLElement | null = null;
  private fpsStop: (() => void) | null = null;
  /** The car and driver being picked for a new run. */
  private sel: PickSel;

  constructor(private parent: HTMLElement) {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.touch = coarse;
    const small = Math.min(screen.width, screen.height) < 700;
    this.quality = coarse || small ? 'low' : 'high';
    this.prefs = loadPrefs();
    this.sel = { body: this.meta.body, driver: this.meta.driver, paint: this.meta.paint };
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
    this.deviceSetup();
    this.applySettings();
    // a run that ended (and was counted) before a reload shows its last card again; otherwise the title
    const saved = loadRun();
    if (saved && saved.status !== 'running') this.resumeRun(saved);
    else this.title();
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

  /** A run screen: the card is the whole screen, laid out by the screen itself. */
  private showScreen(view: HTMLElement): void {
    this.card.className = 'arc-card show menu rg';
    this.card.replaceChildren(view);
    // the main button first, else the first road on the map, else any button
    for (const sel of ['.rg-go:not(:disabled)', '.rg-node.reach', 'button:not(:disabled)']) {
      const first = view.querySelector<HTMLElement>(sel);
      if (first) {
        first.focus({ preventScroll: true });
        break;
      }
    }
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
      this.master.gain.value = settings.volume;
      this.master.connect(this.audio.destination);
      void this.audio.resume().catch(() => {});
    } catch {
      this.audio = null;
      this.master = null;
    }
  }

  /** Volume, the FPS counter: whatever the settings panel changed. */
  private applySettings(): void {
    if (this.master) this.master.gain.value = settings.volume;
    if (settings.fps && !this.fpsStop) this.startFps();
    else if (!settings.fps && this.fpsStop) this.fpsStop();
  }

  private startFps(): void {
    const box = (this.fpsEl ??= el('div', 'arc-fps', '-- fps'));
    this.root.append(box);
    let frames = 0;
    let t0 = performance.now();
    let raf = 0;
    const tick = (now: number): void => {
      frames++;
      if (now - t0 >= 500) {
        box.textContent = `${Math.round((frames * 1000) / (now - t0))} fps`;
        frames = 0;
        t0 = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    this.fpsStop = () => {
      cancelAnimationFrame(raf);
      box.remove();
      this.fpsStop = null;
    };
  }

  /** Fullscreen where the browser lets us (not iPhone Safari: there the home screen app is the way). */
  private fullscreenState(): boolean | null {
    const d = document as Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null };
    if (!(d.fullscreenEnabled || d.webkitFullscreenEnabled)) return null;
    return !!(d.fullscreenElement || d.webkitFullscreenElement);
  }

  private toggleFullscreen(): void {
    const d = document as Document & { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element | null };
    const e = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) void (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      else {
        const r = e.requestFullscreen?.({ navigationUI: 'hide' }) ?? e.webkitRequestFullscreen?.();
        void Promise.resolve(r)
          .then(() => {
            // a phone plays sideways
            const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
            if (this.touch && Math.min(screen.width, screen.height) < 700) return o?.lock?.('landscape');
          })
          .catch(() => {});
      }
    } catch {
      // not allowed here: nothing to do
    }
  }

  /** The first touch: audio wakes up and a phone or tablet goes fullscreen; no zoom, no callouts, ever. */
  private deviceSetup(): void {
    const first = (e: Event): void => {
      this.ensureAudio();
      this.applySettings();
      const touchy = (e as PointerEvent).pointerType === 'touch' || this.touch;
      if (touchy && this.fullscreenState() === false && !matchMedia('(display-mode: standalone)').matches) this.toggleFullscreen();
      if (e.type !== 'keydown' || this.audio) {
        for (const t of ['pointerup', 'keydown'] as const) window.removeEventListener(t, first, true);
      }
    };
    for (const t of ['pointerup', 'keydown'] as const) window.addEventListener(t, first, true);
    // the audio can fall asleep again (a call, the tab in the background): wake it with the next touch
    window.addEventListener('pointerdown', () => void this.audio?.resume().catch(() => {}), true);
    // no double-tap zoom, no pinch, no long-press menus
    let lastTap = 0;
    this.root.addEventListener(
      'touchend',
      (e) => {
        const now = Date.now();
        if (now - lastTap < 350 && (e.target as HTMLElement).closest?.('button') === null) e.preventDefault();
        lastTap = now;
      },
      { passive: false },
    );
    this.root.addEventListener('dblclick', (e) => e.preventDefault());
    this.root.addEventListener('dragstart', (e) => e.preventDefault());
    this.root.addEventListener('selectstart', (e) => e.preventDefault());
    for (const t of ['gesturechange', 'gestureend']) this.root.addEventListener(t, (e) => e.preventDefault());
    document.addEventListener('fullscreenchange', () => {
      if (this.card.querySelector('.rg-settings')) this.openSettings(this.settingsBack);
    });
  }

  private settingsBack: () => void = () => {};

  /** The settings panel; `back` redraws whatever it was opened from. */
  private openSettings(back: () => void): void {
    this.settingsBack = back;
    this.showScreen(
      settingsView({
        settings,
        calm: this.meta.calm,
        fullscreen: this.fullscreenState(),
        onChange: () => {
          saveSettings();
          this.applySettings();
        },
        onCalm: (on) => {
          this.meta.calm = on;
          saveMeta(this.meta);
        },
        onFullscreen: () => this.toggleFullscreen(),
        onClose: () => {
          saveSettings();
          back();
        },
      }),
    );
  }

  // ---- menu ----

  private quickMenu(): void {
    this.mode = 'quick';
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
    const back = btn('arc-btn back', '← Titel', () => this.title());
    back.setAttribute('aria-label', 'Tillbaka till titeln');
    const how = el('ul', 'arc-how', ...(this.touch ? RALLY_HOW_TO.touch : RALLY_HOW_TO.keys).map((l) => el('li', null, l)));

    this.show(
      el(
        'div',
        'arc-panel menu-panel',
        el('div', 'arc-head', back, el('h1', 'arc-title', 'Snabbrace'), el('p', 'arc-sub', 'Ett lopp. Välj bana och bil, sen gas.')),
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
    if (this.mode === 'run' && this.runState) return this.runOptions(this.runState);
    const p = this.prefs;
    const car = newCar(1, p.body, CAR_BODY_NAMES[p.body], p.paint);
    return {
      rules: { ...defaultRules(), course: p.course },
      car,
      // each quick race gets its own seed: the course comes mirrored or turned round, with other pads and coins
      seed: (Math.random() * 0xffffff) | 0,
      coins: false,
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
      if (run === this.run) this.error('Spelet vägrade ladda. Kolla nätet och försök igen.');
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
      player: { name: 'Du', color: this.opts.car.style.paint },
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
      this.error('Något small när spelet startade.');
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
    b.addEventListener('click', () => this.title());
    this.show(el('div', 'arc-panel', el('div', 'arc-detail', msg), b));
  }

  // ---- pause ----

  private pause(): void {
    if (this.state !== 'playing' || !this.inst) return;
    this.set('paused');
    this.inst.pause();
    this.input.clear();
    this.pauseCard();
  }

  private pauseCard(): void {
    const cont = el('button', 'arc-go', 'Fortsätt');
    cont.addEventListener('click', () => this.resume());
    const again = el('button', 'arc-btn', this.mode === 'run' ? 'Kör om loppet' : 'Starta om');
    again.addEventListener('click', () => void this.start());
    const quit = el('button', 'arc-btn', this.mode === 'run' ? 'Till kartan' : 'Till titeln');
    quit.addEventListener('click', () => (this.mode === 'run' ? this.showRun() : this.title()));
    const opts = el('button', 'arc-btn', '⚙️ Inställningar');
    opts.addEventListener('click', () => this.openSettings(() => this.pauseCard()));
    this.show(el('div', 'arc-panel', el('h1', 'arc-title', 'Paus'), cont, el('div', 'arc-stack', opts, again, quit)));
    cont.focus({ preventScroll: true });
  }

  private resume(): void {
    if (this.state !== 'paused' || !this.inst) return;
    saveSettings();
    this.hideCard();
    this.input.clear();
    this.set('playing');
    this.inst.resume();
  }

  // ---- result ----

  private finish(score: number, detail?: string): void {
    if (this.state !== 'playing') return;
    if (this.mode === 'run' && this.runState) {
      this.raceDone(this.result);
      return;
    }
    this.set('result');
    this.input.clear();
    this.touchEl.replaceChildren();
    const r = this.result;
    const title = r ? (r.finished ? (r.place === 1 ? '🏆 DU VANN!' : `${r.place}:a plats`) : 'Du kom aldrig i mål') : 'Målgång';
    const lines: Node[] = [el('h1', 'arc-title', title)];
    if (r) {
      if (r.finished) lines.push(el('div', 'arc-detail', `⏱️ ${fmtTime(r.time / 1000)}${r.medal ? ' ' + { gold: '🥇', silver: '🥈', bronze: '🥉' }[r.medal] : ''}`));
      lines.push(el('div', 'arc-kr', `+${r.kronor} kr`));
    } else {
      lines.push(el('div', 'arc-detail', detail ?? `${score} poäng`));
    }
    const again = el('button', 'arc-go', 'Kör igen!');
    again.addEventListener('click', () => void this.start());
    const menu = el('button', 'arc-btn', 'Till titeln');
    menu.addEventListener('click', () => this.title());
    lines.push(again, el('div', 'arc-stack', menu));
    // the game's last frame stays behind the card
    this.show(el('div', 'arc-panel', ...lines));
    again.focus({ preventScroll: true });
  }

  // ---- the title and the run ----

  private title(): void {
    this.mode = 'quick';
    this.stopGame();
    this.set('menu');
    this.touchEl.replaceChildren();
    this.stage.replaceChildren();
    this.meta = loadMeta();
    const saved = loadRun();
    this.showScreen(
      titleView({
        meta: this.meta,
        saved,
        onNew: () => this.pickScreen(),
        onContinue: () => {
          if (saved) this.resumeRun(saved);
        },
        onQuick: () => this.quickMenu(),
        onCollection: () => this.collection(),
        onCalm: (on) => {
          this.meta.calm = on;
          saveMeta(this.meta);
          this.title();
        },
        onSettings: () => this.openSettings(() => this.title()),
        homeHint: this.touch && this.fullscreenState() === null && !matchMedia('(display-mode: standalone)').matches && /iPhone|iPad|iPod/.test(navigator.userAgent),
      }),
    );
  }

  private collection(): void {
    this.showScreen(collectionView(this.meta, { onBack: () => this.title() }));
  }

  private selCar(): ReturnType<typeof newCar> {
    const car = newCar(1, this.sel.body, CAR_BODY_NAMES[this.sel.body], this.sel.paint);
    car.style.driver = this.sel.driver;
    return car;
  }

  private pickScreen(): void {
    // a car locked since (cleaned meta) falls back to the rally car
    if (!unlockedBodies(this.meta.trophies).includes(this.sel.body)) this.sel.body = 'hatch';
    this.showScreen(
      pickView(this.meta, this.sel, {
        onChange: () => this.preview?.update(this.selCar()),
        onStart: (s) => this.beginRun(s),
        onBack: () => this.title(),
      }),
    );
    const box = this.card.querySelector<HTMLElement>('.rg-preview');
    if (box) void this.mountPreview(box, this.selCar());
  }

  private beginRun(s: PickSel): void {
    this.disposePreview();
    this.meta.body = s.body;
    this.meta.driver = s.driver;
    this.meta.paint = s.paint;
    saveMeta(this.meta);
    clearRun();
    this.commit(newRun({ seed: newSeed(), calm: this.meta.calm, body: s.body, driver: s.driver, paint: s.paint, trophies: this.meta.trophies }));
  }

  private resumeRun(r: RunState): void {
    this.mode = 'run';
    this.runState = r;
    this.showRun();
  }

  /** Takes the new state of the run: saves it, notes the trinkets seen, ends the run when it is over. */
  private commit(r: RunState): void {
    const prev = this.runState && this.runState.seed === r.seed ? this.runState : null;
    this.mode = 'run';
    this.runState = r;
    // a new trinket: the fanfare
    const had = new Map(prev?.trinkets.map((t) => [t.id, t.n]));
    const got = r.trinkets.find((t) => t.n > (had.get(t.id) ?? 0));
    const seen = new Set(this.meta.seen);
    const before = seen.size;
    r.trinkets.forEach((t) => seen.add(t.id));
    if (r.screen?.kind === 'shop') r.screen.stock.forEach((i) => seen.add(i.id));
    if (r.screen?.kind === 'reward') r.screen.choices.forEach((i) => seen.add(i));
    if (seen.size !== before) {
      this.meta.seen = [...seen];
      saveMeta(this.meta);
    }
    if (r.status === 'running') saveRun(r);
    else this.endRun(r);
    this.showRun();
    if (got && prev && trinketCount(r) > trinketCount(prev)) this.fanfare(got.id);
  }

  /** NY PRYL! A banner, confetti and a little tune over the next screen. */
  private fanfare(id: string): void {
    const d = trinketById(id);
    if (!d) return;
    sfx.fanfare(this.audio, this.master);
    pryl(this.card, d.emoji, d.name);
  }

  /** Draws whatever the run is doing now: the map, or the node it is in. */
  private showRun(): void {
    const r = this.runState;
    if (!r) return this.title();
    this.stopGame();
    this.set('menu');
    this.stage.replaceChildren();
    if (r.status !== 'running' && r.screen?.kind !== 'postrace') return this.showOver(r);
    const scr = r.screen;
    const next = (fn: (x: RunState) => RunState) => () => this.commit(fn(r));
    const act = (fn: (x: RunState) => unknown) => () => {
      const c = structuredClone(r);
      fn(c);
      this.commit(c);
    };
    if (!scr) {
      this.showScreen(
        mapView({
          run: r,
          onEnter: (id) => this.commit(enterNode(r, id)),
          onBag: () => this.showScreen(bagView(r, { onClose: () => this.showRun() })),
          onMenu: () => this.mapMenu(r),
        }),
      );
      return;
    }
    switch (scr.kind) {
      case 'prerace':
        this.showScreen(preraceView(r, { onGo: () => void this.start(), onBack: next(backToMap) }));
        break;
      case 'postrace':
        this.showScreen(postraceView(r, scr, { onNext: () => (r.status !== 'running' ? this.showOver(r) : this.commit(continueAfterRace(r))), onCount: () => sfx.tick(this.audio, this.master) }));
        if (scr.summary.finished && scr.summary.place === 1) {
          sfx.win(this.audio, this.master);
          confettiRain(this.card, 110, 2.4);
        }
        break;
      case 'reward':
        this.showScreen(rewardView(r, scr, { onPick: (i) => this.commit(pickReward(r, i)) }));
        break;
      case 'shop':
        this.showScreen(
          shopView(r, scr, {
            onBuy: (i) => act((c) => buyTrinket(c, i))(),
            onHeal: act(buyHeart),
            onRepair: act(buyRepair),
            onReroll: act(reroll),
            onLeave: next(finishNode),
            note: '',
          }),
        );
        break;
      case 'workshop':
        this.showScreen(
          workshopView(r, scr, {
            onUpgrade: (p) => act((c) => workshopUpgrade(c, p))(),
            onRepair: act(workshopRepair),
            onPaint: (col) => act((c) => workshopPaint(c, col))(),
            onLeave: next(finishNode),
          }),
        );
        break;
      case 'event':
        this.showScreen(eventView(r, scr, { onChoose: (i) => this.commit(chooseEvent(r, i)), onNext: next(finishNode) }));
        break;
    }
  }

  private mapMenu(r: RunState): void {
    this.showScreen(menuView(r, { onClose: () => this.showRun(), onTitle: () => this.title(), onSettings: () => this.openSettings(() => this.mapMenu(r)) }));
  }

  /** The run is over (lost or won): the trophies go to the meta progress once (the run remembers it in `end`), and the run stays saved until its summary has been left, so a reload shows it again. */
  private endRun(r: RunState): void {
    if (r.end) return;
    const won = r.status === 'won';
    const gain = trophiesFor({ bossesBeaten: r.stats.bossesBeaten, won, races: r.stats.races });
    const old = this.meta.trophies;
    const total = old + gain;
    const bodies = unlockedBodies(total).filter((b) => BODY_UNLOCK[b] > old);
    const trinkets = unlockedTrinkets(total)
      .filter((t) => t.unlock > old)
      .map((t) => t.id);
    const seen = new Set(this.meta.seen);
    trinkets.forEach((id) => seen.add(id));
    this.meta = { ...this.meta, trophies: total, runs: this.meta.runs + 1, wins: this.meta.wins + (won ? 1 : 0), bestAct: Math.max(this.meta.bestAct, won ? 3 : r.act + 1), seen: [...seen] };
    r.end = { won, trophies: gain, total, unlockedBodies: bodies, unlockedTrinkets: trinkets };
    saveMeta(this.meta);
    saveRun(r);
  }

  private showOver(r: RunState): void {
    this.endRun(r);
    this.stage.replaceChildren();
    const leave = (next: () => void) => () => {
      clearRun();
      next();
    };
    this.showScreen(overView(r, r.end!, { onAgain: leave(() => this.pickScreen()), onTitle: leave(() => this.title()) }));
    if (r.end!.won) {
      sfx.win(this.audio, this.master);
      confettiRain(this.card, 160, 3.2);
    }
  }

  private runOptions(run: RunState): RallyOptions {
    const plan = currentPlan(run)!;
    const node = currentNode(run)!;
    return {
      rules: plan.rules,
      car: run.car,
      seed: node.seed,
      mods: buildMods(run.trinkets, run.car.body),
      twist: plan.twist,
      coins: true,
      onDone: (res) => {
        this.result = res;
      },
    };
  }

  /** The race of the run is over (or was cut short by a test): apply it and show how it went. */
  private raceDone(res: RallyResult | null): void {
    const r = this.runState;
    if (!r) return;
    this.result = null;
    this.stopGame();
    const result: RallyResult = res ?? { place: 9, n: 4, finished: false, time: 0, laps: 0, kronor: 10, coins: 0, medal: null, damage: 0 };
    this.commit(submitRace(r, result));
  }

  // ---- hooks for tests (and curious grown-ups): reached through window.__app ----

  /** Ends the race in progress at once with a made-up result (the real race is far too slow to wait for in a software-GL test). */
  fakeFinish(partial: Partial<RallyResult> = {}): void {
    if (this.mode !== 'run' || !this.runState || (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'loading')) return;
    const n = this.opts?.rules.ai ? this.opts.rules.ai + 1 : 4;
    this.raceDone({ place: 1, n, finished: true, time: 95000, laps: 2, kronor: 120, coins: 10, medal: 'silver', damage: 0, ...partial });
  }

  /** The run now, and a way to change it (kronor, hearts…) before the next screen. */
  debugRun(fn?: (r: RunState) => void): RunState | null {
    if (this.runState && fn) {
      const c = structuredClone(this.runState);
      fn(c);
      this.commit(c);
    }
    return this.runState;
  }

  /** Puts the run at a node of this type (anywhere on this act's map) and enters it. */
  debugEnter(type: NodeType): boolean {
    if (!this.runState) return false;
    const r = structuredClone(this.runState);
    const nodes = allNodes(mapOf(r));
    const node = nodes.find((n) => n.type === type);
    if (!node) return false;
    r.screen = null;
    r.at = nodes.find((n) => n.next.includes(node.id))?.id ?? null;
    this.commit(enterNode(r, node.id));
    return true;
  }

  debugMeta(fn?: (m: Meta) => void): Meta {
    if (fn) {
      fn(this.meta);
      saveMeta(this.meta);
    }
    return this.meta;
  }

  // ---- keys and focus ----

  private onKey = (e: KeyboardEvent): void => {
    if (e.type === 'keydown' && e.code === 'Escape' && !e.repeat) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      e.preventDefault();
      return;
    }
    if (this.state !== 'playing') {
      if (e.type === 'keydown' && (this.state === 'menu' || this.state === 'paused' || this.state === 'result') && arrowNav(this.card, e)) e.preventDefault();
      return;
    }
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
