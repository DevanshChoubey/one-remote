/** One open WebSocket to a TV. `onClose` fires when the connection ends for any reason other than
 *  the caller's own `close()`. */
export interface TvSocket {
  send(text: string): void;
  close(): void;
  onMessage(cb: (text: string) => void): void;
  onClose(cb: () => void): void;
}

/** Everything the webOS client needs from the network. Implemented by `src/transport/tvTransport.ts`
 *  and faked by `src/webos/testing/fakeLan.ts`. */
export interface TvTransport {
  /** Rejects DeviceError('notSent') on refusal or after timeoutMs; 'notLocal' from assertLocal. */
  open(url: string, timeoutMs: number): Promise<TvSocket>;
  ssdpSearch(
    message: string,
    windowMs: number,
    onReply: (text: string, fromHost: string) => void,
  ): Promise<void>;
  probe(
    ports: number[],
    perHostMs: number,
    onOpen: (host: string, port: number) => void,
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
