import type { TvTransport } from '@/tv/transport';

export const PAIR_PORT = 6467;
export const REMOTE_PORT = 6466;
export const SERVICE_TYPE = '_androidtvremote2._tcp';
export const CERT_REF = 'androidtv:identity';
export const CLIENT_NAME = 'One Remote';
export const DEFAULT_NAME = 'Android TV';
/** PING|KEY|IME|POWER|VOLUME = 1+2+4+32+64. No VOICE, APP_LINK (non-goals). */
export const FEATURES = 103;

/** The part of the TV transport the Android TV code uses. */
export type AtvTransport = Pick<
  TvTransport,
  'openStream' | 'mdnsBrowse' | 'probe' | 'sendWol' | 'onWifi' | 'ensureIdentity' | 'deleteIdentity'
>;
