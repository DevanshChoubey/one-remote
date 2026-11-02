import { requireNativeModule, type EventSubscription } from 'expo';

/**
 * `mic-pcm`: microphone capture as PCM16 little-endian mono chunks. It has no network code; it is
 * imported only by `src/voice` (lint enforces it).
 *
 * `start(sampleRate)` begins capture and emits `chunk` events (base64 PCM, about every 100 ms)
 * until `stop()`. It throws when the permission is missing or the mic is busy. `stop()` is
 * idempotent. On iOS the audio session is `.record` while capturing and deactivated on stop.
 */
export interface ChunkEvent {
  base64: string;
}

export interface MicPcmNative {
  /** Asks for the microphone permission if needed; resolves false when denied. */
  requestPermission(): Promise<boolean>;
  start(sampleRate: number): void;
  stop(): void;
  addListener(event: 'chunk', cb: (e: ChunkEvent) => void): EventSubscription;
}

let native: MicPcmNative | undefined;

/** The native module, loaded on first use (constructing services must not touch native code). */
export function micPcm(): MicPcmNative {
  native ??= requireNativeModule<MicPcmNative>('MicPcm');
  return native;
}
