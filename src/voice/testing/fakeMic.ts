import type { Mic, MicSession } from '../mic';

export interface FakeMic extends Mic {
  /** The sample rates of each `start`, in order. */
  readonly starts: number[];
  /** How many sessions were stopped. */
  stops: number;
  /** True while a session is running. */
  readonly active: boolean;
  /** Delivers a chunk to the running session; ignored when none runs. */
  emit(chunk: Uint8Array): void;
  /** The next `requestPermission` answers false. */
  denyPermission(): void;
  /** The next `start` throws, as a busy mic does. */
  failNextStart(): void;
}

export function createFakeMic(): FakeMic {
  let onChunk: ((pcm: Uint8Array) => void) | undefined;
  let granted = true;
  let failStart = false;
  const mic: FakeMic = {
    starts: [],
    stops: 0,
    get active() {
      return onChunk !== undefined;
    },
    requestPermission: () => Promise.resolve(granted),
    start(sampleRate, cb) {
      if (failStart) {
        failStart = false;
        throw new Error('The microphone is busy');
      }
      if (!granted) throw new Error('No microphone permission');
      mic.starts.push(sampleRate);
      onChunk = cb;
      const session: MicSession = {
        stop() {
          if (onChunk !== cb) return;
          onChunk = undefined;
          mic.stops += 1;
        },
      };
      return session;
    },
    emit: (chunk) => onChunk?.(chunk),
    denyPermission: () => {
      granted = false;
    },
    failNextStart: () => {
      failStart = true;
    },
  };
  return mic;
}
