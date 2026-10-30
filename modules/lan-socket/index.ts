import { requireNativeModule, type EventSubscription } from 'expo';

/**
 * `lan-socket`: WebSockets to a literal private, link-local or loopback IP only, with the TLS trust
 * chosen per socket. Imported only by `src/transport` (lint enforces it).
 *
 * - `ws://` opens a plain socket.
 * - `wss://` with `pairing: true` and no pin accepts the server's certificate (trust on first use)
 *   and resolves with the leaf certificate's SHA-256 (lower-case hex).
 * - `wss://` with `pinSha256` accepts only a leaf certificate with that SHA-256.
 * - `wss://` with neither is refused. Host names are never verified in the two TLS cases: the
 *   server is reached by IP and identified by its pinned certificate instead.
 *
 * The default TLS trust of the app is never changed.
 */
export interface LanOpenOptions {
  pinSha256?: string;
  pairing?: boolean;
  timeoutMs: number;
}

export interface LanOpenResult {
  /** The leaf certificate's SHA-256, lower-case hex; wss only. */
  certSha256?: string;
}

export interface LanMessageEvent {
  id: string;
  data: string;
}

/** The socket ended. Not sent for a socket whose `open` rejected, nor after `close(id)`. */
export interface LanCloseEvent {
  id: string;
  code?: number;
  reason?: string;
  error?: string;
}

/** Codes an `open` rejection carries in `code`. */
export const LAN_ERRORS = {
  /** The host is not a literal private, link-local or loopback IP, or the URL is not ws/wss. */
  notLocal: 'ERR_LAN_NOT_LOCAL',
  /** wss without a pin and outside pairing. */
  noTrust: 'ERR_LAN_NO_TRUST',
  /** The leaf certificate's SHA-256 is not the pinned one. */
  pinMismatch: 'ERR_LAN_PIN_MISMATCH',
  /** Anything else (refused, reset, timed out, TLS failure...). The message says which. */
  openFailed: 'ERR_LAN_OPEN_FAILED',
} as const;

export interface LanSocketNative {
  /** `id` is chosen by the caller, so a pending open can be cancelled with `close(id)`. */
  open(id: string, url: string, opts: LanOpenOptions): Promise<LanOpenResult>;
  /** Throws when the socket is not open. */
  send(id: string, text: string): void;
  /** Closes (or cancels the open of) the socket. Unknown ids are ignored. */
  close(id: string): void;
  addListener(event: 'message', cb: (e: LanMessageEvent) => void): EventSubscription;
  addListener(event: 'close', cb: (e: LanCloseEvent) => void): EventSubscription;
}

let native: LanSocketNative | undefined;

/** The native module, loaded on first use (constructing services must not touch native code). */
export function lanSocket(): LanSocketNative {
  native ??= requireNativeModule<LanSocketNative>('LanSocket');
  return native;
}
