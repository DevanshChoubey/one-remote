/** How a `wss://` socket trusts the TV's self-signed certificate. `pairing` accepts any certificate
 *  and reports its SHA-256 (trust on first use); `pinSha256` accepts only that certificate. A
 *  `wss://` open with neither is refused (`notPaired`). Ignored for `ws://`. */
export interface TvTls {
  pinSha256?: string;
  pairing?: boolean;
}

/** One open WebSocket to a TV. `onClose` fires when the connection ends for any reason other than
 *  the caller's own `close()`. */
export interface TvSocket {
  /** The TV's leaf certificate SHA-256 (lower-case hex), for `wss://` sockets. */
  readonly certSha256?: string;
  send(text: string): void;
  close(): void;
  onMessage(cb: (text: string) => void): void;
  onClose(cb: () => void): void;
}

/** One open TLS byte stream to a TV. `onClose` fires when the stream ends for any reason other than
 *  the caller's own `close()`. */
export interface TvStream {
  /** The TV's leaf certificate SHA-256 (lower-case hex). */
  readonly certSha256: string;
  /** The TV's leaf certificate RSA public key, upper-case hex, no leading zeros. */
  readonly serverModulusHex: string;
  readonly serverExponentHex: string;
  /** The TV's leaf certificate subject, RFC 2253 form. */
  readonly serverSubject: string;
  /** Throws DeviceError('notSent') once the stream has ended. */
  write(bytes: Uint8Array): void;
  close(): void;
  onData(cb: (bytes: Uint8Array) => void): void;
  onClose(cb: () => void): void;
}

/** Everything the webOS client needs from the network. Implemented by `src/transport/tvTransport.ts`
 *  and faked by `src/webos/testing/fakeLan.ts`. */
export interface TvHttpRequest {
  method: 'GET' | 'POST' | 'PUT';
  /** `http://` or `https://` to a literal local IP. */
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** https only: `pairing` (trust on first use) or `pinSha256`; neither is refused (`notPaired`). */
  pinSha256?: string;
  pairing?: boolean;
  timeoutMs: number;
  /** Default 262144; a larger response body fails. An integer from 1 to 64 MiB, else 'notSent'. */
  maxBytes?: number;
}

export interface TvHttpResponse {
  status: number;
  /** Lower-case names. */
  headers: Record<string, string>;
  body: string;
  /** The TV's leaf certificate SHA-256 (lower-case hex), for https. */
  certSha256?: string;
}

/** The public half of a client identity: RSA modulus and exponent, upper-case hex, no leading zeros. */
export interface TvIdentity {
  modulusHex: string;
  exponentHex: string;
}

export interface TvTransport {
  /** Rejects DeviceError('notSent') on refusal or after timeoutMs; 'notLocal' from assertLocal;
   *  'notPaired' for a `wss://` certificate that is not the pinned one, or no pin outside pairing. */
  open(url: string, timeoutMs: number, tls?: TvTls): Promise<TvSocket>;
  /** A TLS byte stream to `host:port`; the errors are those of `open`. `identity` is the ref of a
   *  client identity to present as the TLS client certificate. */
  openStream(
    host: string,
    port: number,
    timeoutMs: number,
    tls: TvTls & { identity?: string },
  ): Promise<TvStream>;
  /** Makes this phone's TLS client identity `ref` (RSA-2048 key and self-signed certificate with CN
   *  `commonName`) in secure storage, or returns the existing one unchanged. The private key never
   *  leaves the device's key store. Rejects 'notSent' when it cannot be made. */
  ensureIdentity(ref: string, commonName: string): Promise<TvIdentity>;
  /** Removes client identity `ref`. Idempotent. Rejects 'notSent' when the key store fails. */
  deleteIdentity(ref: string): Promise<void>;
  /** One HTTP(S) request. `timeoutMs` is capped at 60 s. Redirects are not followed (a 3xx is returned), no proxy, no cookies.
   *  The errors are those of `open`; 'notSent' also for a body over `maxBytes`. */
  request(req: TvHttpRequest): Promise<TvHttpResponse>;
  ssdpSearch(
    message: string,
    windowMs: number,
    onReply: (text: string, fromHost: string) => void,
  ): Promise<void>;
  /** Browses mDNS for `serviceType` (e.g. `_androidtvremote2._tcp`) for `windowMs`, reporting each
   *  service resolved to a local IP. Rejects 'notSent' when the platform cannot browse. */
  mdnsBrowse(
    serviceType: string,
    windowMs: number,
    onService: (s: {
      name: string;
      host: string;
      port: number;
      txt: Record<string, string>;
    }) => void,
  ): Promise<void>;
  probe(
    ports: number[],
    perHostMs: number,
    onOpen: (host: string, port: number) => void,
    /** Polled between hosts: once true, the sweep stops. */
    isCancelled?: () => boolean,
    /** Called once per host, as soon as all its ports are checked, with the ports that were open
     *  (not called for a host with none). Lets callers act before the whole sweep ends. */
    onHost?: (host: string, openPorts: number[]) => void,
  ): Promise<void>;
  /** To the subnet broadcast, port 9. */
  sendWol(packet: Uint8Array): Promise<void>;
  onWifi(): Promise<boolean>;
}

/** The part of `SecretStore` (`src/store`) that the webOS code uses. */
export interface TvSecrets {
  get(ref: string): Promise<string | null>;
  set(ref: string, value: string): Promise<void>;
}

/** What the webOS driver needs to also forget a TV's secrets when it is removed. */
export interface TvSecretsWithDelete extends TvSecrets {
  delete(ref: string): Promise<void>;
}
