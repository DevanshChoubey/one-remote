import type { TvTransport } from '@/tv/transport';

export const PAIR_PORT = 6467;
export const REMOTE_PORT = 6466;
export const SERVICE_TYPE = '_androidtvremote2._tcp';
export const CERT_REF = 'androidtv:identity';
export const CLIENT_NAME = 'One Remote';
export const DEFAULT_NAME = 'Android TV';
/** PING|KEY|IME|VOICE|POWER|VOLUME = 1+2+4+8+32+64. No APP_LINK (non-goal). */
export const FEATURES = 111;
/** The `VOICE` feature bit. */
export const FEATURE_VOICE = 8;
/** `remote_voice_payload` messages carry at most this many bytes of audio... */
export const VOICE_CHUNK_MAX = 20480;
/** ...and the TV (a Shield did not accept less) wants at least this many, so short ones are padded. */
export const VOICE_CHUNK_MIN = 8192;

/** The part of the TV transport the Android TV code uses. */
export type AtvTransport = Pick<
  TvTransport,
  'openStream' | 'mdnsBrowse' | 'probe' | 'sendWol' | 'onWifi' | 'ensureIdentity' | 'deleteIdentity'
>;
