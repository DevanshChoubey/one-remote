export const INFO_PORT = 8001;
export const WSS_PORT = 8002;
/** The name the TV shows in its Allow prompt and its device list. */
export const APP_NAME = 'One Remote';

/** Base64 of an ASCII string (APP_NAME). */
const APP_NAME_B64 = btoa(APP_NAME);

function hostPart(host: string): string {
  return host.includes(':') ? `[${host}]` : host;
}

/** The remote-control channel. `token` is added only when non-empty. */
export function socketUrl(host: string, token: string): string {
  const base = `wss://${hostPart(host)}:${String(WSS_PORT)}/api/v2/channels/samsung.remote.control?name=${encodeURIComponent(APP_NAME_B64)}`;
  return token ? `${base}&token=${encodeURIComponent(token)}` : base;
}

/** The TV's plain-HTTP info page. */
export function infoUrl(host: string): string {
  return `http://${hostPart(host)}:${String(INFO_PORT)}/api/v2/`;
}
