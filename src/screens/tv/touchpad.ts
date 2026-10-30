import type { TvKey } from '@/core';

export interface TouchpadOpts {
  /** Distance of one step. */
  stepPx: number;
  /** A touch that moves less than this can still be a tap. */
  tapSlopPx: number;
  /** A tap is over within this long. */
  tapMs: number;
  /** Holding still this long after a swipe starts repeating its last key. */
  holdMs: number;
  /** Repeat interval while holding. */
  repeatMs: number;
}

const DEFAULTS: TouchpadOpts = {
  stepPx: 48,
  tapSlopPx: 10,
  tapMs: 250,
  holdMs: 400,
  repeatMs: 120,
};

export interface Touchpad {
  start(x: number, y: number, t: number): void;
  /** One key per `stepPx` along the dominant axis. */
  move(x: number, y: number, t: number): TvKey[];
  /** Holding still after a swipe repeats its last key. */
  tick(t: number): TvKey[];
  /** `['ok']` for a tap. */
  end(x: number, y: number, t: number): TvKey[];
}

/** Turns a finger's path into key presses. Pure: the caller feeds it points and times. */
export function createTouchpad(o: Partial<TouchpadOpts> = {}): Touchpad {
  const opts = { ...DEFAULTS, ...o };
  let down = false;
  let startX = 0;
  let startY = 0;
  let startT = 0;
  let anchorX = 0;
  let anchorY = 0;
  let strayed = false;
  let lastKey: TvKey | null = null;
  let lastKeyT = 0;
  let repeated = 0;

  return {
    start(x, y, t) {
      down = true;
      startX = anchorX = x;
      startY = anchorY = y;
      startT = t;
      strayed = false;
      lastKey = null;
      repeated = 0;
    },
    move(x, y, t) {
      if (!down) return [];
      if (Math.hypot(x - startX, y - startY) > opts.tapSlopPx) strayed = true;
      const dx = x - anchorX;
      const dy = y - anchorY;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const steps = Math.floor(Math.abs(horizontal ? dx : dy) / opts.stepPx);
      if (steps < 1) return [];
      const key: TvKey = horizontal ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      // Advance by whole steps and drop the sideways drift, so the next step starts clean.
      const travelled = steps * opts.stepPx;
      anchorX = horizontal ? anchorX + Math.sign(dx) * travelled : x;
      anchorY = horizontal ? y : anchorY + Math.sign(dy) * travelled;
      lastKey = key;
      lastKeyT = t;
      repeated = 0;
      return Array<TvKey>(steps).fill(key);
    },
    tick(t) {
      if (!down || lastKey === null) return [];
      const due = Math.floor((t - lastKeyT - opts.holdMs) / opts.repeatMs);
      if (due <= repeated) return [];
      const n = due - repeated;
      repeated = due;
      return Array<TvKey>(n).fill(lastKey);
    },
    end(_x, _y, t) {
      if (!down) return [];
      down = false;
      return !strayed && t - startT <= opts.tapMs ? ['ok'] : [];
    },
  };
}

const TICK_MS = 40;

export interface PadController {
  setHandler(onKey: (k: TvKey) => void): void;
  begin(x: number, y: number): void;
  update(x: number, y: number): void;
  finish(x: number, y: number): void;
  /** A still tap (from a tap gesture): OK. */
  tap(): void;
  /** The gesture was cancelled: no key, not even OK. */
  cancel(): void;
  stop(): void;
}

/** Drives a touchpad from gesture callbacks and a timer for hold-to-repeat. */
export function createPadController(now: () => number = Date.now): PadController {
  const pad = createTouchpad();
  let handler: (k: TvKey) => void = () => undefined;
  let timer: ReturnType<typeof setInterval> | null = null;
  const emit = (keys: TvKey[]): void => keys.forEach((k) => handler(k));
  const stop = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  return {
    setHandler: (fn) => {
      handler = fn;
    },
    begin(x, y) {
      stop();
      pad.start(x, y, now());
      timer = setInterval(() => emit(pad.tick(now())), TICK_MS);
    },
    update: (x, y) => emit(pad.move(x, y, now())),
    finish(x, y) {
      stop();
      emit(pad.end(x, y, now()));
    },
    tap: () => emit(['ok']),
    cancel() {
      stop();
      pad.end(0, 0, now());
    },
    stop,
  };
}
