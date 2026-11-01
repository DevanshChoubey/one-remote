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
  ssdpSearch(
    message: string,
    windowMs: number,
    onReply: (text: string, fromHost: string) => void,
  ): Promise<void>;
  probe(
    ports: number[],
    perHostMs: number,
    onOpen: (host: string, port: number) => void,
    /** Polled between hosts: once true, the sweep stops. */
    isCancelled?: () => boolean,
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
