import { requireNativeModule, type EventSubscription } from 'expo';

/**
 * `lan-socket`: WebSockets and TLS byte streams to a literal private, link-local or loopback IP
 * only, with the TLS trust chosen per socket. Imported only by `src/transport` (lint enforces it).
 *
 * - `ws://` opens a plain socket.
 * - `wss://` with `pairing: true` and no pin accepts the server's certificate (trust on first use)
 *   and resolves with the leaf certificate's SHA-256 (lower-case hex).
 * - `wss://` with `pinSha256` accepts only a leaf certificate with that SHA-256.
 * - `wss://` with neither is refused. Host names are never verified in the two TLS cases: the
 *   server is reached by IP and identified by its pinned certificate instead.
 *
 * Redirects are refused, no proxy is used, and only the checked IP literal is ever dialled. The
 * default TLS trust of the app is never changed.
 *
 * `openStream` opens a raw TLS byte stream (TLS only; there is no plain stream) with the same trust
 * rules: `pairing` (trust on first use) or `pinSha256`, else `ERR_LAN_NO_TRUST`. With `identity`,
 * the client identity stored under `lan-identity:<ref>` (Android Keystore alias, iOS Keychain tag)
 * is presented as the client certificate; a missing one is `ERR_LAN_OPEN_FAILED`. Bytes travel as
 * base64 and arrive as `data` events, in order. A stream shares the id space, `close(id)` and the
 * `close` event with WebSockets.
 *
 * `request` is a one-shot HTTP(S) request to a literal local IP with the same trust rules (https
 * needs `pairing` or `pinSha256`, else `ERR_LAN_NO_TRUST`). Redirects are never followed (a 3xx is
 * returned as-is), no proxy and no cookies are used, and a body over `maxBytes` fails with
 * `ERR_LAN_OPEN_FAILED`. Response header names are lower-case.
 */
export interface LanOpenOptions {
  pinSha256?: string;
  pairing?: boolean;
  /** A discovery probe: runs in its own small pool so a subnet sweep cannot delay real connects. */
  probe?: boolean;
  timeoutMs: number;
}

export interface LanOpenResult {
  /** The leaf certificate's SHA-256, lower-case hex; wss only. */
  certSha256?: string;
}

export interface LanStreamOptions {
  pinSha256?: string;
  pairing?: boolean;
  /** Ref of a client identity made by `ensureIdentity` (Task 8); presented as the TLS client cert. */
  identity?: string;
  timeoutMs: number;
}

export interface LanStreamOpenResult {
  certSha256: string;
  /** Server leaf certificate RSA public key, upper-case hex, no leading zeros. */
  serverModulusHex: string;
  serverExponentHex: string;
  /** Server leaf certificate subject, RFC 2253 form (Android TV puts its MAC in the CN). */
  serverSubject: string;
}

export interface LanRequest {
  method: 'GET' | 'POST' | 'PUT';
  /** `http://` or `https://` to a literal local IP. */
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** https only; neither `pinSha256` nor `pairing` means refused (`ERR_LAN_NO_TRUST`). */
  pinSha256?: string;
  pairing?: boolean;
  timeoutMs: number;
  /** Default 262144; a larger response body fails. */
  maxBytes?: number;
}

export interface LanResponse {
  status: number;
  /** Lower-case names; repeated headers joined with ", ". */
  headers: Record<string, string>;
  body: string;
  /** The leaf certificate's SHA-256, lower-case hex; https only. */
  certSha256?: string;
}

export interface LanDataEvent {
  id: string;
  base64: string;
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
  /** `id` is chosen by the caller, as for `open`. */
  openStream(
    id: string,
    host: string,
    port: number,
    opts: LanStreamOptions,
  ): Promise<LanStreamOpenResult>;
  /** Queues the bytes on a stream. Throws when the stream is not open. */
  write(id: string, base64: string): void;
  /** One-shot HTTP(S) request; rejects with a `LAN_ERRORS` code. */
  request(req: LanRequest): Promise<LanResponse>;
  /** Closes (or cancels the open of) the socket or stream. Unknown ids are ignored. */
  close(id: string): void;
  addListener(event: 'message', cb: (e: LanMessageEvent) => void): EventSubscription;
  addListener(event: 'data', cb: (e: LanDataEvent) => void): EventSubscription;
  addListener(event: 'close', cb: (e: LanCloseEvent) => void): EventSubscription;
}

let native: LanSocketNative | undefined;

/** The native module, loaded on first use (constructing services must not touch native code). */
export function lanSocket(): LanSocketNative {
  native ??= requireNativeModule<LanSocketNative>('LanSocket');
  return native;
}
