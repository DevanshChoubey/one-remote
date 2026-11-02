import { micPcm } from '../../modules/mic-pcm';

export interface MicSession {
  stop(): void;
}

export interface Mic {
  /** Asks for permission if needed; resolves false when denied. */
  requestPermission(): Promise<boolean>;
  /** Starts capture: PCM16 little-endian mono at `sampleRate`, delivered as chunks. Throws when
   *  the mic is busy or permission is missing. */
  start(sampleRate: number, onChunk: (pcm: Uint8Array) => void): MicSession;
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The phone's microphone, through the `mic-pcm` native module. */
export function createNativeMic(): Mic {
  return {
    async requestPermission() {
      try {
        return await micPcm().requestPermission();
      } catch {
        return false;
      }
    },
    start(sampleRate, onChunk) {
      const native = micPcm();
      const sub = native.addListener('chunk', (e) => onChunk(fromBase64(e.base64)));
      try {
        native.start(sampleRate);
      } catch (e) {
        sub.remove();
        throw e;
      }
      let stopped = false;
      return {
        stop() {
          if (stopped) return;
          stopped = true;
          sub.remove();
          native.stop();
        },
      };
    },
  };
}
