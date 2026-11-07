// The contract between the shell (src/main.ts) and a game: a game is a GameFactory that gets a
// GameContext, plays ONE run (a race) and calls ctx.end(score) when it is over. The shell pauses and
// resumes it (pause button, Escape, the tab hidden) and destroys it when the player leaves.
import type { Input } from './input.ts';

export interface GameContext {
  /**
   * Fills the screen (it may be resized at any time: watch it with a ResizeObserver). Put your canvas
   * in here, and listen for pointer events on your own elements, never on window or document.
   */
  root: HTMLElement;
  /** Keyboard, gamepad and the on-screen touch buttons as one controller. Keys only reach the game through this. */
  input: Input;
  /** Web Audio: connect everything to `out` (the shell mutes it). Null when the browser has no audio. */
  audio: AudioContext | null;
  out: AudioNode | null;
  /** The player, to dress the car in their colours. */
  player: { name: string; color: string };
  /** A touch screen: the shell shows the game's touch buttons; prefer big, forgiving controls. */
  touch: boolean;
  /** 'low' on phones and small tablets: fewer particles, no shadows, a lower pixel ratio. */
  quality: 'high' | 'low';
  /** The pixel ratio to render at (already capped for the quality). */
  dpr: number;
  /**
   * The run is over: whole points 0..99 999, higher is better. `detail` is one short Swedish line for
   * the result card, like "1:a plats · 2:31,4".
   */
  end(score: number, detail?: string): void;
  /** Ask the shell to pause (shows the pause card), e.g. when the mouse lock was lost. */
  requestPause(): void;
  /** The player's controls, live (the settings panel may change them between races). */
  controls?: ControlsState;
  /** The race reports how charged the vehicle's ability is (0..1) and whether it is ready, for the ring on the touch button. */
  abilityHud?: (charge: number, ready: boolean) => void;
  /** Game-specific options from whoever starts the game (a RallyOptions for the rally). */
  options?: unknown;
}

export interface GameInstance {
  /** Stop the clock, the music and the sound effects (keep the picture). */
  pause(): void;
  /** Carry on from where it paused (do not count the paused time). */
  resume(): void;
  /** Stop everything for good: cancel animation frames and timers, stop sounds, dispose WebGL and remove your elements. */
  destroy(): void;
}

/** What the race needs to know about how this player drives: set by the shell, read every frame. */
export interface ControlsState {
  /** Gas and brake are the player's own (touch Pedaler / Proffs); false: the car gasses by itself on a touch screen. */
  pedals: boolean;
  /** The player shifts the gears. */
  manual: boolean;
  /** Buzz the phone on shifts and hits. */
  haptics: boolean;
}

export type GameFactory = (ctx: GameContext) => GameInstance;

/**
 * A controller button. Keyboard: arrows/WASD, A = Space/Z/J, B = X/K/Shift, C = C/L, Start = Enter. `sd` / `su` shift
 * down and up (Q / E, LB / RB, the − and + buttons) and `x` is the vehicle's ability (F, gamepad Y, the ability button).
 */
export type Button = 'left' | 'right' | 'up' | 'down' | 'a' | 'b' | 'c' | 'x' | 'sd' | 'su' | 'start';

/** The touch controls drawn over the game on touch screens. */
export interface TouchLayout {
  /** Left thumb: 'dpad' four arrows, 'leftright' two big arrows, 'stick' an analog stick, 'none' nothing. */
  pad: 'dpad' | 'leftright' | 'stick' | 'none';
  /** Right thumb: up to three round buttons. */
  buttons: { button: Button; label: string }[];
}
