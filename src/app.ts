// The front end around the rally game: title screen, course and car pick, the race, pause and the result
// screen. Plain DOM. It builds the GameContext (input, audio, quality, touch) and starts the rally with a
// RallyOptions; the race reports its result through options.onDone and ctx.end.
import { Input } from './arcade/input.ts';
import type { Button, ControlsState, GameContext, GameFactory, GameInstance } from './arcade/types.ts';
import { BUTTON_MAP, clampRect, deviceClass, hasPedals, hudZones, isManual, keyHowTo, layoutRects, posFromRect, posKey, SCHEME_NAMES, touchHowTo, visibleButtons, type BtnId, type ControlPrefs, type Rect, type Safe } from './controls.ts';
import { canVibrate } from './haptics.ts';
import { rallyNeeds } from './rally/info.ts';
import type { RallyOptions, RallyResult } from './rally/options.ts';
import { CAR_BODIES, CAR_PAINTS, RALLY_COURSES, RALLY_COURSE_DEFS, defaultRules, newCar, type CarBody, type RallyCourse } from './shared/rally.ts';
import { CAR_BODY_NAMES, RALLY_COURSE_NAMES } from './shared/names.ts';
import { loadPrefs, savePrefs, type Prefs } from './prefs.ts';
import { fmtTime } from './rally/util.ts';
import { buildMods } from './run/trinkets.ts';
import type { RaceKind } from './shared/kinds.ts';
import { chooseEvent, continueAfterRace, currentNode, currentPlan, enterNode, finishNode, pickReward, submitRace, backToMap } from './run/flow.ts';
import { buyHeart, buyRepair, buyTrinket, reroll, workshopPaint, workshopRepair, workshopUpgrade } from './run/economy.ts';
import { trophiesFor, unlockedBodies, unlockedTrinkets, type Meta } from './run/meta.ts';
import { checkChallenges } from './run/unlocks.ts';
import { kitOf } from './shared/abilities.ts';
import { newSeed } from './run/rng.ts';
import { allNodes, type NodeType } from './run/map.ts';
import { clearRun, loadMeta, loadRun, saveMeta, saveRun } from './run/save.ts';
import { mapOf, newRun, trinketCount, type RunState } from './run/state.ts';
import { btn, arrowNav, el } from './ui/dom.ts';
import { confettiRain, pryl, sfx, upplast } from './ui/juice.ts';
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
  /** How charged the vehicle's ability is, for the ring on its touch button. */
  private abil = { charge: 1, ready: true };
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
        if (this.state === 'playing' && this.opts) this.buildTouch();
      },
      true,
    );
    // the page never scrolls or zooms
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('gesturestart', (e) => e.preventDefault());
    this.deviceSetup();
    this.applySettings();
    this.syncControls();
    // turning the device or resizing the window: the buttons find their places again
    let relayout = 0;
    const redo = (): void => {
      cancelAnimationFrame(relayout);
      relayout = requestAnimationFrame(() => {
        if (this.editor) this.openEditor(this.editorDone);
        else if (this.state === 'playing' || this.state === 'paused') this.buildTouch();
      });
    };
    window.addEventListener('resize', redo);
    window.addEventListener('orientationchange', redo);
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
  private editorDone: () => void = () => {};

  /** The how-to lines for what is chosen: the scheme on a touch screen, the shifting on a keyboard. */
  private howTo(): string[] {
    return this.touch ? touchHowTo(this.ctl) : keyHowTo(isManual(this.ctl, false));
  }

  /** The settings panel; `back` redraws whatever it was opened from. */
  private openSettings(back: () => void): void {
    this.settingsBack = back;
    this.showScreen(
      settingsView({
        settings,
        calm: this.meta.calm,
        fullscreen: this.fullscreenState(),
        controls: this.ctl,
        touch: this.touch,
        canVibrate: canVibrate(),
        onControls: () => this.saveControls(),
        onEditLayout: () => {
          this.editorDone = () => this.openSettings(back);
          this.openEditor(this.editorDone);
        },
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
    const how = el('ul', 'arc-how', ...this.howTo().map((l) => el('li', null, l)));

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
    this.abil = { charge: 1, ready: true };
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
    this.buildTouch();
    let ended = false;
    const dprCap = this.quality === 'low' ? 1.5 : 2;
    const ctx: GameContext = {
      root: this.stage,
      input: this.input,
      audio: this.audio,
      out: this.master,
      player: { name: 'Du', color: this.opts.car.style.paint },
      touch: this.touch,
      controls: this.cstate,
      quality: this.quality,
      dpr: Math.min(window.devicePixelRatio || 1, dprCap),
      options: this.opts,
      abilityHud: (charge, ready) => {
        this.abil = { charge, ready };
        this.paintAbility();
      },
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
    this.buildTouch();
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
    if (!unlockedBodies(this.meta).includes(this.sel.body)) this.sel.body = 'hatch';
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
    this.commit(newRun({ seed: newSeed(), calm: this.meta.calm, body: s.body, driver: s.driver, paint: s.paint, trophies: this.meta.trophies, progress: this.meta.progress }));
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
    // the challenges that open vehicles: checked after every step of the run (the end of the run checks again)
    const chk = checkChallenges(this.meta, r);
    if (chk.steps.length || chk.unlocked.length) {
      this.meta = chk.meta;
      saveMeta(this.meta);
      for (const c of chk.unlocked) if (!r.opened.includes(c.body)) r.opened.push(c.body);
    }
    if (r.status === 'running') saveRun(r);
    else this.endRun(r);
    this.showRun();
    if (got && prev && trinketCount(r) > trinketCount(prev)) this.fanfare(got.id);
    for (const c of chk.unlocked) {
      sfx.fanfare(this.audio, this.master);
      upplast(this.card, kitOf(c.body).active.emoji, CAR_BODY_NAMES[c.body], c.title);
    }
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
    // the end of the run counts for the challenges that add up over runs (once: `end` guards it)
    const chk = checkChallenges(this.meta, r, true);
    const bodies = [...new Set([...r.opened, ...chk.unlocked.map((c) => c.body)])];
    const trinkets = unlockedTrinkets(total)
      .filter((t) => t.unlock > old)
      .map((t) => t.id);
    const seen = new Set(this.meta.seen);
    trinkets.forEach((id) => seen.add(id));
    this.meta = { ...chk.meta, trophies: total, runs: this.meta.runs + 1, wins: this.meta.wins + (won ? 1 : 0), bestAct: Math.max(this.meta.bestAct, won ? 3 : r.act + 1), seen: [...seen] };
    r.opened = bodies;
    r.end = { won, trophies: gain, total, unlockedBodies: bodies, unlockedTrinkets: trinkets, progress: { ...this.meta.progress } };
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
    // dev builds only: a test can force the course of the next race
    const forced = import.meta.env.DEV ? (window as unknown as { __forceCourse?: RallyCourse }).__forceCourse : undefined;
    return {
      rules: forced ? { ...plan.rules, course: forced } : plan.rules,
      car: run.car,
      seed: node.seed,
      mods: buildMods(run.trinkets, run.car.body),
      twist: plan.twist,
      field: plan.field,
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
  debugEnter(type: NodeType, kind?: RaceKind): boolean {
    if (!this.runState) return false;
    const r = structuredClone(this.runState);
    const nodes = allNodes(mapOf(r));
    const node = nodes.find((n) => n.type === type && (!kind || n.kind === kind)) ?? nodes.find((n) => n.type === type);
    if (!node) return false;
    // a test can ask for a kind the map did not roll for this node
    if (kind && node.type !== 'boss') node.kind = kind;
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

  /** The live controls state the race reads every frame (ctx.controls). */
  private cstate: ControlsState = { pedals: false, manual: false, haptics: false };
  /** The editor for the touch layout, when it is open. */
  private editor: HTMLElement | null = null;

  private get ctl(): ControlPrefs {
    return this.prefs.controls;
  }

  /** Works out what the race needs from the saved choices and this device. */
  private syncControls(): void {
    this.cstate.pedals = hasPedals(this.ctl, this.touch);
    this.cstate.manual = isManual(this.ctl, this.touch);
    this.cstate.haptics = this.touch && this.ctl.haptics && canVibrate();
  }

  private saveControls(): void {
    savePrefs(this.prefs);
    this.syncControls();
  }

  /** The safe-area insets in css px (notches, the home bar). */
  private safe(): Safe {
    const probe = el('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    this.root.append(probe);
    const cs = getComputedStyle(probe);
    const out = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    probe.remove();
    return out;
  }

  /** A button that is held: its own pointer is captured, so a thumb sliding off keeps it pressed and other thumbs stay independent. */
  private hold(node: HTMLElement, b: Button, extra?: { move?(e: PointerEvent): void; start?(e: PointerEvent): void }): void {
    let id = -1;
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (id !== -1) return;
      id = e.pointerId;
      try {
        node.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone
      }
      node.classList.add('down');
      this.input.touchButton(b, true);
      extra?.start?.(e);
    };
    const up = (e: PointerEvent): void => {
      e.stopPropagation();
      if (e.pointerId !== id) return;
      id = -1;
      node.classList.remove('down');
      this.input.touchButton(b, false);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) extra?.move?.(e);
    });
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', up);
  }

  /** A tap that presses a controller button for one frame (the shift buttons, a swipe on the pedal). */
  private tap(b: Button): void {
    this.input.touchButton(b, true);
    setTimeout(() => this.input.touchButton(b, false), 60);
  }

  private visibleIds(): BtnId[] {
    const need = this.opts ? rallyNeeds(this.opts) : { nitro: false, ability: false };
    return visibleButtons(this.ctl.scheme, { ...need, manual: this.cstate.manual });
  }

  private buildTouch(): void {
    this.touchEl.replaceChildren();
    this.input.touchStickMove(0, 0);
    this.syncControls();
    if (!this.touch) return;
    const need = this.opts ? rallyNeeds(this.opts) : { nitro: false, ability: false };
    const r = this.root.getBoundingClientRect();
    const device = deviceClass(r.width, r.height);
    const c = this.ctl;
    this.touchEl.style.setProperty('--tbo', String(c.opacity));
    const rects = layoutRects({ w: r.width, h: r.height, safe: this.safe(), scheme: c.scheme, size: c.size, lefty: c.lefty, pos: c.pos[posKey(device, c.scheme)], show: this.visibleIds() });
    for (const rc of rects) this.touchEl.append(this.touchButton(rc, need.nitro));
    this.paintAbility();
  }

  /** One on-screen button for a rectangle of the layout. */
  private touchButton(rc: Rect, hasNitro: boolean): HTMLElement {
    const c = this.ctl;
    const pedal = c.scheme !== 'easy';
    const word = rc.id === 'gas' ? 'GAS' : rc.id === 'brake' && pedal ? 'BROMS' : '';
    const kit = this.opts ? kitOf(this.opts.car.body) : null;
    const label: Record<BtnId, string> = { left: '◀', right: '▶', hand: '🌀', gas: 'GAS', brake: pedal ? 'BROMS' : '▼', nitro: hasNitro ? '🔥' : '🎥', ability: kit?.active.emoji ?? '✨', shiftDn: '−', shiftUp: '+' };
    const k = el('div', `arc-tb tb-${rc.id}${word ? ' word' : ''}`, label[rc.id]);
    k.dataset.btn = rc.id;
    k.style.cssText = `left:${rc.x}px;top:${rc.y}px;width:${rc.w}px;height:${rc.h}px;font-size:${Math.round(rc.w * (word ? 0.22 : 0.4))}px`;
    k.setAttribute('role', 'button');
    k.setAttribute('aria-label', { left: 'Styr vänster', right: 'Styr höger', hand: 'Handbroms', gas: 'Gas', brake: 'Broms', nitro: hasNitro ? 'Nitro' : 'Byt kamera', ability: kit ? `Förmåga: ${kit.active.name}` : 'Förmåga', shiftDn: 'Växla ned', shiftUp: 'Växla upp' }[rc.id]);
    if (rc.id === 'gas' && this.cstate.manual) {
      // a swipe up or down on the pedal shifts too, with the thumb still on the gas
      let y0 = 0;
      let armed = true;
      this.hold(k, 'up', {
        start: (e) => {
          y0 = e.clientY;
          armed = true;
        },
        move: (e) => {
          const dy = e.clientY - y0;
          if (armed && Math.abs(dy) > 38) {
            armed = false;
            this.tap(dy < 0 ? 'su' : 'sd');
          } else if (!armed && Math.abs(dy) < 12) armed = true;
        },
      });
    } else if (rc.id === 'left' || rc.id === 'right') {
      // a thumb sliding from one steer button onto the other changes direction without lifting
      const mine = rc.id;
      let cur: 'left' | 'right' = mine;
      this.hold(k, mine, {
        start: () => (cur = mine),
        move: (e) => {
          const other = this.touchEl.querySelector<HTMLElement>(`.tb-${mine === 'left' ? 'right' : 'left'}`);
          if (!other) return;
          const ob = other.getBoundingClientRect();
          const over = e.clientX >= ob.left && e.clientX <= ob.right && e.clientY >= ob.top - 30 && e.clientY <= ob.bottom + 30;
          const mb = k.getBoundingClientRect();
          const home = e.clientX >= mb.left && e.clientX <= mb.right;
          const want = over ? (mine === 'left' ? 'right' : 'left') : home ? mine : cur;
          if (want !== cur) {
            this.input.touchButton(cur, false);
            this.input.touchButton(want, true);
            cur = want;
          }
        },
      });
      // the original button is released by hold(); make sure the sibling is too
      const release = (): void => {
        if (cur !== mine) {
          this.input.touchButton(cur, false);
          cur = mine;
        }
      };
      k.addEventListener('pointerup', release);
      k.addEventListener('pointercancel', release);
      k.addEventListener('lostpointercapture', release);
    } else this.hold(k, BUTTON_MAP[rc.id]);
    return k;
  }

  /** The charge ring and the ready glow on the ability button. */
  private paintAbility(): void {
    const b = this.touchEl.querySelector<HTMLElement>('.tb-ability');
    if (!b) return;
    b.style.setProperty('--charge', String(this.abil.charge));
    b.classList.toggle('ready', this.abil.ready);
  }

  // ---- the layout editor (Inställningar → Flytta knappar) ----

  private openEditor(done: () => void): void {
    this.closeEditor();
    const c = this.ctl;
    const ed = el('div', 'arc-edit');
    this.editor = ed;
    const r = this.root.getBoundingClientRect();
    const device = deviceClass(r.width, r.height);
    const key = posKey(device, c.scheme);
    const safe = this.safe();
    const hud = hudZones(r.width, r.height, safe);
    const draw = (): void => {
      ed.replaceChildren();
      const bar = el('div', 'arc-edit-bar');
      const title = el('div', 'arc-edit-title', `Flytta knappar · ${SCHEME_NAMES[c.scheme]} · ${device === 'tablet' ? 'surfplatta' : 'mobil'}`);
      const reset = btn('arc-btn', 'Återställ', () => {
        delete c.pos[key];
        this.saveControls();
        draw();
      });
      const ok = btn('arc-go', 'Klart', () => {
        this.closeEditor();
        done();
      });
      bar.append(title, el('div', 'arc-edit-sub', 'Dra knapparna dit tummarna vill ha dem.'), reset, ok);
      ed.append(bar);
      for (const [name, z] of [['Minikarta', hud.minimap], ['Hastighet', hud.speedo]] as const) {
        const zone = el('div', 'arc-edit-zone', name);
        zone.style.cssText = `left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px`;
        ed.append(zone);
      }
      // every button of the scheme, even the ones a car may not have today, so each can be placed
      const all: BtnId[] = visibleButtons(c.scheme, { nitro: true, ability: true, manual: true });
      for (const rc of layoutRects({ w: r.width, h: r.height, safe, scheme: c.scheme, size: c.size, lefty: c.lefty, pos: c.pos[key], show: all })) {
        const labels: Record<BtnId, string> = { left: '◀', right: '▶', hand: '🌀', gas: 'GAS', brake: c.scheme === 'easy' ? '▼' : 'BROMS', nitro: '🔥', ability: '✨', shiftDn: '−', shiftUp: '+' };
        const word = rc.id === 'gas' || (rc.id === 'brake' && c.scheme !== 'easy');
        const k = el('div', `arc-tb tb-${rc.id} edit${word ? ' word' : ''}`, labels[rc.id]);
        k.style.cssText = `left:${rc.x}px;top:${rc.y}px;width:${rc.w}px;height:${rc.h}px;font-size:${Math.round(rc.w * (word ? 0.22 : 0.4))}px`;
        let off: [number, number] | null = null;
        let id = -1;
        k.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (id !== -1) return;
          id = e.pointerId;
          k.setPointerCapture(e.pointerId);
          const b = k.getBoundingClientRect();
          off = [e.clientX - b.left, e.clientY - b.top];
          k.classList.add('down');
        });
        k.addEventListener('pointermove', (e) => {
          if (e.pointerId !== id || !off) return;
          const box = ed.getBoundingClientRect();
          const moved = clampRect({ id: rc.id, x: e.clientX - box.left - off[0], y: e.clientY - box.top - off[1], w: rc.w, h: rc.h }, r.width, r.height, safe);
          k.style.left = `${moved.x}px`;
          k.style.top = `${moved.y}px`;
        });
        const end = (e: PointerEvent): void => {
          if (e.pointerId !== id) return;
          id = -1;
          k.classList.remove('down');
          const cur: Rect = { id: rc.id, x: parseFloat(k.style.left), y: parseFloat(k.style.top), w: rc.w, h: rc.h };
          const set = (c.pos[key] ??= {});
          set[rc.id] = posFromRect(cur, r.width, r.height, c.lefty, safe);
          this.saveControls();
        };
        k.addEventListener('pointerup', end);
        k.addEventListener('pointercancel', end);
        ed.append(k);
      }
    };
    draw();
    this.card.style.visibility = 'hidden';
    this.root.append(ed);
  }

  private closeEditor(): void {
    this.editor?.remove();
    this.editor = null;
    this.card.style.visibility = '';
  }
}
