import type { Device, Link } from './model';
import type { Unsubscribe } from './driver';

/** A TV seen on the network, before it is paired. */
export interface FoundTv {
  host: string;
  name: string;
  secure: boolean;
  usn?: string;
}

export type PairErrorCode = 'denied' | 'timeout' | 'unreachable';

export class PairError extends Error {
  readonly code: PairErrorCode;

  constructor(code: PairErrorCode) {
    super(code);
    this.name = 'PairError';
    this.code = code;
    Object.setPrototypeOf(this, PairError.prototype);
  }
}

export interface PairedTv {
  link: Extract<Link, { kind: 'webos' }>;
  suggestedName: string;
}

/** What the Add TV flow and the TV connection actions use. Implemented in `src/webos/setup.ts`. */
export interface TvSetup {
  discover(onFound: (tv: FoundTv) => void): Unsubscribe;
  /** Throws DeviceError('notLocal') for an address that is not on the home network. */
  probeHost(host: string): Promise<FoundTv | null>;
  pair(tv: FoundTv, onPrompt: () => void, clientKeyRef?: string): Promise<PairedTv>;
  /** The TV's new host, or null when it was not found. */
  findAgain(device: Device): Promise<string | null>;
  /** Dev-only: every SSAP frame in and out, for the hardware spike. Absent unless wired. */
  onFrame?(cb: (f: TvFrame) => void): Unsubscribe;
}

/** One SSAP frame (or connection event) seen on the wire. */
export interface TvFrame {
  dir: 'in' | 'out' | 'open';
  text: string;
  at: number;
}
