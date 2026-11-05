/**
 * What the MirAIe connection needs from the network. Implemented by `src/transport/cloud.ts` (the
 * app's only internet code, limited to the MirAIe hosts and to when the opt-in is on) and faked by
 * `./testing/fakeCloud.ts`.
 */

export interface CloudRequest {
  method: 'GET' | 'POST';
  /** `https://` to one of the allowed MirAIe hosts. */
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export interface CloudResponse {
  status: number;
  body: string;
}

/** One TLS byte stream. `onClose` fires once when it ends for any reason but the caller's `close()`. */
export interface CloudStream {
  /** Throws once the stream has ended. */
  write(bytes: Uint8Array): void;
  close(): void;
  onData(cb: (bytes: Uint8Array) => void): void;
  onClose(cb: () => void): void;
}

/** Codes a CloudNet rejection carries. */
export type CloudNetErrorCode =
  /** The opt-in is off: nothing was sent. */
  | 'off'
  /** Not an allowed host, scheme or port: nothing was sent. */
  | 'notAllowed'
  /** The certificate is not the MirAIe host's: the stream was closed before anything was sent. */
  | 'badCertificate'
  /** Refused, unreachable, timed out, reset. */
  | 'failed';

export class CloudNetError extends Error {
  readonly code: CloudNetErrorCode;

  constructor(code: CloudNetErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CloudNetError';
    this.code = code;
    Object.setPrototypeOf(this, CloudNetError.prototype);
  }
}

export interface CloudNet {
  /** Rejects CloudNetError. Never follows redirects; sends no cookies. */
  request(req: CloudRequest): Promise<CloudResponse>;
  /** A TLS stream, verified against the system CAs and the host name. Rejects CloudNetError. */
  openTls(host: string, port: number, timeoutMs: number): Promise<CloudStream>;
}
