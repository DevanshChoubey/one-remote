import type { Unsubscribe } from './driver';
import type { Link } from './model';

/** The one opt-in cloud link. */
export type MiraieLink = Extract<Link, { kind: 'miraie' }>;

/**
 * Why a MirAIe step failed, for the screens to word:
 * - `badPhone`: not a 10-digit Indian mobile number (checked on the phone, nothing sent);
 * - `badLogin`: MirAIe refused the number and password;
 * - `notRegistered`: MirAIe has no account for that number;
 * - `offline`: MirAIe could not be reached (no internet, timeout, server error);
 * - `signedOut`: no MirAIe sign-in on this phone, or it expired and signing in again failed;
 * - `off`: the cloud connection is turned off in Settings.
 */
export type MiraieErrorCode =
  'badPhone' | 'badLogin' | 'notRegistered' | 'offline' | 'signedOut' | 'off';

export class MiraieError extends Error {
  readonly code: MiraieErrorCode;

  constructor(code: MiraieErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'MiraieError';
    this.code = code;
    Object.setPrototypeOf(this, MiraieError.prototype);
  }
}

/** One AC of the signed-in MirAIe account. */
export interface MiraieAc {
  deviceId: string;
  homeId: string;
  topic: string;
  /** The name given in the MirAIe app. */
  name: string;
  /** The MirAIe room ("space"), when it has one. */
  space?: string;
}

export interface MiraieStatus {
  /** The opt-in switch in Settings. Off by default; on only after a sign-in worked. */
  enabled: boolean;
  /** The signed-in number, masked for display (e.g. `+91 98•••••210`). */
  account?: string;
  /** On, but the saved sign-in stopped working: the user has to sign in again. */
  needsSignIn: boolean;
}

/** What screens may use for the opt-in MirAIe cloud connection. */
export interface MiraieSetup {
  status(): MiraieStatus;
  subscribe(cb: () => void): Unsubscribe;
  /** Signs in and, when that works, turns the connection on. Rejects MiraieError. */
  signIn(phone: string, password: string): Promise<void>;
  /** Turns the connection off and deletes the saved sign-in. Never rejects. */
  disconnect(): Promise<void>;
  /** The ACs of the account. Rejects MiraieError. */
  listAcs(): Promise<MiraieAc[]>;
}

/**
 * A MirAIe login id from what the user typed: a 10-digit Indian mobile number, with or without
 * `+91`/`91`/`0`, spaces and dashes. Returns `+91XXXXXXXXXX`, or null when it is not one.
 */
export function normalizeMiraiePhone(input: string): string | null {
  const compact = input.replace(/[\s()-]/g, '');
  const m = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact);
  return m ? `+91${m[1]}` : null;
}

/** `+919812345210` → `+91 98•••••210`. */
export function maskMiraiePhone(phone: string): string {
  const m = /^\+91(\d{2})\d{5}(\d{3})$/.exec(phone);
  return m ? `+91 ${m[1]}•••••${m[2]}` : '•••';
}

export function miraieLinkOf(ac: MiraieAc): MiraieLink {
  return { kind: 'miraie', deviceId: ac.deviceId, homeId: ac.homeId, topic: ac.topic };
}
