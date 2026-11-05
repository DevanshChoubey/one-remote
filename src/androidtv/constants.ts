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
/** Every `remote_voice_payload` carries exactly this many bytes of audio (1.28 s at 8 kHz; a short
 *  last one is zero-padded). More closes the connection; with 8 KB messages a Sharp Android TV and
 *  the Airtel box both opened the assistant and recognised nothing (androidtvremote2 issue 49). */
export const VOICE_CHUNK = 20480;
/** How often, after the hold ends, a message of silence goes out while the TV listens on. */
export const VOICE_TRAIL_EVERY_MS = 1280;
/** The longest the silence goes on when the TV never says it heard the end of the speech. */
export const VOICE_TRAIL_MAX_MS = 8000;
/** How long after the TV heard the end the session is closed (closing at once cancels the search). */
export const VOICE_END_AFTER_MS = 2000;

/** The part of the TV transport the Android TV code uses. */
export type AtvTransport = Pick<
  TvTransport,
  'openStream' | 'mdnsBrowse' | 'probe' | 'sendWol' | 'onWifi' | 'ensureIdentity' | 'deleteIdentity'
>;
