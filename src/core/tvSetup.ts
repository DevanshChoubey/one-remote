import type { Device } from './model';
import type { TvLink, TvLinkKind } from './tvLink';
import type { Unsubscribe } from './driver';

/** A TV seen on the network, before it is paired. */
export interface FoundTv {
  kind: TvLinkKind;
  host: string;
  name: string;
  secure: boolean;
  usn?: string;
}

export interface PairPrompts {
  /** The TV shows an Allow prompt (LG, Samsung). */
  onAllow(): void;
  /** The TV shows a code. Resolves the typed code, or null when the user went back.
   *  `wrong` is true after a code the TV refused. */
  askCode(wrong: boolean): Promise<string | null>;
}

export type PairErrorCode = 'denied' | 'timeout' | 'unreachable' | 'cancelled';

export class PairError extends Error {
  readonly code: PairErrorCode;

  constructor(code: PairErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'PairError';
    this.code = code;
    Object.setPrototypeOf(this, PairError.prototype);
  }
}

export interface PairedTv {
  link: TvLink;
  suggestedName: string;
}

/** What the Add TV flow and the TV connection actions use. Implemented in `src/webos/setup.ts`. */
export interface TvSetup {
  discover(onFound: (tv: FoundTv) => void): Unsubscribe;
  /** Throws DeviceError('notLocal') for an address that is not on the home network. */
  probeHost(host: string): Promise<FoundTv | null>;
  /** `reuse`: the device's current link when pairing again (keeps its secret refs). */
  pair(tv: FoundTv, prompts: PairPrompts, reuse?: TvLink): Promise<PairedTv>;
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
