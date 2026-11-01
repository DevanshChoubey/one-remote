import type { Capabilities, Command, Device, Link, LinkKind, Reported } from './model';

export type Unsubscribe = () => void;

/** A live voice session with a TV. */
export interface VoiceSession {
  /** PCM16 LE mono 8 kHz. Throws DeviceError('notSent') once the session is gone. */
  push(pcm: Uint8Array): void;
  end(): void;
}

export interface LinkDriver {
  readonly kind: LinkKind;
  /** Quick, synchronous: false when this phone can't use the link at all (e.g. no IR emitter). */
  available(): boolean;
  supports(device: Device, link: Link, cmd: Command): boolean;
  capabilities(device: Device, link: Link): Capabilities;
  /** Resolves once the command was handed to the device. Throws DeviceError:
   *  'notSent' when it surely did not go out (socket closed, host unreachable),
   *  'timeout' when it may have gone out.
   *  The hub aborts `signal` when it gives up waiting (its timeout), so a send is never made late:
   *  a driver should refuse to start once it is aborted, and stop between keys of a multi-key
   *  sequence (throwing 'partiallySent' if some went out). Drivers may ignore it. */
  send(device: Device, link: Link, cmd: Command, signal?: AbortSignal): Promise<void>;
  /** Optional cleanup when the device is removed: delete this link's secrets, leave the fabric,
   *  drop per-node data. Best effort and idempotent, so a later retry is safe. A failure is logged
   *  and never blocks the removal. */
  forget?(device: Device, link: Link): Promise<void>;
  /** Optional: opens a voice session with the TV (Android TV). Rejects DeviceError('notSent') when
   *  the TV does not start one. */
  startVoice?(device: Device, link: Link): Promise<VoiceSession>;
  /** Optional live state (webOS, Matter). */
  observe?(device: Device, link: Link, cb: (r: Reported) => void): Unsubscribe;
}
