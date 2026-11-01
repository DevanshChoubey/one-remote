import type { Dictation } from '../dictation';

export interface FakeDictation extends Dictation {
  /** How many times `start` was called, and how many of those were stopped. */
  starts: number;
  stops: number;
  /** True between a `start` and its `stop`. */
  readonly active: boolean;
  /** What the next `stop` resolves with. */
  text: string;
  /** The next `stop` rejects with this. */
  failWith(e: Error): void;
  /** What `available()` answers. */
  setAvailable(v: boolean): void;
}

export function createFakeDictation(available = true): FakeDictation {
  let isAvailable = available;
  let failure: Error | undefined;
  let running = 0;
  const d: FakeDictation = {
    starts: 0,
    stops: 0,
    text: '',
    get active() {
      return running > 0;
    },
    available: () => Promise.resolve(isAvailable),
    start() {
      d.starts += 1;
      running += 1;
      return {
        stop() {
          running -= 1;
          d.stops += 1;
          if (failure) {
            const e = failure;
            failure = undefined;
            return Promise.reject(e);
          }
          return Promise.resolve(d.text);
        },
      };
    },
    failWith: (e) => {
      failure = e;
    },
    setAvailable: (v) => {
      isAvailable = v;
    },
  };
  return d;
}
